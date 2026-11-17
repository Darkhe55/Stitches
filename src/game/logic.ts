/**
 * 缝线 —— 逻辑解题回放
 *
 * 推理阶段调用 rules.ts 的规则传播（只做可证明的局部推理），推到不动点后
 * 仍未定的边才用回溯搜索补全，因此绝大多数题目不会有「回溯」帧。
 */

import type { GameState, LogicPlan, Move, PlaybackFrame, Puzzle } from '../core/types'
import { checkSolution, propagate, type DeductionRule } from './rules'
import { findSolution } from './solver'
import {
  asStitchesPuzzle,
  asStitchesState,
  buildEdges,
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

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): LogicPlan {
  const p = asStitchesPuzzle(puzzle)
  const s = asStitchesState(initialState)
  const edges = buildEdges(p.regions ?? [], p.width, p.height)
  const total = edges.length
  const frames: PlaybackFrame[] = []
  const grid = new Array<number>(total).fill(-1)
  let streak = 0

  const pushFrame = (
    index: number,
    value: number,
    rule: number,
    label: string,
  ): void => {
    const from = grid[index] === 1 ? 1 : 0
    grid[index] = value
    streak++
    const move: Move = { index, from, to: value }
    frames.push({ rule, label, move, streak })
  }

  const onSet = (index: number, value: number, rule: DeductionRule): void => {
    if (grid[index] === value) return
    const info = RULE_INFO[rule]
    pushFrame(index, value, info.no, info.label(value))
  }

  if (!propagate(grid, p, onSet)) {
    return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
  }

  let saturated = true
  if (grid.some((v) => v === -1)) {
    saturated = false
    const solution = findSolution(p, 2_000_000)
    if (!solution) {
      return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
    }
    for (let e = 0; e < total; e++) {
      if (grid[e] !== -1) continue
      pushFrame(e, solution[e]!, RULE_BACKTRACK, '回溯试探：该边是否缝合')
    }
  }

  const values = grid.map((v) => (v === 1 ? 1 : 0))
  if (!checkSolution(values, p).ok) {
    return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
  }
  for (let e = 0; e < total; e++) {
    const from = s.edges[e] ?? 0
    if (values[e] === from) continue
    streak++
    frames.push({
      rule: RULE_FINAL,
      label: '补全：该边最终状态',
      move: { index: e, from, to: values[e]! },
      streak,
    })
  }

  const finalState: StitchesState = {
    puzzleId: s.puzzleId,
    width: p.width,
    height: p.height,
    edges: values,
  }
  return { puzzleId: p.id, frames, finalState, ruleSteps: frames.length, saturated }
}
