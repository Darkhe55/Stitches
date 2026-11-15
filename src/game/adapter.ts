/**
 * ════════════════════════════════════════════════════════════════════
 *  缝线（Stitches 1÷）—— 游戏适配器
 * ════════════════════════════════════════════════════════════════════
 *
 * 状态：相邻格之间的边，1 = 缝线。
 */

import { playDrop, playPluck } from '../core/audio'
import type { CustomSupport, GameAdapter, Move, Puzzle, SolveResult } from '../core/types'
import { planLogicSolve } from './logic'
import { builtinPuzzles, getReferenceSolution } from './puzzles'
import { hitTest, metricsFor, renderBoard } from './render'
import { solvePuzzle } from './solver'
import {
  applyMove,
  cloneState,
  createEmptyState,
  cycleValue,
  deserializeState,
  firstHintMove,
  invertMove,
  rightClickValue,
  serializeState,
  valueAt,
} from './state'
import { statusBits, validate } from './validate'
import type { StitchesPuzzle } from './types'

const meta = {
  title: '缝线',
  tagline: '把每对相邻区块缝起来，每格最多一个针孔',
  footerNote:
    '规则：每对相邻区块之间恰好缝一条线，且只能缝在不同区块的相邻格之间（不能斜缝）；每格最多一个针孔。盘外数字表示该行/列上的针孔总数。',
  storageKeyPrefix: 'stitches',
  customIdPrefix: 'stitches-custom-',
  customMinW: 5,
  customMinH: 5,
  customMaxW: 10,
  customMaxH: 10,
  targetKind: 'edge' as const,
  interactionHint: '点击两格之间的边放下缝线；右键取消。',
}

const custom: CustomSupport = {
  mode: 'none',
  valueCycle: [null, 1],
  keyForDigit: () => undefined,
  cellLabel: (v) => (v == null ? '' : String(v)),
  hint: '缝线暂不支持自定义题板。',
  makePuzzle: (w, h, _grid, existingId) => ({
    id: existingId ?? `${meta.customIdPrefix}${w}x${h}-${Date.now()}`,
    name: `自定义 · ${w}×${h}`,
    width: w,
    height: h,
    difficulty: 'custom',
    regions: new Array<number>(w * h).fill(0),
    rowCounts: new Array<number>(h).fill(0),
    colCounts: new Array<number>(w).fill(0),
  } satisfies StitchesPuzzle),
  encodePuzzle: () => ({ board: '' }),
  decodePuzzle: () => null,
}

function playForMove(move: Move, streak: number): void {
  if (move.to === 1) playPluck(streak, 0.95)
  else playDrop(streak)
}

export const adapter: GameAdapter = {
  meta,
  builtinPuzzles,
  getReferenceSolution,
  createEmptyState,
  cloneState,
  cycleValue,
  rightClickValue,
  applyMove,
  invertMove,
  valueAt,
  serializeState,
  deserializeState,
  validate,
  statusBits,
  metricsFor,
  renderBoard,
  hitTest,
  planLogicSolve,
  solvePuzzle: (puzzle: Puzzle, maxNodes?: number): SolveResult => solvePuzzle(puzzle, maxNodes),
  firstHintMove,
  custom,
  playForMove,
}
