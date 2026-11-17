/**
 * 缝线 —— 逻辑解题回放
 *
 * 推理阶段调用 rules.ts 的规则传播（只做可证明的局部推理），推到不动点后
 * 仍未定的边才用回溯搜索补全，因此绝大多数题目不会有「回溯」帧。
 *
 * 回放从「当前盘面」开始：玩家已经缝好的边（状态里 1）直接写进工作数组作为
 * 已知值，未知边保持 -1；帧里的 from 也取当前值，已经放对的缝线不会被擦掉或
 * 反向覆盖。若玩家标记与规则矛盾（种子传播失败），退回只看题面的旧路径，
 * 回放同样从当前盘面出发，用帧纠正错误缝线。
 */

import type { GameState, LogicPlan, Move, PlaybackFrame, Puzzle } from '../core/types'
import { checkSolution, propagate, type DeductionRule } from './rules'
import { findSolution } from './solver'
import {
  asStitchesPuzzle,
  asStitchesState,
  buildEdges,
  type StitchesPuzzle,
  type StitchesState,
} from './types'

/** 规则编号与人类可读说明（回放状态栏显示「规则N · 说明」） */
const RULE_INFO: Record<
  DeductionRule,
  { no: number; label: (value: number) => string }
> = {
  'same-region': { no: 1, label: () => '同一区块内部不缝线' },
  degree: { no: 2, label: () => '每格最多一个针孔，其余相邻边不能缝' },
  'pair-quota': {
    no: 3,
    label: (v) =>
      v === 1
        ? '这一对相邻区块还差缝线，剩余候选边全部缝上'
        : '这一对相邻区块的缝线额度已满，其余边不能缝',
  },
  'line-count': {
    no: 4,
    label: (v) =>
      v === 1
        ? '行/列针孔数要求这些边缝上'
        : '行/列针孔数已满，这些边不能缝',
  },
  'line-occupancy': {
    no: 5,
    label: (v) =>
      v === 1
        ? '行/列针孔数与单格针孔共同约束：这条边必须缝'
        : '行/列针孔数与单格针孔共同约束：这条边不能缝',
  },
  'region-capacity': {
    no: 6,
    label: () => '区块剩余空格数刚好等于剩余缝线需求，这一格必须缝',
  },
}

/** 回溯补全帧的规则编号 */
const RULE_BACKTRACK = 9
/** 最终补全帧的规则编号 */
const RULE_FINAL = 10

/** 当前盘面里是否有玩家已经缝好的边（0 与「未知」在状态里不可区分） */
function hasPlayerStitches(s: StitchesState): boolean {
  for (let e = 0; e < s.edges.length; e++) if ((s.edges[e] ?? 0) === 1) return true
  return false
}

/** 一次完整尝试；失败返回 null，便于「种子矛盾 → 退回只看题面」重试 */
function attempt(p: StitchesPuzzle, s: StitchesState, seedPlayer: boolean): LogicPlan | null {
  const edges = buildEdges(p.regions ?? [], p.width, p.height)
  const total = edges.length
  const frames: PlaybackFrame[] = []
  /** 工作盘面：-1 = 未知；玩家已缝好的边（1）直接写入作为已知值 */
  const grid = new Array<number>(total).fill(-1)
  if (seedPlayer) {
    for (let e = 0; e < total; e++) if ((s.edges[e] ?? 0) === 1) grid[e] = 1
  }
  /** 逐帧维护的当前盘面，保证每帧 from 都是回放当时的值 */
  const display = s.edges.slice()
  const touched = new Array<boolean>(total).fill(false)
  let streak = 0

  const pushFrame = (
    index: number,
    value: number,
    rule: number,
    label: string,
  ): void => {
    const from = display[index] ?? 0
    grid[index] = value
    touched[index] = true
    if (from === value) return
    display[index] = value
    streak++
    const move: Move = { index, from, to: value }
    frames.push({ rule, label, move, streak })
  }

  const onSet = (index: number, value: number, rule: DeductionRule): void => {
    // propagate 会先把值写进工作数组再回调，所以这里用「逐帧盘面 display」判断是否真的变了
    if (display[index] === value) return
    const info = RULE_INFO[rule]
    pushFrame(index, value, info.no, info.label(value))
  }

  if (!propagate(grid, p, onSet)) return null

  let saturated = true
  if (grid.some((v) => v === -1)) {
    saturated = false
    const solution = findSolution(p, 2_000_000)
    if (!solution) return null
    for (let e = 0; e < total; e++) {
      if (grid[e] !== -1) continue
      pushFrame(e, solution[e]!, RULE_BACKTRACK, '回溯试探：该边是否缝合')
    }
  }

  const values = grid.map((v) => (v === 1 ? 1 : 0))
  if (!checkSolution(values, p).ok) return null
  for (let e = 0; e < total; e++) {
    if (touched[e]) continue
    if (values[e] === (display[e] ?? 0)) continue
    pushFrame(e, values[e]!, RULE_FINAL, '补全：该边最终状态')
  }

  const finalState: StitchesState = {
    puzzleId: s.puzzleId,
    width: p.width,
    height: p.height,
    edges: values.slice(),
  }
  return { puzzleId: p.id, frames, finalState, ruleSteps: frames.length, saturated }
}

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): LogicPlan {
  const p = asStitchesPuzzle(puzzle)
  const s = asStitchesState(initialState)
  const emptyPlan: LogicPlan = {
    puzzleId: p.id,
    frames: [],
    finalState: null,
    ruleSteps: 0,
    saturated: false,
  }

  const seeded = attempt(p, s, true)
  if (seeded) return seeded
  // 玩家标记与规则矛盾时，退回只看题面的旧路径（回放仍从当前盘面出发纠正）
  if (hasPlayerStitches(s)) {
    const plain = attempt(p, s, false)
    if (plain) return plain
  }
  return emptyPlan
}
