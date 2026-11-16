/**
 * 缝线 —— SVG 渲染
 */

import {
  cellCenter,
  edgeAtPoint,
  originOf,
  regionBoundarySegments,
  regionFill,
  squareMetrics,
  cellSizeOf,
} from '../core/board'
import type { BoardMetrics, GameState, HitTarget, Puzzle, ValidationResult } from '../core/types'
import {
  asStitchesPuzzle,
  asStitchesState,
  buildEdges,
  stitchPerPairOf,
  type StitchesResult,
} from './types'

export function metricsFor(puzzle: Puzzle): BoardMetrics {
  return squareMetrics(puzzle.width, puzzle.height, {
    cell: 58,
    padLeft: 38,
    padTop: 34,
    padRight: 14,
    padBottom: 14,
  })
}

export function renderBoard(
  puzzle: Puzzle,
  state: GameState,
  result: ValidationResult,
): string {
  const p = asStitchesPuzzle(puzzle)
  const s = asStitchesState(state)
  const r = result as StitchesResult
  const m = metricsFor(puzzle)
  const o = originOf(m)
  const { w: cw, h: ch } = cellSizeOf(m)
  const bad = new Set(r.badCells ?? [])
  const edges = buildEdges(p.regions ?? [], p.width, p.height)
  const k = stitchPerPairOf(p)
  const parts: string[] = []

  parts.push(
    `<rect class="st-board-bg" x="${o.x}" y="${o.y}" width="${(cw * p.width).toFixed(2)}" height="${(ch * p.height).toFixed(2)}" />`,
  )

  for (let i = 0; i < p.width * p.height; i++) {
    const x = o.x + (i % p.width) * cw
    const y = o.y + Math.floor(i / p.width) * ch
    parts.push(
      `<rect class="st-cell" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}" fill="${regionFill(p.regions?.[i] ?? 0)}" />`,
    )
  }

  for (const seg of regionBoundarySegments(m, p.regions ?? [])) {
    parts.push(
      `<line class="st-region" x1="${seg.x1.toFixed(2)}" y1="${seg.y1.toFixed(2)}" x2="${seg.x2.toFixed(2)}" y2="${seg.y2.toFixed(2)}" />`,
    )
  }

  for (let e = 0; e < edges.length; e++) {
    if ((s.edges[e] ?? 0) !== 1) continue
    const edge = edges[e]!
    const ca = cellCenter(m, edge.a)
    const cb = cellCenter(m, edge.b)
    const mx = (ca.x + cb.x) / 2
    const my = (ca.y + cb.y) / 2
    const len = cw * 0.26
    if (edge.horizontal) {
      parts.push(
        `<line class="st-stitch" x1="${(mx - len).toFixed(2)}" y1="${my.toFixed(2)}" x2="${(mx + len).toFixed(2)}" y2="${my.toFixed(2)}" />`,
      )
    } else {
      parts.push(
        `<line class="st-stitch" x1="${mx.toFixed(2)}" y1="${(my - len).toFixed(2)}" x2="${mx.toFixed(2)}" y2="${(my + len).toFixed(2)}" />`,
      )
    }
  }

  // 盘外数字：两位数（如 10）适当地缩小字号，避免超出留白
  const clueFont = (value: number): number => m.cell * (value >= 10 ? 0.26 : 0.3)
  for (let x = 0; x < p.width; x++) {
    const cx = o.x + (x + 0.5) * cw
    const badCol = (r.colBad ?? []).includes(x)
    const value = p.colCounts?.[x] ?? 0
    parts.push(
      `<text class="st-count${badCol ? ' bad' : ''}" x="${cx.toFixed(2)}" y="${(o.y - m.cell * 0.22).toFixed(2)}" style="font-size:${clueFont(value).toFixed(2)}px">${value}</text>`,
    )
  }
  for (let y = 0; y < p.height; y++) {
    const cy = o.y + (y + 0.5) * ch
    const badRow = (r.rowBad ?? []).includes(y)
    const value = p.rowCounts?.[y] ?? 0
    parts.push(
      `<text class="st-count${badRow ? ' bad' : ''}" x="${(o.x - m.cell * 0.24).toFixed(2)}" y="${(cy + 2).toFixed(2)}" style="font-size:${clueFont(value).toFixed(2)}px">${value}</text>`,
    )
  }

  // K÷ 变体徽标（K>1 时才画，1÷ 经典题面保持原样）
  if (k > 1) {
    parts.push(
      `<text class="st-variant" x="${o.x.toFixed(2)}" y="${(o.y + ch * p.height + m.cell * 0.22).toFixed(2)}" style="font-size:${(m.cell * 0.19).toFixed(2)}px">${k}÷ · 每对相邻区域 ${k} 条线</text>`,
    )
  }

  for (let i = 0; i < p.width * p.height; i++) {
    if (!bad.has(i)) continue
    const x = o.x + (i % p.width) * cw
    const y = o.y + Math.floor(i / p.width) * ch
    parts.push(
      `<rect class="st-error" x="${(x + 1.5).toFixed(2)}" y="${(y + 1.5).toFixed(2)}" width="${(cw - 3).toFixed(2)}" height="${(ch - 3).toFixed(2)}" />`,
    )
  }

  return `<svg class="board-svg st-board" viewBox="0 0 ${m.svgWidth} ${m.svgHeight}" width="${m.svgWidth}" height="${m.svgHeight}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

export function hitTest(m: BoardMetrics, puzzle: Puzzle, x: number, y: number): HitTarget | null {
  void puzzle
  const edge = edgeAtPoint(m, x, y, m.cell * 0.45)
  return edge === null ? null : { index: edge, kind: 'edge' }
}
