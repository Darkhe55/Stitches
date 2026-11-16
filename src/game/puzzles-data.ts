/* 自动生成，勿手改。运行 npm run gen 重新生成。 */
export interface RawPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  series: string
  /** 变体参数 K：每对相邻区块恰好 K 条缝线（缺省 1，即经典 1÷） */
  k?: number
  /** 题面编码串（格式由 src/game/puzzles.ts 解析） */
  board: string
  /** 参考解编码串（没有则留空） */
  solution?: string
}

export const RAW_PUZZLES: RawPuzzle[] = [
  { id: "stitches-7x7-lgdqf5", name: "初识缝线", width: 7, height: 7, difficulty: 'easy', series: "入门", board: "9999888677777866655554444455433333311122221000000|5665563|7545636", solution: "000100000000001000000010000000001000100000101001001001011000000000100111001000000001" },
  { id: "stitches-7x7-lgdqf6", name: "针脚初现", width: 7, height: 7, difficulty: 'easy', series: "入门", board: "9999998777788876666664445555443333211222221110000|3557653|4663573", solution: "000001000100000000001000010000010000001000010000000100101100100000001110001000000010" },
  { id: "stitches-7x7-lgdqf7", name: "布块拼接", width: 7, height: 7, difficulty: 'medium', series: "进阶", board: "0224477022456701245670124568013456801335681133568|2652616|2455444", solution: "000010101001010100000000100010000000010101000000000000000000001001000000010000000000" },
  { id: "stitches-7x7-lgdqf8", name: "线迹迷宫", width: 7, height: 7, difficulty: 'medium', series: "进阶", board: "8664311866431186643108754320875432087542207755220|6343446|2555553", solution: "101010000100000000000000001010100100010101000000000000010110010000000000000000000000" },
  { id: "stitches-7x7-lgdqf9", name: "缝线之壁", width: 7, height: 7, difficulty: 'hard', series: "挑战", board: "0000111222211122333345544444555566687777768889999|3565665|4474746", solution: "000100000100010000010000000100000000001000001000000000111000100000000110100100100101" },
  { id: "stitches-7x7-lgdqfa", name: "终局缝线", width: 7, height: 7, difficulty: 'hard', series: "挑战", board: "0000011222211133333345554444566666687777778889999|3656444|6463634", solution: "000010000100000000001000000000000000001000100000000100111000100010000110100000100100" },
]
