/**
 * 缝线题库审计
 *
 * 支持经典 1÷ 与 K÷（k 字段，缺省 1）变体：
 * - 参考解必须合法；
 * - 解唯一；
 * - 规则传播不矛盾（记录逻辑可推满 / 需回溯、未定边数与各规则命中次数）。
 *
 * 规则传播（src/game/rules.ts）只做可证明的局部推理，推不到不动点时才交给
 * 回溯搜索兜底；因此「逻辑可推满」表示整题无需回溯。
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  decodeCounts,
  decodeEdges,
  decodeRegions,
  edgeCount,
  stitchPerPairOf,
} from '../src/game/types.ts'
import {
  checkSolution,
  DEDUCTION_RULE_LABELS,
  propagate,
} from '../src/game/rules.ts'
import { countSolutions } from '../src/game/solver.ts'

const DATA_FILE = path.resolve('src/game/puzzles-data.ts')
const text = readFileSync(DATA_FILE, 'utf8')

const entries = []
const re =
  /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*width:\s*(\d+),\s*height:\s*(\d+),\s*difficulty:\s*'([^']+)',\s*series:\s*"([^"]+)",\s*(?:k:\s*(\d+),\s*)?board:\s*"([^"]*)",\s*solution:\s*"([^"]*)"\s*\}/g
let m
while ((m = re.exec(text)) !== null) {
  entries.push({
    id: m[1],
    name: m[2],
    width: Number(m[3]),
    height: Number(m[4]),
    difficulty: m[5],
    series: m[6],
    k: m[7] === undefined ? undefined : Number(m[7]),
    board: m[8],
    solution: m[9],
  })
}

let errors = 0
let warnings = 0
const ids = new Set()

for (const e of entries) {
  if (ids.has(e.id)) {
    console.error(`[check] 重复 id: ${e.id}`)
    errors++
  }
  ids.add(e.id)
  const parts = e.board.split('|')
  if (parts.length !== 3 && parts.length !== 4) {
    console.error(`[check] ${e.id} board 格式非法`)
    errors++
    continue
  }
  const k =
    e.k ?? (parts[3] !== undefined && parts[3] !== '' ? Number(parts[3]) : 1)
  if (!Number.isInteger(k) || k < 1 || k > 9) {
    console.error(`[check] ${e.id} 变体参数 K 非法：${k}`)
    errors++
    continue
  }
  const cells = e.width * e.height
  const regions = decodeRegions(parts[0], cells)
  const rowCounts = decodeCounts(parts[1], e.height)
  const colCounts = decodeCounts(parts[2], e.width)
  const values = decodeEdges(e.solution, edgeCount(e.width, e.height))
  if (!regions || !rowCounts || !colCounts || !values) {
    console.error(`[check] ${e.id} 编码非法`)
    errors++
    continue
  }
  const puzzle = {
    id: e.id,
    name: e.name,
    width: e.width,
    height: e.height,
    difficulty: e.difficulty,
    stitchPerPair: k,
    regions,
    rowCounts,
    colCounts,
  }

  const ref = checkSolution(values, puzzle)
  if (!ref.ok) {
    console.error(`[check] ${e.id} 参考解不合法`)
    errors++
    continue
  }

  const counted = countSolutions(puzzle, 2, 1_000_000)
  if (counted.timedOut) {
    console.warn(`[check] ${e.id} 唯一解检查超时（${counted.nodes} 节点）`)
    warnings++
  } else if (counted.count !== 1) {
    console.error(`[check] ${e.id} 解不唯一：找到 ${counted.count} 个`)
    errors++
    continue
  }

  const vals = new Array(values.length).fill(-1)
  const ruleHits = new Map()
  const sat = propagate(vals, puzzle, (_e, _v, rule) => {
    ruleHits.set(rule, (ruleHits.get(rule) ?? 0) + 1)
  })
  const decided = vals.every((v) => v !== -1)
  const undecided = vals.filter((v) => v === -1).length
  if (!sat) {
    console.error(`[check] ${e.id} 规则传播矛盾`)
    errors++
    continue
  }
  if (!decided) warnings++

  const regionCount = new Set(regions).size
  const holes = values.reduce((a, b) => a + b, 0)
  const ruleText = [...ruleHits]
    .map(([rule, n]) => `${DEDUCTION_RULE_LABELS[rule] ?? rule}×${n}`)
    .join(' ')
  console.log(
    `[check] ${e.id} ${e.width}×${e.height} ${stitchPerPairOf(puzzle)}÷ · 区块 ${regionCount} 针孔 ${holes} · 解唯一 · 逻辑${decided ? '可推满' : `需回溯（${undecided} 边未定）`} · ${counted.nodes} 节点${ruleText ? ` · ${ruleText}` : ''}`,
  )
}

console.log(`[check] 共 ${entries.length} 题，错误 ${errors}，警告 ${warnings}`)
if (entries.length === 0) console.warn('[check] 题库为空，请先运行 npm run gen。')
if (errors > 0) process.exitCode = 1
