/**
 * 缝线（Stitches 1÷）—— 类型
 *
 * regions[i]：区块编号。
 * edges[e]：相邻格之间的边，1 表示缝线。
 * rowCounts / colCounts：盘外行列针孔数。
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'

export interface StitchesPuzzle extends Puzzle {
  regions: number[]
  rowCounts: number[]
  colCounts: number[]
  solutionEdges?: string
}

export interface StitchesState extends GameState {
  edges: number[]
}

export interface StitchesEdge {
  a: number
  b: number
  horizontal: boolean
  candidate: boolean
}

export interface StitchesResult extends ValidationResult {
  badCells: number[]
  rowActual: number[]
  colActual: number[]
  rowBad: number[]
  colBad: number[]
  pairMissing: string[]
  pairDuplicated: string[]
}

export function asStitchesPuzzle(p: Puzzle): StitchesPuzzle {
  return p as StitchesPuzzle
}

export function asStitchesState(s: GameState): StitchesState {
  return s as StitchesState
}

export function buildEdges(regions: ArrayLike<number>, w: number, h: number): StitchesEdge[] {
  const edges: StitchesEdge[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x + 1 < w; x++) {
      const a = y * w + x
      const b = a + 1
      edges.push({ a, b, horizontal: true, candidate: regions[a] !== regions[b] })
    }
  }
  for (let y = 0; y + 1 < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = y * w + x
      const b = a + w
      edges.push({ a, b, horizontal: false, candidate: regions[a] !== regions[b] })
    }
  }
  return edges
}

export function edgeCount(w: number, h: number): number {
  return h * (w - 1) + w * (h - 1)
}

export function pairKeyOf(regions: ArrayLike<number>, a: number, b: number): string {
  const ra = regions[a] ?? 0
  const rb = regions[b] ?? 0
  return ra <= rb ? `${ra}-${rb}` : `${rb}-${ra}`
}

export function incidentEdges(edges: StitchesEdge[], size: number): number[][] {
  const out: number[][] = Array.from({ length: size }, () => [])
  for (let e = 0; e < edges.length; e++) {
    if (!edges[e]!.candidate) continue
    out[edges[e]!.a]!.push(e)
    out[edges[e]!.b]!.push(e)
  }
  return out
}

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'

export function encodeRegions(regions: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < regions.length; i++) out += BASE36[(regions[i]! | 0) % 36]!
  return out
}

export function decodeRegions(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected).fill(0)
  for (let i = 0; i < expected; i++) {
    const v = BASE36.indexOf(text[i]!.toLowerCase())
    if (v < 0) return null
    out[i] = v
  }
  return out
}

export function encodeCounts(counts: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < counts.length; i++) out += String(Math.max(0, Math.min(9, counts[i]! | 0)))
  return out
}

export function decodeCounts(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected).fill(0)
  for (let i = 0; i < expected; i++) {
    const v = text.charCodeAt(i) - 48
    if (v < 0 || v > 9) return null
    out[i] = v
  }
  return out
}

export function encodeEdges(edges: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < edges.length; i++) out += edges[i] ? '1' : '0'
  return out
}

export function decodeEdges(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected).fill(0)
  for (let i = 0; i < expected; i++) {
    if (text[i] === '1') out[i] = 1
    else if (text[i] === '0') out[i] = 0
    else return null
  }
  return out
}
