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
    stitchPerPair: out.stitchPerPair,
  }
}

export function statusBits(result: ValidationResult): string[] {
  const r = result as StitchesResult
  if (r.solved) return ['完成']
  const bits: string[] = []
  const k = r.stitchPerPair ?? 1
  if (r.pairMissing.length > 0) {
    bits.push(k === 1 ? `${r.pairMissing.length} 对相邻区块还没缝` : `${r.pairMissing.length} 对相邻区块缝线不足 ${k} 条`)
  }
  if (r.pairDuplicated.length > 0) {
    bits.push(k === 1 ? `${r.pairDuplicated.length} 对区块缝了多条` : `${r.pairDuplicated.length} 对区块缝线超出 ${k} 条`)
  }
  if (r.rowBad.length > 0) bits.push(`${r.rowBad.length} 行针孔数不对`)
  if (r.colBad.length > 0) bits.push(`${r.colBad.length} 列针孔数不对`)
  if (bits.length === 0) bits.push('继续缝线')
  return bits
}
