/**
 * 缝线 —— 实时校验
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'
import { checkSolution } from './rules'
import { asStitchesPuzzle, asStitchesState, type StitchesResult } from './types'

export function validate(state: GameState, puzzle: Puzzle): StitchesResult {
  const s = asStitchesState(state)
  const p = asStitchesPuzzle(puzzle)
  const out = checkSolution(s.edges, p)
  return {
    solved: out.ok,
    badCells: out.badCells,
    rowActual: out.rowActual,
    colActual: out.colActual,
    rowBad: out.rowBad,
    colBad: out.colBad,
    pairMissing: out.pairMissing,
    pairDuplicated: out.pairDuplicated,
  }
}

export function statusBits(result: ValidationResult): string[] {
  const r = result as StitchesResult
  if (r.solved) return ['完成']
  const bits: string[] = []
  if (r.pairMissing.length > 0) bits.push(`${r.pairMissing.length} 对相邻区块还没缝`)
  if (r.pairDuplicated.length > 0) bits.push(`${r.pairDuplicated.length} 对区块缝了多条`)
  if (r.rowBad.length > 0) bits.push(`${r.rowBad.length} 行针孔数不对`)
  if (r.colBad.length > 0) bits.push(`${r.colBad.length} 列针孔数不对`)
  if (bits.length === 0) bits.push('继续缝线')
  return bits
}
