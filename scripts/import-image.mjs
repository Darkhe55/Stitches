/**
 * 缝线（Stitches）—— 从题图自动导入题库
 *
 * 用法：
 *   node scripts/import-image.mjs <图片路径> [--name 名称] [--id ID] [--series 系列]
 *                                 [--append] [--verify] [--dry]
 *                                 [--map 簇号=数字,...] [--budget 节点数]
 *
 * 流程：
 *   1. Playwright + Edge 打开图片到 canvas，取像素；
 *   2. 深色像素投影找网格线 → 棋盘行列数；
 *   3. 逐条格线测量线宽，k-means 分成「细网格线 / 粗区域边界」，
 *      再按粗边界四连通洪泛出区域矩阵；
 *   4. 棋盘上方/左侧的行列数字：连通域切字 → 归一化 → 与内置粗体数字模板做 IoU，
 *      自动识别 0..9 并拼接多位数（识别簇可用 --map 人工覆盖）；
 *   5. 统计相邻区域对数与针孔总数，推算变体「每对相邻区域需要 K 条缝线」（1÷ / 3÷ …）；
 *   6. --verify 求解并校验唯一解（超时只警告）；预览；--append 写入题库（含 k 字段）。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { findSolution, countSolutions } from '../src/game/solver.ts'
import { checkSolution } from '../src/game/rules.ts'
import { buildEdges, edgeCount, encodeCounts, encodeEdges, encodeRegions } from '../src/game/types.ts'

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

function findEdge() {
  for (const p of EDGE_CANDIDATES) if (existsSync(p)) return p
  throw new Error('找不到 Microsoft Edge，可用环境变量 EDGE_PATH 指定 msedge.exe 路径')
}

function usage(msg) {
  console.error(`[缝线识图] ${msg}`)
  console.error(
    '用法：node scripts/import-image.mjs <图片路径> [--name 名称] [--id ID] [--series 系列] [--append] [--verify] [--dry] [--k 变体K] [--map 簇号=数字] [--budget 节点数]',
  )
  process.exit(1)
}

function parseArgs(argv) {
  const out = { file: null, name: null, id: null, series: '识图', append: false, verify: false, dry: false, maps: {}, budget: 0, k: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) usage(`参数 ${a} 缺少值`)
      return v
    }
    if (a === '--name') out.name = next()
    else if (a === '--id') out.id = next()
    else if (a === '--series') out.series = next()
    else if (a === '--append') out.append = true
    else if (a === '--verify') out.verify = true
    else if (a === '--dry') out.dry = true
    else if (a === '--budget') out.budget = Math.max(1000, Number(next()) || 0)
    else if (a === '--k') {
      const v = Number(next())
      if (!Number.isInteger(v) || v < 1 || v > 9) usage('--k 应为 1..9 的整数')
      out.k = v
    } else if (a === '--map') {
      for (const token of next().split(',')) {
        const m = /^(\d+)=(\d)$/.exec(token.trim())
        if (!m) usage(`--map 格式应为 簇号=数字，收到「${token}」`)
        out.maps[Number(m[1])] = Number(m[2])
      }
    } else if (!a.startsWith('--')) {
      if (out.file) usage(`多余参数 ${a}`)
      out.file = a
    } else usage(`未知参数 ${a}`)
  }
  if (!out.file) usage('请指定图片路径')
  return out
}

/* ───────────── 内置数字模板（24×24，覆盖常见粗体无衬线字体） ───────────── */
const DIGIT_FONTS = ['Verdana', 'Tahoma', 'Arial', 'Segoe UI', 'DejaVu Sans', 'Arial Black', 'Calibri']
const DIGIT_WEIGHTS = ['600', '700', '800', '900']

const args = parseArgs(process.argv.slice(2))
const imagePath = path.resolve(args.file)
if (!existsSync(imagePath)) usage(`找不到图片：${imagePath}`)

const dataUrl = `data:image/png;base64,${readFileSync(imagePath).toString('base64')}`
const browser = await chromium.launch({ headless: true, executablePath: findEdge() })
const page = await browser.newPage()
await page.setContent('<canvas id="c"></canvas>')

const detected = await page.evaluate(async ({ dataUrl }) => {
  const N = 24
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const W = img.naturalWidth
  const H = img.naturalHeight
  const cv = document.getElementById('c')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, W, H).data
  const dark = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false
    const i = (y * W + x) * 4
    return d[i] < 110 && d[i + 1] < 110 && d[i + 2] < 110
  }
  const colCount = new Int32Array(W)
  const rowCount = new Int32Array(H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(x, y)) { colCount[x]++; rowCount[y]++ }
  const peaks = (counts, min) => {
    const out = []
    let st = -1
    for (let i = 0; i <= counts.length; i++) {
      const on = i < counts.length && counts[i] >= min
      if (on && st < 0) st = i
      if (!on && st >= 0) { out.push((st + i - 1) / 2); st = -1 }
    }
    return out
  }
  const xs = peaks(colCount, H * 0.5)
  const ys = peaks(rowCount, W * 0.5)
  const w = xs.length - 1
  const h = ys.length - 1
  if (w < 3 || h < 3) throw new Error(`网格线识别失败：竖线 ${xs.length} 条、横线 ${ys.length} 条`)
  const x0 = xs[0]
  const y0 = ys[0]
  const x1 = xs[w]
  const y1 = ys[h]
  const cellW = (x1 - x0) / w
  const cellH = (y1 - y0) / h
  // 线宽测量：在期望位置附近 ±3px、沿边界多个位置取最大连续深色像素数
  const measure = (expected, along, across, vertical) => {
    let best = 0
    for (let o = -3; o <= 3; o++) {
      for (let k = -2; k <= 2; k += 2) {
        const c = Math.round(expected) + o
        const a = Math.round(along) + k
        let run = 0
        if (vertical) {
          if (dark(c, a)) { run = 1; let n = 1; while (dark(c - n, a)) { run++; n++ } n = 1; while (dark(c + n, a)) { run++; n++ } }
        } else if (dark(a, c)) {
          run = 1
          let n = 1
          while (dark(a, c - n)) { run++; n++ }
          n = 1
          while (dark(a, c + n)) { run++; n++ }
        }
        if (run > best) best = run
      }
    }
    return best
  }
  const vth = []
  const hth = []
  for (let j = 0; j < h; j++) for (let i = 1; i < w; i++) vth.push(measure(x0 + i * cellW, y0 + (j + 0.5) * cellH, cellH, true))
  for (let j = 1; j < h; j++) for (let i = 0; i < w; i++) hth.push(measure(y0 + j * cellH, x0 + (i + 0.5) * cellW, cellW, false))
  const all = vth.concat(hth).sort((a, b) => a - b)
  let c1 = all[Math.floor(all.length * 0.2)]
  let c2 = all[Math.floor(all.length * 0.8)]
  for (let it = 0; it < 40; it++) {
    let s1 = 0, n1 = 0, s2 = 0, n2 = 0
    for (const v of all) { if (Math.abs(v - c1) <= Math.abs(v - c2)) { s1 += v; n1++ } else { s2 += v; n2++ } }
    if (n1) c1 = s1 / n1
    if (n2) c2 = s2 / n2
  }
  const thick = (c1 + c2) / 2
  let vi = 0, hi = 0
  const vwall = Array.from({ length: h }, () => new Uint8Array(w))
  const hwall = Array.from({ length: h }, () => new Uint8Array(w))
  for (let j = 0; j < h; j++) for (let i = 1; i < w; i++) if (vth[vi++] >= thick) vwall[j][i] = 1
  for (let j = 1; j < h; j++) for (let i = 0; i < w; i++) if (hth[hi++] >= thick) hwall[j][i] = 1
  // 洪泛区域
  const regions = new Int32Array(w * h).fill(-1)
  let next = 0
  for (let s = 0; s < w * h; s++) {
    if (regions[s] !== -1) continue
    const id = next++
    regions[s] = id
    const stack = [s]
    while (stack.length) {
      const k = stack.pop()
      const x = k % w
      const y = (k / w) | 0
      if (x > 0 && !vwall[y][x] && regions[k - 1] === -1) { regions[k - 1] = id; stack.push(k - 1) }
      if (x + 1 < w && !vwall[y][x + 1] && regions[k + 1] === -1) { regions[k + 1] = id; stack.push(k + 1) }
      if (y > 0 && !hwall[y][x] && regions[k - w] === -1) { regions[k - w] = id; stack.push(k - w) }
      if (y + 1 < h && !hwall[y + 1][x] && regions[k + w] === -1) { regions[k + w] = id; stack.push(k + w) }
    }
  }
  // 数字切字：棋盘上方每一列、棋盘左侧每一行
  const extractGlyphs = (bx0, by0, bx1, by1) => {
    const comps = []
    const seen = new Uint8Array(W * H)
    for (let y = Math.max(0, by0); y <= Math.min(H - 1, by1); y++) for (let x = Math.max(0, bx0); x <= Math.min(W - 1, bx1); x++) {
      if (!dark(x, y) || seen[y * W + x]) continue
      const stack = [[x, y]]
      seen[y * W + x] = 1
      let minX = x, maxX = x, minY = y, maxY = y, n = 0
      while (stack.length) {
        const [px, py] = stack.pop()
        n++
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, ny = py + dy
          if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1) continue
          if (seen[ny * W + nx] || !dark(nx, ny)) continue
          seen[ny * W + nx] = 1
          stack.push([nx, ny])
        }
      }
      if (n >= 12) comps.push({ minX, maxX, minY, maxY, n })
    }
    comps.sort((a, b) => a.minX - b.minX)
    // 数字是并排的；过滤掉贴边/过大的杂块（例如棋盘边框或文字残片）
    const glyphs = []
    for (const c of comps) {
      const gw = c.maxX - c.minX + 1
      const gh = c.maxY - c.minY + 1
      // 贴到裁剪框边缘的连通块是棋盘边框/其他杂块，不是数字
      if (c.minX <= bx0 + 1 || c.maxX >= bx1 - 1 || c.minY <= by0 + 1 || c.maxY >= by1 - 1) continue
      if (gh < 8 || gh > (by1 - by0) * 1.2) continue
      if (gw > gh * 1.6) continue
      const m = new Array(N * N).fill(0)
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const sx = c.minX + Math.floor((gw * i) / N)
        const sy = c.minY + Math.floor((gh * j) / N)
        m[j * N + i] = dark(sx, sy) ? 1 : 0
      }
      glyphs.push({ m, minX: c.minX, minY: c.minY, maxY: c.maxY })
    }
    return glyphs
  }
  const topNums = []
  for (let i = 0; i < w; i++) topNums.push(extractGlyphs(Math.round(x0 + i * cellW + cellW * 0.1), 0, Math.round(x0 + (i + 1) * cellW - cellW * 0.1), Math.round(y0 - 3)))
  const leftNums = []
  for (let j = 0; j < h; j++) leftNums.push(extractGlyphs(0, Math.round(y0 + j * cellH + cellH * 0.1), Math.round(x0 - 3), Math.round(y0 + (j + 1) * cellH - cellH * 0.1)))
  return {
    W, H, w, h, x0, y0, x1, y1, cellW, cellH,
    thick: Number(thick.toFixed(2)), thin: Number(c1.toFixed(2)), thickWidth: Number(c2.toFixed(2)),
    regions: Array.from(regions), regionCount: next,
    topNums, leftNums,
  }
}, { dataUrl })

/* ───────── 数字模板渲染（在同一个浏览器里完成） ───────── */
const templates = await page.evaluate(({ fonts, weights, N }) => {
  const res = []
  const cv = document.createElement('canvas')
  cv.width = 100
  cv.height = 100
  const g = cv.getContext('2d', { willReadFrequently: true })
  const norm = (raw, G) => {
    let ax0 = G, ay0 = G, ax1 = -1, ay1 = -1
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (raw[j * G + i]) { if (i < ax0) ax0 = i; if (i > ax1) ax1 = i; if (j < ay0) ay0 = j; if (j > ay1) ay1 = j }
    if (ax1 < 0) return null
    const bw = ax1 - ax0 + 1, bh = ay1 - ay0 + 1
    const o = new Array(N * N).fill(0)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) o[j * N + i] = raw[(ay0 + Math.floor((bh * j) / N)) * G + (ax0 + Math.floor((bw * i) / N))] ? 1 : 0
    return o
  }
  for (const font of fonts) for (const weight of weights) for (let digit = 0; digit <= 9; digit++) {
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 100, 100)
    g.fillStyle = '#000'
    g.font = `${weight} 78px "${font}"`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(digit), 50, 50)
    const dd = g.getImageData(0, 0, 100, 100).data
    const G = 36
    const raw = new Array(G * G).fill(0)
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = Math.floor((i * 100) / G)
      const y = Math.floor((j * 100) / G)
      raw[j * G + i] = dd[(y * 100 + x) * 4] < 100 ? 1 : 0
    }
    const m = norm(raw, G)
    if (m) res.push({ font, weight, digit, m })
  }
  return res
}, { fonts: DIGIT_FONTS, weights: DIGIT_WEIGHTS, N: 24 })
await browser.close()

const sim = (a, b) => {
  let inter = 0
  let union = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++
    if (a[i] || b[i]) union++
  }
  return union ? inter / union : 0
}

const { w, h, regionCount } = detected
console.log(
  `[缝线识图] ${path.basename(imagePath)}：棋盘 ${w}×${h}，格子 ${detected.cellW.toFixed(1)}×${detected.cellH.toFixed(1)}px，` +
    `区域 ${regionCount} 个（细线 ${detected.thin}px / 粗线 ${detected.thickWidth}px，阈值 ${detected.thick}）`,
)
if (regionCount < 2) usage('只识别出 1 个区域，粗区域边界可能没识别出来')

/* ───────── 数字 OCR ───────── */
const digitClusters = []
const readNumber = (glyphs, label) => {
  if (!glyphs.length) {
    console.warn(`[缝线识图] 警告：${label} 没识别到数字，按 0 处理`)
    return 0
  }
  const codes = []
  for (const gl of glyphs) {
    const scores = templates
      .map((t) => [t, sim(gl.m, t.m)])
      .sort((a, b) => b[1] - a[1])
    // 字形聚类（同一数字多次出现归入同一簇）
    let cluster = -1
    for (let k = 0; k < digitClusters.length; k++) {
      if (sim(gl.m, digitClusters[k].proto) >= 0.9) { cluster = k; break }
    }
    if (cluster < 0) { digitClusters.push({ proto: gl.m, digit: scores[0][0].digit, count: 1 }); cluster = digitClusters.length - 1 }
    else digitClusters[cluster].count++
    codes.push({ cluster, scores })
  }
  // 多位数：若两个字形明显分离则是两位数（如 10）
  const text = codes
    .map(({ cluster, scores }) => {
      const manual = args.maps[cluster]
      if (manual !== undefined) return String(manual)
      return String(scores[0][0].digit)
    })
    .join('')
  const value = Number(text)
  if (!Number.isFinite(value)) {
    console.warn(`[缝线识图] 警告：${label} 数字识别失败（字形 ${text}），按 0 处理`)
    return 0
  }
  return value
}
const colCounts = detected.topNums.map((glyphs, i) => readNumber(glyphs, `第 ${i + 1} 列`))
const rowCounts = detected.leftNums.map((glyphs, j) => readNumber(glyphs, `第 ${j + 1} 行`))

for (const [k, c] of digitClusters.entries()) {
  const auto = templates.map((t) => [t.digit, sim(c.proto, t.m)]).sort((a, b) => b[1] - a[1])
  const digit = args.maps[k] ?? c.digit
  console.log(`[缝线识图] 数字簇${k} → ${digit}（${args.maps[k] !== undefined ? '人工' : '自动'}，n=${c.count}，IoU ${auto[0][1].toFixed(2)}）`)
}
console.log(`[缝线识图] 列数字（上）：${colCounts.join(' ')}`)
console.log(`[缝线识图] 行数字（左）：${rowCounts.join(' ')}`)
if (process.env.IMPORT_DEBUG) {
  writeFileSync(
    path.resolve('scripts/.import-debug.json'),
    JSON.stringify({ w, h, regions: detected.regions, rowCounts, colCounts }),
  )
  for (let j = 0; j < detected.leftNums.length; j++) console.log('rowglyphs', j, detected.leftNums[j].map((g) => `${g.minX},${g.minY}-${g.maxY}`).join(' | '))
  for (let i = 0; i < detected.topNums.length; i++) console.log('colglyphs', i, detected.topNums[i].map((g) => `${g.minX},${g.minY}-${g.maxY}`).join(' | '))
}

/* ───────── 变体判定与预览 ───────── */
const regions = detected.regions
const pairSet = new Set()
for (const e of buildEdges(regions, w, h)) {
  if (!e.candidate) continue
  const a = regions[e.a]
  const b = regions[e.b]
  pairSet.add(a < b ? `${a}-${b}` : `${b}-${a}`)
}
const pairCount = pairSet.size
const sumRows = rowCounts.reduce((a, b) => a + b, 0)
const sumCols = colCounts.reduce((a, b) => a + b, 0)
const totalStitches = sumRows / 2
const variantK = pairCount > 0 ? totalStitches / pairCount : 0
console.log(
  `[缝线识图] 相邻区域对 ${pairCount} 对，行数字和 ${sumRows} / 列数字和 ${sumCols}，` +
    `推算每对需缝 ${variantK.toFixed(2)} 条线`,
)
if (sumRows !== sumCols) console.warn('[缝线识图] 警告：行/列数字总和不等，OCR 可能有误')
const k = args.k || Math.round(variantK)
if (!args.k && (!(k >= 1 && k <= 9) || Math.abs(variantK - k) > 0.01)) {
  console.error(
    `[缝线识图] 无法判定变体：每对相邻区域需要 ${variantK.toFixed(2)} 条线（应为 1..9 的整数）。` +
      '多为 OCR 数字识别错误；请用 --map 修正数字簇，或用 --k 显式指定变体后重跑。',
  )
  process.exit(2)
}
console.log(`[缝线识图] 变体：${k}÷（每对相邻区域恰好 ${k} 条缝线${args.k ? '，由 --k 指定' : ''}）`)

const puzzle = {
  id: 'preview',
  name: 'preview',
  width: w,
  height: h,
  difficulty: 'hard',
  regions: regions.slice(),
  rowCounts,
  colCounts,
  stitchPerPair: k,
}

console.log('[缝线识图] 区域矩阵：')
for (let y = 0; y < h; y++) console.log('  ' + regions.slice(y * w, y * w + w).map((r) => String(r).padStart(2)).join(' '))

if (args.dry) {
  console.log('[缝线识图] --dry：仅识别，不求解、不写入。')
  process.exit(0)
}

/* ───────── 求解与校验 ───────── */
const area = w * h
const budget = args.budget || (area > 400 ? 4_000_000 : 1_500_000)
const t0 = Date.now()
const sol = findSolution(puzzle, budget)
let solution = ''
if (sol) {
  const chk = checkSolution(sol, puzzle)
  console.log(`[缝线识图] 找到解（${Date.now() - t0}ms，合法=${chk.ok}）`)
  solution = encodeEdges(sol)
  if (args.verify) {
    const counted = countSolutions(puzzle, 2, budget)
    if (counted.timedOut) console.warn('[缝线识图] 警告：唯一性检查超时，未能确认解唯一')
    else if (counted.count > 1) console.warn(`[缝线识图] 警告：解不唯一（至少 ${counted.count} 个）`)
    else console.log('[缝线识图] 唯一解 ✓')
  }
} else {
  console.warn('[缝线识图] 警告：没有求出解（识别可能有误或搜索超时），仍可导入，参考解留空')
}

if (!args.append) {
  console.log('[缝线识图] 预览模式，未写入题库。加 --append 写入 src/game/puzzles-data.ts。')
  process.exit(0)
}

/* ───────── 写入题库 ───────── */
const board = `${encodeRegions(regions)}|${encodeCounts(rowCounts)}|${encodeCounts(colCounts)}`
const id = args.id || `stitches-import-${Date.now().toString(36)}`
const name = args.name || `识图 · ${w}×${h}${k > 1 ? ` · ${k}÷` : ''}`
const solField = solution ? `, solution: ${JSON.stringify(solution)}` : ''
const entry = `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, width: ${w}, height: ${h}, difficulty: 'hard', series: ${JSON.stringify(args.series)}, k: ${k}, board: ${JSON.stringify(board)}${solField} },\n`
const dataFile = path.resolve('src/game/puzzles-data.ts')
if (!existsSync(dataFile)) usage(`找不到题库文件：${dataFile}`)
if (process.env.IMPORT_DEBUG) writeFileSync(path.resolve('scripts/.import-debug.json'), JSON.stringify({ w, h, regions, rowCounts, colCounts }))
let text = readFileSync(dataFile, 'utf8').replace(/\r\n/g, '\n')
const marker = text.lastIndexOf('\n]')
if (marker < 0) usage('puzzles-data.ts 格式异常：找不到结尾 ]')
text = text.slice(0, marker + 1) + '\n' + entry + text.slice(marker + 1)
writeFileSync(dataFile, text)
console.log(`[缝线识图] 已写入 ${dataFile}`)
console.log(`[缝线识图] id=${id}  name=${name}  K=${k}（缝线 ${edgeCount(w, h)} 条边中取 ${totalStitches} 条）`)
console.log('[缝线识图] 注意：npm run gen 会重新生成该文件并覆盖导入内容。')

