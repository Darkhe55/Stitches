/**
 * 缝线 —— 回溯求解器
 */

import type { Puzzle, SolveResult } from '../core/types'
import { checkSolution, propagate } from './rules.ts'
import {
  buildEdges,
  pairKeyOf,
  stitchPerPairOf,
  type StitchesPuzzle,
  type StitchesState,
} from './types.ts'

export interface CountOutcome {
  count: number
  nodes: number
  timedOut: boolean
}

function search(
  p: StitchesPuzzle,
  limit: number,
  maxNodes: number,
): { solutions: number[][]; nodes: number; timedOut: boolean } {
  const edges = buildEdges(p.regions, p.width, p.height)
  const k = stitchPerPairOf(p)
  const vals = new Array<number>(edges.length).fill(-1)
  const candidate: number[] = []
  const pairMap = new Map<string, number[]>()
  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e]!
    if (!edge.candidate) continue
    candidate.push(e)
    const key = pairKeyOf(p.regions, edge.a, edge.b)
    const list = pairMap.get(key) ?? []
    list.push(e)
    pairMap.set(key, list)
  }

  const solutions: number[][] = []
  let nodes = 0
  let timedOut = false

  const dfs = (): void => {
    if (solutions.length >= limit || timedOut) return
    nodes++
    if (nodes > maxNodes) {
      timedOut = true
      return
    }
    if (!propagate(vals, p)) return

    let target = -1
    let best = Infinity
    for (const [, list] of pairMap) {
      let selected = 0
      const unknown: number[] = []
      for (const e of list) {
        if (vals[e] === 1) selected++
        else if (vals[e] === -1) unknown.push(e)
      }
      // 优先处理「还差缝线、且候选边最少」的区块对（K=1 时即 selected===0）
      if (selected < k && unknown.length > 0 && unknown.length < best) {
        best = unknown.length
        target = unknown[0]!
      }
    }
    if (target < 0) {
      for (const e of candidate) {
        if (vals[e] === -1) {
          target = e
          break
        }
      }
    }
    if (target < 0) {
      const out = vals.map((v) => (v === 1 ? 1 : 0))
      if (checkSolution(out, p).ok) solutions.push(out)
      return
    }

    for (const value of [1, 0]) {
      const backup = vals.slice()
      vals[target] = value
      dfs()
      for (let e = 0; e < vals.length; e++) vals[e] = backup[e]!
      if (solutions.length >= limit || timedOut) break
    }
  }

  dfs()
  return { solutions, nodes, timedOut }
}

export function countSolutions(
  p: StitchesPuzzle,
  limit = 2,
  maxNodes = 400_000,
): CountOutcome {
  const out = search(p, limit, maxNodes)
  return { count: out.solutions.length, nodes: out.nodes, timedOut: out.timedOut }
}

export function findSolution(p: StitchesPuzzle, maxNodes = 2_000_000): number[] | null {
  const out = search(p, 1, maxNodes)
  return out.solutions[0] ?? null
}

export function solvePuzzle(puzzle: Puzzle, maxNodes = 1_500_000): SolveResult {
  const p = puzzle as StitchesPuzzle
  if (!p.regions || p.regions.length !== p.width * p.height) {
    return { solved: false, solution: null, nodes: 0, timedOut: false }
  }
  const out = search(p, 1, maxNodes)
  const values = out.solutions[0]
  if (!values) return { solved: false, solution: null, nodes: out.nodes, timedOut: out.timedOut }
  return { solved: true, solution: makeState(p, values), nodes: out.nodes, timedOut: false }
}

export function makeState(puzzle: StitchesPuzzle, values: number[]): StitchesState {
  return {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    edges: values.map((v) => (v === 1 ? 1 : 0)),
  }
}
