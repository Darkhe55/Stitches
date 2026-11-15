/**
 * 缝线题库生成器
 *
 * 1. 用蛇形哈密顿路径切成 4–6 格的连通区块；
 * 2. 为每对相邻区块选一条缝线（每格最多一条）；
 * 3. 由缝线推出行列针孔数，检查题面是否唯一。
 */

import type { Difficulty } from '../core/types'
import { countSolutions } from './solver.ts'
import {
  buildEdges,
  encodeCounts,
  encodeEdges,
  encodeRegions,
  pairKeyOf,
  type StitchesPuzzle,
} from './types.ts'

interface GenSpec {
  seed: number
  difficulty: Difficulty
  name: string
  series: string
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const SPECS: GenSpec[] = [
  { seed: 0x4d534b01, difficulty: 'easy', name: '初识缝线', series: '入门' },
  { seed: 0x4d534b02, difficulty: 'easy', name: '针脚初现', series: '入门' },
  { seed: 0x4d534b03, difficulty: 'medium', name: '布块拼接', series: '进阶' },
  { seed: 0x4d534b04, difficulty: 'medium', name: '线迹迷宫', series: '进阶' },
  { seed: 0x4d534b05, difficulty: 'hard', name: '缝线之壁', series: '挑战' },
  { seed: 0x4d534b06, difficulty: 'hard', name: '终局缝线', series: '挑战' },
]

export interface GeneratedPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series: string
  board: string
  solution: string
}

function serpentine(w: number, h: number, rng: () => number): number[] {
  const path: number[] = []
  for (let y = 0; y < h; y++) {
    if (y % 2 === 0) for (let x = 0; x < w; x++) path.push(y * w + x)
    else for (let x = w - 1; x >= 0; x--) path.push(y * w + x)
  }
  let out = path
  if (rng() < 0.5) out = out.slice().reverse()
  if (rng() < 0.5) out = out.map((i) => (i % w) * h + Math.floor(i / w))
  return out
}

function makePartition(w: number, h: number, rng: () => number): number[] | null {
  const path = serpentine(w, h, rng)
  const sizes: number[] = []
  let left = w * h
  while (left > 0) {
    const choices: number[] = []
    for (let s = 4; s <= 6; s++) {
      if (left - s === 0 || left - s >= 4) choices.push(s)
    }
    if (!choices.length) return null
    const s = choices[Math.floor(rng() * choices.length)]!
    sizes.push(s)
    left -= s
  }
  const regions = new Array<number>(w * h).fill(0)
  let pos = 0
  for (let r = 0; r < sizes.length; r++) {
    for (let k = 0; k < sizes[r]!; k++) regions[path[pos++]!] = r
  }
  return regions
}

function chooseStitches(
  regions: number[],
  w: number,
  h: number,
  rng: () => number,
): number[] | null {
  const edges = buildEdges(regions, w, h)
  const pairs = new Map<string, number[]>()
  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e]!
    if (!edge.candidate) continue
    const key = pairKeyOf(regions, edge.a, edge.b)
    const list = pairs.get(key) ?? []
    list.push(e)
    pairs.set(key, list)
  }
  const groups = shuffle(
    Array.from(pairs.values()).sort((a, b) => a.length - b.length),
    rng,
  )
  const values = new Array<number>(edges.length).fill(0)
  const used = new Uint8Array(w * h)
  const dfs = (k: number): boolean => {
    if (k >= groups.length) return true
    const list = shuffle(groups[k]!, rng)
    for (const e of list) {
      const edge = edges[e]!
      if (used[edge.a] || used[edge.b]) continue
      used[edge.a] = 1
      used[edge.b] = 1
      values[e] = 1
      if (dfs(k + 1)) return true
      values[e] = 0
      used[edge.a] = 0
      used[edge.b] = 0
    }
    return false
  }
  return dfs(0) ? values : null
}

function attempt(spec: GenSpec, rng: () => number, w: number, h: number): GeneratedPuzzle | null {
  const regions = makePartition(w, h, rng)
  if (!regions) return null
  const values = chooseStitches(regions, w, h, rng)
  if (!values) return null
  const edges = buildEdges(regions, w, h)

  const rowCounts = new Array<number>(h).fill(0)
  const colCounts = new Array<number>(w).fill(0)
  for (let e = 0; e < edges.length; e++) {
    if (values[e] !== 1) continue
    const edge = edges[e]!
    if (edge.horizontal) {
      rowCounts[Math.floor(edge.a / w)]! += 2
      colCounts[edge.a % w]! += 1
      colCounts[(edge.a % w) + 1]! += 1
    } else {
      rowCounts[Math.floor(edge.a / w)]! += 1
      rowCounts[Math.floor(edge.a / w) + 1]! += 1
      colCounts[edge.a % w]! += 2
    }
  }

  const puzzle: StitchesPuzzle = {
    id: `stitches-${w}x${h}-${spec.seed.toString(36)}`,
    name: spec.name,
    width: w,
    height: h,
    difficulty: spec.difficulty,
    regions,
    rowCounts,
    colCounts,
  }

  const counted = countSolutions(puzzle, 2, 300_000)
  if (counted.timedOut || counted.count !== 1) return null

  return {
    id: puzzle.id,
    name: spec.name,
    width: w,
    height: h,
    difficulty: spec.difficulty,
    series: spec.series,
    board: `${encodeRegions(regions)}|${encodeCounts(rowCounts)}|${encodeCounts(colCounts)}`,
    solution: encodeEdges(values),
  }
}

export function generatePuzzles(): GeneratedPuzzle[] {
  const out: GeneratedPuzzle[] = []
  for (const spec of SPECS) {
    const t0 = Date.now()
    const rng = mulberry32(spec.seed)
    let made: GeneratedPuzzle | null = null
    for (let tries = 0; tries < 200 && !made; tries++) made = attempt(spec, rng, 7, 7)
    if (!made) throw new Error(`[缝线 gen] ${spec.name} 生成失败`)
    const parts = made.board.split('|')
    const regionCount = new Set(parts[0]!.split('')).size
    console.log(
      `[缝线 gen] ${spec.name}：区块 ${regionCount}，${Date.now() - t0}ms`,
    )
    out.push(made)
  }
  return out
}
