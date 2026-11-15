/**
 * 不等式题库生成配置
 */

import { generatePuzzles as generate } from '../src/game/generator.ts'

export const NAME = '缝线生成器'

export function generatePuzzles() {
  return generate()
}
