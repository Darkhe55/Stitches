import { chromium } from 'playwright-core'
import { PORT } from './_port.mjs'

const executablePath =
  process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
let failures = 0
page.on('pageerror', (e) => errors.push(e.message))

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('svg.board-svg')

const report = await page.evaluate(() => {
  const a = window.__game.adapter
  return a.builtinPuzzles.map((p) => {
    const sol = a.getReferenceSolution(p.id)
    const r = sol ? a.validate(sol, p) : null
    return { id: p.id, name: p.name, solved: r?.solved ?? false }
  })
})
console.log('reference solutions:', report)
if (!report.every((r) => r.solved)) {
  failures++
  console.error('FAIL: 有参考解未通过校验')
}

await page.locator('.puzzle-item', { hasText: '初识缝线' }).first().click()
await page.waitForTimeout(100)
const t0 = Date.now()
await page.click('#btn-logic')
await page.waitForFunction(
  () => {
    const btn = document.querySelector('#btn-logic')
    return btn && !btn.disabled && btn.textContent === '逻辑解题'
  },
  { timeout: 180000 },
)
await page.waitForTimeout(300)
const afterLogic = await page.evaluate(() => {
  const g = window.__game
  const s = g.getSession()
  const r = g.adapter.validate(s.state, s.puzzle)
  return { solved: r.solved, empty: r.empty, status: document.querySelector('#status').textContent }
})
console.log('logic solve ms:', Date.now() - t0, afterLogic)
if (!afterLogic.solved) {
  failures++
  console.error('FAIL: 逻辑解题没有解完')
}

await page.click('#btn-solve')
await page.waitForTimeout(80)
const afterSolve = await page.evaluate(() => {
  const g = window.__game
  const s = g.getSession()
  return { solved: g.adapter.validate(s.state, s.puzzle).solved }
})
console.log('show solution:', afterSolve)
if (!afterSolve.solved) {
  failures++
  console.error('FAIL: 显示解没有通过校验')
}
await page.click('#btn-clear')
await page.waitForTimeout(80)

const afterClear = await page.evaluate(() => {
  const s = window.__game.getSession()
  return s.state.edges.filter((v) => v > 0).length
})
const targetEdge = await page.evaluate(() => {
  const s = window.__game.getSession()
  const p = s.puzzle
  const w = p.width
  const h = p.height
  let idx = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x + 1 < w; x++) {
      const a = y * w + x
      const b = a + 1
      if (p.regions[a] !== p.regions[b] && s.state.edges[idx] === 0) {
        return { index: idx, a, b }
      }
      idx++
    }
  }
  for (let y = 0; y + 1 < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = y * w + x
      const b = a + w
      if (p.regions[a] !== p.regions[b] && s.state.edges[idx] === 0) {
        return { index: idx, a, b }
      }
      idx++
    }
  }
  return null
})
console.log('target edge:', targetEdge, 'drawn before:', afterClear)
const box = await page.locator('svg.board-svg').boundingBox()
const metrics = await page.evaluate(() => window.__game.adapter.metricsFor(window.__game.getSession().puzzle))
const ox = metrics.originX ?? metrics.pad
const oy = metrics.originY ?? metrics.pad
const cell = metrics.cellW ?? metrics.cell
const ax = ox + ((targetEdge.a % metrics.width) + 0.5) * cell
const ay = oy + (Math.floor(targetEdge.a / metrics.width) + 0.5) * cell
const bx = ox + ((targetEdge.b % metrics.width) + 0.5) * cell
const by = oy + (Math.floor(targetEdge.b / metrics.width) + 0.5) * cell
const scale = await page.evaluate(() => {
  const svg = document.querySelector('svg.board-svg')
  const r = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  return { sx: r.width / vb.width, sy: r.height / vb.height, vx: vb.x, vy: vb.y }
})
const px = box.x + ((ax + bx) / 2 - scale.vx) * scale.sx
const py = box.y + ((ay + by) / 2 - scale.vy) * scale.sy
await page.mouse.click(px, py)
await page.waitForTimeout(80)
const afterClick = await page.evaluate(() => {
  const s = window.__game.getSession()
  return { drawn: s.state.edges.filter((v) => v > 0).length }
})
console.log('after click:', afterClick)
if (afterClick.drawn !== afterClear + 1) {
  failures++
  console.error('FAIL: 点击相邻格之间没有放下缝线')
}
await page.click('#btn-undo')
await page.waitForTimeout(80)
const afterUndo = await page.evaluate(() => {
  const s = window.__game.getSession()
  return { drawn: s.state.edges.filter((v) => v > 0).length }
})
console.log('after undo:', afterUndo)
if (afterUndo.drawn !== 0) {
  failures++
  console.error('FAIL: 撤销没有回到题面')
}

const customDisabled = await page.locator('#btn-custom').isDisabled()
console.log('custom disabled:', customDisabled)
if (!customDisabled) {
  failures++
  console.error('FAIL: 缝线 应关闭自定义题板')
}

await page.screenshot({ path: 'output/playwright/05-verified.png', fullPage: true })
console.log('pageErrors:', errors)
console.log('failures:', failures)
await browser.close()
if (errors.length || failures > 0) process.exitCode = 1
