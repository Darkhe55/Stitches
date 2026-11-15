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
  board: string
  solution?: string
}

export function decodePuzzle(raw: RawPuzzle): StitchesPuzzle | null {
  const expected = raw.width * raw.height
  const parts = raw.board.split('|')
  if (parts.length !== 3) return null
  const regions = decodeRegions(parts[0]!, expected)
  const rowCounts = decodeCounts(parts[1]!, raw.height)
  const colCounts = decodeCounts(parts[2]!, raw.width)
  if (!regions || !rowCounts || !colCounts) return null
  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    difficulty: raw.difficulty,
    regions,
    rowCounts,
    colCounts,
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
