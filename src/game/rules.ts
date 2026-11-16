/**
 * 缝线 —— 规则传播与校验
 */

import {
  buildEdges,
  incidentEdges,
  pairKeyOf,
  stitchPerPairOf,
  type StitchesEdge,
  type StitchesPuzzle,
} from './types.ts'

export type SetCallback = (edge: number, value: number) => void

interface Prepared {
  edges: StitchesEdge[]
  incident: number[][]
  pairs: Map<string, number[]>
  rows: Array<Array<{ e: number; w: number }>>
  cols: Array<Array<{ e: number; w: number }>>
  candidate: number[]
  /** 变体参数：每对相邻区块需要的缝线数 K */
  stitchPerPair: number
}

const cache = new WeakMap<StitchesPuzzle, Prepared>()

function prepare(p: StitchesPuzzle): Prepared {
  const cached = cache.get(p)
  if (cached) return cached
  const edges = buildEdges(p.regions, p.width, p.height)
  const incident = incidentEdges(edges, p.width * p.height)
  const pairs = new Map<string, number[]>()
  const rows: Array<Array<{ e: number; w: number }>> = Array.from(
    { length: p.height },
    () => [],
  )
  const cols: Array<Array<{ e: number; w: number }>> = Array.from(
    { length: p.width },
    () => [],
  )
  const candidate: number[] = []
  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e]!
    if (!edge.candidate) continue
    candidate.push(e)
    const key = pairKeyOf(p.regions, edge.a, edge.b)
    const list = pairs.get(key) ?? []
    list.push(e)
    pairs.set(key, list)
    const ax = edge.a % p.width
    const ay = (edge.a / p.width) | 0
    if (edge.horizontal) {
      rows[ay]!.push({ e, w: 2 })
      cols[ax]!.push({ e, w: 1 })
      cols[ax + 1]!.push({ e, w: 1 })
    } else {
      rows[ay]!.push({ e, w: 1 })
      rows[ay + 1]!.push({ e, w: 1 })
      cols[ax]!.push({ e, w: 2 })
    }
  }
  const out = {
    edges,
    incident,
    pairs,
    rows,
    cols,
    candidate,
    stitchPerPair: stitchPerPairOf(p),
  }
  cache.set(p, out)
  return out
}

export function propagate(
  values: number[],
  p: StitchesPuzzle,
  onSet?: SetCallback,
): boolean {
  const { edges, incident, pairs, rows, cols, candidate, stitchPerPair: k } = prepare(p)
  let changed = true
  const set = (e: number, value: number): boolean => {
    if (values[e] === value) return true
    if (values[e] !== -1) return false
    values[e] = value
    onSet?.(e, value)
    changed = true
    return true
  }

  // 同区块之间的边不能缝
  for (let e = 0; e < edges.length; e++) {
    if (!edges[e]!.candidate) {
      if (values[e] === 1) return false
      if (values[e] === -1) values[e] = 0
    }
  }

  while (changed) {
    changed = false

    for (let i = 0; i < incident.length; i++) {
      let selected = 0
      const unknown: number[] = []
      for (const e of incident[i]!) {
        if (values[e] === 1) selected++
        else if (values[e] === -1) unknown.push(e)
      }
      if (selected > 1) return false
      if (selected === 1) for (const e of unknown) if (!set(e, 0)) return false
    }

    // 每对相邻区块恰好 K 条缝线（K=1 即经典 1÷；K=3 为 3÷ 变体）
    for (const [, list] of pairs) {
      let selected = 0
      let unknown = 0
      for (const e of list) {
        if (values[e] === 1) selected++
        else if (values[e] === -1) unknown++
      }
      if (selected > k) return false
      if (selected === k) {
        for (const e of list) if (values[e] === -1 && !set(e, 0)) return false
      } else if (selected + unknown < k) {
        return false
      } else if (selected + unknown === k) {
        for (const e of list) if (values[e] === -1 && !set(e, 1)) return false
      }
    }

    const applyLine = (
      list: Array<{ e: number; w: number }>,
      target: number,
    ): boolean => {
      let selected = 0
      let max = 0
      const unknown: Array<{ e: number; w: number }> = []
      for (const item of list) {
        if (values[item.e] === 1) selected += item.w
        else if (values[item.e] === -1) {
          max += item.w
          unknown.push(item)
        }
      }
      if (selected > target || selected + max < target) return false
      const rem = target - selected
      if (rem === 0) {
        for (const item of unknown) if (!set(item.e, 0)) return false
      } else if (rem === max) {
        for (const item of unknown) if (!set(item.e, 1)) return false
      } else if (rem === 1) {
        for (const item of unknown) if (item.w === 2 && !set(item.e, 0)) return false
        const hasOne = unknown.some((item) => item.w === 1 && values[item.e] === -1)
        if (!hasOne) return false
      } else if (unknown.every((item) => item.w === 2) && rem % 2 === 1) {
        return false
      }
      return true
    }

    for (let y = 0; y < p.height; y++) {
      if (!applyLine(rows[y]!, p.rowCounts[y] ?? 0)) return false
    }
    for (let x = 0; x < p.width; x++) {
      if (!applyLine(cols[x]!, p.colCounts[x] ?? 0)) return false
    }

    void candidate
  }
  return true
}

export interface StitchesCheck {
  ok: boolean
  badCells: number[]
  rowActual: number[]
  colActual: number[]
  rowBad: number[]
  colBad: number[]
  pairMissing: string[]
  pairDuplicated: string[]
  /** 本题的变体参数 K */
  stitchPerPair: number
}

export function checkSolution(
  values: ArrayLike<number>,
  p: StitchesPuzzle,
): StitchesCheck {
  const { edges, incident, pairs, stitchPerPair: k } = prepare(p)
  const bad = new Set<number>()
  const rowActual = new Array<number>(p.height).fill(0)
  const colActual = new Array<number>(p.width).fill(0)

  for (let e = 0; e < edges.length; e++) {
    if ((values[e] ?? 0) !== 1) continue
    const edge = edges[e]!
    if (!edge.candidate) {
      bad.add(edge.a)
      bad.add(edge.b)
      continue
    }
    if (edge.horizontal) {
      rowActual[Math.floor(edge.a / p.width)]! += 2
      colActual[edge.a % p.width]! += 1
      colActual[(edge.a % p.width) + 1]! += 1
    } else {
      rowActual[Math.floor(edge.a / p.width)]! += 1
      rowActual[Math.floor(edge.a / p.width) + 1]! += 1
      colActual[edge.a % p.width]! += 2
    }
  }

  for (let i = 0; i < incident.length; i++) {
    let count = 0
    for (const e of incident[i]!) if (values[e] === 1) count++
    if (count > 1) {
      bad.add(i)
      for (const e of incident[i]!) {
        if (values[e] === 1) {
          bad.add(edges[e]!.a)
          bad.add(edges[e]!.b)
        }
      }
    }
  }

  const pairMissing: string[] = []
  const pairDuplicated: string[] = []
  for (const [key, list] of pairs) {
    let count = 0
    for (const e of list) if (values[e] === 1) count++
    if (count < k) pairMissing.push(key)
    else if (count > k) {
      pairDuplicated.push(key)
      for (const e of list) {
        if (values[e] === 1) {
          bad.add(edges[e]!.a)
          bad.add(edges[e]!.b)
        }
      }
    }
  }

  const rowBad: number[] = []
  const colBad: number[] = []
  for (let y = 0; y < p.height; y++) {
    if (rowActual[y] !== (p.rowCounts[y] ?? 0)) rowBad.push(y)
  }
  for (let x = 0; x < p.width; x++) {
    if (colActual[x] !== (p.colCounts[x] ?? 0)) colBad.push(x)
  }

  return {
    badCells: Array.from(bad),
    rowActual,
    colActual,
    rowBad,
    colBad,
    pairMissing,
    pairDuplicated,
    stitchPerPair: k,
    ok:
      bad.size === 0 &&
      rowBad.length === 0 &&
      colBad.length === 0 &&
      pairMissing.length === 0 &&
      pairDuplicated.length === 0,
  }
}
