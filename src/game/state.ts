/**
 * 缝线 —— 状态
 */

import type { GameState, HitTarget, Move, Puzzle } from '../core/types'
import {
  asStitchesPuzzle,
  asStitchesState,
  decodeEdges,
  edgeCount,
  encodeEdges,
  type StitchesState,
} from './types'

export function createEmptyState(puzzle: Puzzle): StitchesState {
  const p = asStitchesPuzzle(puzzle)
  return {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    edges: new Array<number>(edgeCount(p.width, p.height)).fill(0),
  }
}

export function cloneState(state: GameState): StitchesState {
  const s = asStitchesState(state)
  return {
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    edges: s.edges.slice(),
  }
}

export function cycleValue(state: GameState, target: HitTarget): number {
  const s = asStitchesState(state)
  return (s.edges[target.index] ?? 0) ? 0 : 1
}

export function rightClickValue(state: GameState, target: HitTarget): number {
  const s = asStitchesState(state)
  return (s.edges[target.index] ?? 0) ? 0 : 1
}

export function applyMove(state: GameState, move: Move): void {
  const s = asStitchesState(state)
  if (move.index < 0 || move.index >= s.edges.length) return
  s.edges[move.index] = move.to ? 1 : 0
}

export function invertMove(move: Move): Move {
  return { index: move.index, from: move.to, to: move.from }
}

export function valueAt(state: GameState, index: number): number {
  return asStitchesState(state).edges[index] ?? 0
}

export function serializeState(state: GameState): Record<string, unknown> {
  const s = asStitchesState(state)
  return {
    version: 1,
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    edgeCount: s.edges.length,
    edges: encodeEdges(s.edges),
  }
}

export function deserializeState(data: Record<string, unknown>): StitchesState | null {
  if (typeof data.puzzleId !== 'string') return null
  if (typeof data.width !== 'number' || typeof data.height !== 'number') return null
  const expected = typeof data.edgeCount === 'number' ? data.edgeCount : 0
  if (expected <= 0) return null
  const edges = typeof data.edges === 'string' ? decodeEdges(data.edges, expected) : null
  if (!edges) return null
  return { puzzleId: data.puzzleId, width: data.width, height: data.height, edges }
}

export function firstHintMove(state: GameState, solution: GameState): Move | null {
  const s = asStitchesState(state)
  const sol = asStitchesState(solution)
  for (let i = 0; i < s.edges.length; i++) {
    if ((s.edges[i] ?? 0) !== (sol.edges[i] ?? 0)) {
      return { index: i, from: s.edges[i] ?? 0, to: sol.edges[i] ?? 0 }
    }
  }
  return null
}
