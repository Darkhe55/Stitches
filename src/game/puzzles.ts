/**
 * 缝线 —— 题库
 */

import type { Difficulty, GameState, Puzzle } from '../core/types'
import { RAW_PUZZLES } from './puzzles-data'
import {
  decodeCounts,
  decodeEdges,
  decodeRegions,
  edgeCount,
  type StitchesPuzzle,
  type StitchesState,
} from './types'

export interface RawPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series?: string
  /** 变体参数 K：每对相邻区块恰好 K 条缝线；缺省 1（经典 1÷） */
  k?: number
  board: string
  solution?: string
}

/** 解码题库条目；board 为 `区域|行数字|列数字`，可带第 4 段 K（缺省 1） */
export function decodePuzzle(raw: RawPuzzle): StitchesPuzzle | null {
  const expected = raw.width * raw.height
  const parts = raw.board.split('|')
  if (parts.length !== 3 && parts.length !== 4) return null
  const regions = decodeRegions(parts[0]!, expected)
  const rowCounts = decodeCounts(parts[1]!, raw.height)
  const colCounts = decodeCounts(parts[2]!, raw.width)
  if (!regions || !rowCounts || !colCounts) return null
  // K：新题库条目用 k 字段；也兼容把 K 作为 board 第 4 段的老式/外部写法
  let k = 1
  const rawK = raw.k ?? (parts[3] !== undefined && parts[3] !== '' ? Number(parts[3]) : undefined)
  if (rawK !== undefined) {
    if (!Number.isInteger(rawK) || rawK < 1 || rawK > 9) return null
    k = rawK
  }
  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    difficulty: raw.difficulty,
    regions,
    rowCounts,
    colCounts,
    stitchPerPair: k,
    solutionEdges: raw.solution,
  }
}

export const builtinPuzzles: Puzzle[] = (RAW_PUZZLES as RawPuzzle[])
  .map(decodePuzzle)
  .filter((p): p is StitchesPuzzle => p !== null)

export function getReferenceSolution(id: string): GameState | null {
  const raw = (RAW_PUZZLES as RawPuzzle[]).find((p) => p.id === id)
  if (!raw || typeof raw.solution !== 'string') return null
  const puzzle = decodePuzzle(raw)
  if (!puzzle) return null
  const edges = decodeEdges(raw.solution, edgeCount(puzzle.width, puzzle.height))
  if (!edges) return null
  const state: StitchesState = {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    edges,
  }
  return state
}
