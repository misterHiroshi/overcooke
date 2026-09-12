export type StationType =
  | 'ingredient' // 食材置き場
  | 'cutting_board' // まな板
  | 'stove' // コンロ
  | 'plate_stack' // 皿置き場
  | 'serving' // 提供口
  | 'trash' // ゴミ箱

export interface StationDef {
  type: StationType
  label: string
  color: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * キッチンの設備配置。
 * STEP3時点では見た目と当たり判定のみ(調理ロジックは未実装)。
 */
export const STATIONS: StationDef[] = [
  { type: 'ingredient', label: '食材', color: 0x8bc34a, x: 60, y: 60, width: 80, height: 80 },
  { type: 'cutting_board', label: 'まな板', color: 0xd7ccc8, x: 360, y: 40, width: 80, height: 60 },
  { type: 'stove', label: 'コンロ', color: 0xff7043, x: 700, y: 60, width: 80, height: 80 },
  { type: 'plate_stack', label: '皿置き場', color: 0x90caf9, x: 60, y: 500, width: 80, height: 80 },
  { type: 'serving', label: '提供口', color: 0xffd54f, x: 700, y: 500, width: 80, height: 80 },
  { type: 'trash', label: 'ゴミ箱', color: 0x616161, x: 380, y: 540, width: 60, height: 60 },
]
