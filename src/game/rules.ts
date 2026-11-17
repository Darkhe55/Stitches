/**
 * 缝线 —— 规则传播与校验
 *
 * 推理规则（均为可证明的局部规则，不含猜测）：
 * 1. 同区不缝：同一区块内部相邻格之间不能缝线；
 * 2. 单格针孔：每格最多一个针孔，一格已缝则其余相邻边全部排除；
 * 3. 区域对额度：每对相邻区块恰好 K 条缝线（已满排除 / 差满全部缝上）；
 * 4. 行列针孔数：按「水平边算 2、竖直边算 1」的行列加权和做上下界；
 * 5. 行列占位：同一行/列内的缝线不能共用格子。用精确可达性 DP 同时校验
 *    针孔数能否凑出，并推出每条边必须/不能缝（覆盖奇偶、重叠与邻接冲突）；
 * 6. 区块容量：一个区块的剩余缝线需求 = 各相邻区块对尚缺缝线数之和，
 *    必须由该区块中尚未用掉的格子承担；两者相等时每个空格都必须缝。
 *
 * 传播到不动点后仍未定的边交给回溯搜索兜底。
 */

import {
  buildEdges,
  incidentEdges,
  pairKeyOf,
  stitchPerPairOf,
  type StitchesEdge,
  type StitchesPuzzle,
} from './types.ts'

/** 推理规则名（用于逻辑回放的规则标注） */
export type DeductionRule =
  | 'same-region'
  | 'degree'
  | 'pair-quota'
  | 'line-count'
  | 'line-occupancy'
  | 'region-capacity'

/** 规则简称（审计脚本 / README / 回放共用） */
export const DEDUCTION_RULE_LABELS: Record<DeductionRule, string> = {
  'same-region': '同区不缝',
  degree: '单格针孔',
  'pair-quota': '区域对额度',
  'line-count': '行列针数',
  'line-occupancy': '行列占位',
  'region-capacity': '区块容量',
}

export type SetCallback = (edge: number, value: number, rule: DeductionRule) => void

/** 某一行/列内的一条候选边：w 为该边在本行/列针孔数里的权重，span 为占用的线内格子数 */
interface LineItem {
  e: number
  w: number
  start: number
  span: 1 | 2
}

interface Prepared {
  edges: StitchesEdge[]
  incident: number[][]
  pairs: Map<string, number[]>
  /** 每条候选边所属的区块对 key */
  edgePair: string[]
  rows: Array<Array<{ e: number; w: number }>>
  cols: Array<Array<{ e: number; w: number }>>
  rowLines: LineItem[][]
  colLines: LineItem[][]
  regionCells: number[][]
  /** 每个区块相邻的区块对 key（去重） */
  regionPairKeys: string[][]
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
  const edgePair = new Array<string>(edges.length).fill('')
  const rows: Array<Array<{ e: number; w: number }>> = Array.from(
    { length: p.height },
    () => [],
  )
  const cols: Array<Array<{ e: number; w: number }>> = Array.from(
    { length: p.width },
    () => [],
  )
  const rowLines: LineItem[][] = Array.from({ length: p.height }, () => [])
  const colLines: LineItem[][] = Array.from({ length: p.width }, () => [])

  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e]!
    if (!edge.candidate) continue
    const key = pairKeyOf(p.regions, edge.a, edge.b)
    edgePair[e] = key
    const list = pairs.get(key) ?? []
    list.push(e)
    pairs.set(key, list)
    const ax = edge.a % p.width
    const ay = (edge.a / p.width) | 0
    if (edge.horizontal) {
      // 行：水平边权重 2、占两格；列：两端各贡献 1、各占一格
      rows[ay]!.push({ e, w: 2 })
      rowLines[ay]!.push({ e, w: 2, start: ax, span: 2 })
      cols[ax]!.push({ e, w: 1 })
      cols[ax + 1]!.push({ e, w: 1 })
      colLines[ax]!.push({ e, w: 1, start: ay, span: 1 })
      colLines[ax + 1]!.push({ e, w: 1, start: ay, span: 1 })
    } else {
      // 行：上下两端各贡献 1、各占一格；列：竖直边权重 2、占两格
      rows[ay]!.push({ e, w: 1 })
      rows[ay + 1]!.push({ e, w: 1 })
      rowLines[ay]!.push({ e, w: 1, start: ax, span: 1 })
      rowLines[ay + 1]!.push({ e, w: 1, start: ax, span: 1 })
      cols[ax]!.push({ e, w: 2 })
      colLines[ax]!.push({ e, w: 2, start: ay, span: 2 })
    }
  }

  const size = p.width * p.height
  let regionCount = 0
  for (let i = 0; i < size; i++) regionCount = Math.max(regionCount, p.regions[i]! + 1)
  const regionCells: number[][] = Array.from({ length: regionCount }, () => [])
  for (let i = 0; i < size; i++) regionCells[p.regions[i]!]!.push(i)
  const regionPairKeys: string[][] = Array.from({ length: regionCount }, () => [])
  for (const [key] of pairs) {
    const dash = key.indexOf('-')
    const ra = Number(key.slice(0, dash))
    const rb = Number(key.slice(dash + 1))
    regionPairKeys[ra]?.push(key)
    regionPairKeys[rb]?.push(key)
  }

  const out = {
    edges,
    incident,
    pairs,
    edgePair,
    rows,
    cols,
    rowLines,
    colLines,
    regionCells,
    regionPairKeys,
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
  const {
    edges,
    incident,
    pairs,
    edgePair,
    rows,
    cols,
    rowLines,
    colLines,
    regionCells,
    regionPairKeys,
    stitchPerPair: k,
  } = prepare(p)
  let changed = true
  const set = (e: number, value: number, rule: DeductionRule): boolean => {
    if (values[e] === value) return true
    if (values[e] !== -1) return false
    values[e] = value
    onSet?.(e, value, rule)
    changed = true
    return true
  }

  // 同区块之间的边不能缝（不存在的边，不参与回放）
  for (let e = 0; e < edges.length; e++) {
    if (!edges[e]!.candidate) {
      if (values[e] === 1) return false
      if (values[e] === -1) values[e] = 0
    }
  }

  // 规则 4（快速上下界）：行列针孔数加权和
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
      for (const item of unknown) if (!set(item.e, 0, 'line-count')) return false
    } else if (rem === max) {
      for (const item of unknown) if (!set(item.e, 1, 'line-count')) return false
    } else if (rem === 1) {
      for (const item of unknown) if (item.w === 2 && !set(item.e, 0, 'line-count')) return false
      const hasOne = unknown.some((item) => item.w === 1 && values[item.e] === -1)
      if (!hasOne) return false
    } else if (unknown.every((item) => item.w === 2) && rem % 2 === 1) {
      return false
    }
    return true
  }

  /**
   * 规则 5：行列占位精确可达性。
   *
   * 把一行/列看成一条格子线：水平主线边（行内）权重 2、占 2 格；竖直穿行边
   * 权重 1、占 1 格（列内相反）。缝线不能共用格子，所以可选的边是线内格子上的
   * 一个「带权且互不重叠」子集。用前后缀可达性 DP 判断剩余针孔数 rem 能否恰好
   * 凑出，并据此推出每条边必须缝 / 不能缝。
   */
  const applyLineOccupancy = (
    items: LineItem[],
    cellCount: number,
    target: number,
  ): boolean => {
    let selected = 0
    const occupied = new Uint8Array(cellCount)
    for (const item of items) {
      if (values[item.e] !== 1) continue
      selected += item.w
      occupied[item.start] = 1
      if (item.span === 2) occupied[item.start + 1] = 1
    }
    const rem = target - selected
    // 每个格子最多贡献 1 个针孔（水平边 2 针孔占 2 格，竖直边 1 针孔占 1 格）
    if (rem < 0 || rem > cellCount) return false

    const unknown: LineItem[] = []
    for (const item of items) {
      if (values[item.e] !== -1) continue
      // 与已确定的缝线共用格子：不能再缝（正常已由「单格针孔」规则排除）
      if (occupied[item.start] || (item.span === 2 && occupied[item.start + 1])) {
        if (!set(item.e, 0, 'degree')) return false
        continue
      }
      unknown.push(item)
    }
    if (rem === 0) {
      for (const item of unknown) if (!set(item.e, 0, 'line-occupancy')) return false
      return true
    }
    let total = 0
    for (const item of unknown) total += item.w
    if (rem > total) return false

    // 按起点分组：同一起点最多两条边（主线边 + 穿行边），二者共用该格，至多选一条
    const groups: LineItem[][] = Array.from({ length: cellCount }, () => [])
    for (const item of unknown) groups[item.start]!.push(item)

    // 前缀可达（两种边界状态）：
    //   free[i][s]    = 只考虑 i 之前的格子、已凑出 s 针孔，且第 i 格未被占用
    //   covered[i][s] = 只考虑 i 之前的格子、已凑出 s 针孔，且第 i 格被 i-1 起的
    //                   跨格边（span=2）占用
    const free: Uint8Array[] = Array.from(
      { length: cellCount + 1 },
      () => new Uint8Array(rem + 1),
    )
    const covered: Uint8Array[] = Array.from(
      { length: cellCount + 1 },
      () => new Uint8Array(rem + 1),
    )
    free[0]![0] = 1
    for (let i = 0; i < cellCount; i++) {
      const curFree = free[i]!
      const curCovered = covered[i]!
      const nextFree = free[i + 1]!
      for (let s = 0; s <= rem; s++) {
        if (curFree[s]) nextFree[s] = 1
        if (curCovered[s]) nextFree[s] = 1
      }
      for (const item of groups[i]!) {
        if (item.w > rem) continue
        if (item.span === 1) {
          for (let s = 0; s + item.w <= rem; s++) {
            if (curFree[s]) nextFree[s + item.w] = 1
          }
        } else {
          const nextCovered = covered[i + 1]!
          for (let s = 0; s + item.w <= rem; s++) {
            if (curFree[s]) nextCovered[s + item.w] = 1
          }
        }
      }
    }
    if (!free[cellCount]![rem]) return false

    // 后缀可达：B[i][s] = 只考虑 i 及之后的格子、第 i 格空闲时能凑出 s 针孔
    const B: Uint8Array[] = Array.from(
      { length: cellCount + 2 },
      () => new Uint8Array(rem + 1),
    )
    B[cellCount]![0] = 1
    B[cellCount + 1]![0] = 1
    for (let i = cellCount - 1; i >= 0; i--) {
      const cur = B[i]!
      const next = B[i + 1]!
      for (let s = 0; s <= rem; s++) if (next[s]) cur[s] = 1
      for (const item of groups[i]!) {
        if (item.w > rem) continue
        const src = item.span === 1 ? B[i + 1]! : B[i + 2]!
        for (let s = 0; s + item.w <= rem; s++) {
          if (src[s]) cur[s + item.w] = 1
        }
      }
    }

    // 逐边做「缝 / 不缝」两种假设下的可达性检验
    for (let i = 0; i < cellCount; i++) {
      const group = groups[i]!
      if (!group.length) continue
      const curFree = free[i]!
      const curCovered = covered[i]!
      for (const item of group) {
        // 假设这条边缝上：第 i 格必须空闲，后缀从 i+span 起空闲
        let canStitch = false
        const afterStitch = rem - item.w
        if (afterStitch >= 0) {
          const bAfter = B[i + item.span]!
          for (let s = 0; s <= afterStitch; s++) {
            if (curFree[s] && bAfter[afterStitch - s]) {
              canStitch = true
              break
            }
          }
        }
        if (!canStitch) {
          if (!set(item.e, 0, 'line-occupancy')) return false
          continue
        }
        // 假设这条边不缝：第 i 格可能空闲也可能被 i-1 起的跨格边占用；
        // 空闲时还可以改选同起点的另一条边（两者共用第 i 格，至多选一条）
        let canSkip = false
        const bSkip = B[i + 1]!
        for (let s = 0; s <= rem; s++) {
          if ((curFree[s] || curCovered[s]) && bSkip[rem - s]) {
            canSkip = true
            break
          }
        }
        if (!canSkip) {
          for (const other of group) {
            if (other === item) continue
            const need = rem - other.w
            if (need < 0) continue
            const bOther = B[i + other.span]!
            for (let s = 0; s <= need; s++) {
              if (curFree[s] && bOther[need - s]) {
                canSkip = true
                break
              }
            }
            if (canSkip) break
          }
        }
        if (!canSkip && !set(item.e, 1, 'line-occupancy')) return false
      }
    }
    return true
  }

  /**
   * 规则 6：区块容量。
   *
   * 区块 r 的剩余缝线需求 = 所有相邻区块对尚缺的缝线数之和；每条剩余缝线都要
   * 占用 r 中一个还没有针孔的格子，因此需求 ≤ 空格数。若相等，则每个空格都必须
   * 缝，且该格若只有一条仍缺额度的相邻边，那条边必须缝。
   */
  const applyRegionCapacity = (): boolean => {
    for (let r = 0; r < regionCells.length; r++) {
      const cells = regionCells[r]!
      if (!cells.length) continue
      // 每个区块都按当前盘面重新统计，避免同一次调用中刚推出的缝线被漏算
      const pairSelected = new Map<string, number>()
      for (const [key, list] of pairs) {
        let n = 0
        for (const e of list) if (values[e] === 1) n++
        pairSelected.set(key, n)
      }
      let needed = 0
      for (const key of regionPairKeys[r]!) needed += k - (pairSelected.get(key) ?? 0)
      if (needed <= 0) continue
      const free: number[] = []
      for (const cell of cells) {
        let used = false
        for (const e of incident[cell]!) {
          if (values[e] === 1) {
            used = true
            break
          }
        }
        if (!used) free.push(cell)
      }
      if (needed > free.length) return false
      if (needed !== free.length) continue
      for (const cell of free) {
        let usable = -1
        let count = 0
        for (const e of incident[cell]!) {
          if (values[e] !== -1) continue
          const key = edgePair[e]!
          if (k - (pairSelected.get(key) ?? 0) <= 0) continue
          usable = e
          count++
        }
        if (count === 0) return false
        if (count === 1 && !set(usable, 1, 'region-capacity')) return false
      }
    }
    return true
  }

  while (changed) {
    changed = false

    // 规则 2：单格针孔
    for (let i = 0; i < incident.length; i++) {
      let selected = 0
      const unknown: number[] = []
      for (const e of incident[i]!) {
        if (values[e] === 1) selected++
        else if (values[e] === -1) unknown.push(e)
      }
      if (selected > 1) return false
      if (selected === 1) {
        for (const e of unknown) if (!set(e, 0, 'degree')) return false
      }
    }

    // 规则 3：每对相邻区块恰好 K 条缝线
    for (const [, list] of pairs) {
      let selected = 0
      let unknown = 0
      for (const e of list) {
        if (values[e] === 1) selected++
        else if (values[e] === -1) unknown++
      }
      if (selected > k) return false
      if (selected === k) {
        for (const e of list) if (values[e] === -1 && !set(e, 0, 'pair-quota')) return false
      } else if (selected + unknown < k) {
        return false
      } else if (selected + unknown === k) {
        for (const e of list) if (values[e] === -1 && !set(e, 1, 'pair-quota')) return false
      }
    }

    // 规则 4：行列针孔数（快速上下界）
    for (let y = 0; y < p.height; y++) {
      if (!applyLine(rows[y]!, p.rowCounts[y] ?? 0)) return false
    }
    for (let x = 0; x < p.width; x++) {
      if (!applyLine(cols[x]!, p.colCounts[x] ?? 0)) return false
    }

    // 规则 5：行列占位（精确可达性）
    for (let y = 0; y < p.height; y++) {
      if (!applyLineOccupancy(rowLines[y]!, p.width, p.rowCounts[y] ?? 0)) return false
    }
    for (let x = 0; x < p.width; x++) {
      if (!applyLineOccupancy(colLines[x]!, p.height, p.colCounts[x] ?? 0)) return false
    }

    // 规则 6：区块容量
    if (!applyRegionCapacity()) return false
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
