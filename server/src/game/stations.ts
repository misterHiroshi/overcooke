import type { StationDef } from './types'

/**
 * キッチンの設備配置。
 * client/src/entities/Station.ts と同じレイアウト(見た目はクライアント側で描画)。
 */
export const STATIONS: StationDef[] = [
  { id: 0, type: 'ingredient', label: '食材', color: 0x8bc34a, x: 60, y: 60, width: 80, height: 80 },
  { id: 1, type: 'cutting_board', label: 'まな板', color: 0xd7ccc8, x: 360, y: 40, width: 80, height: 60 },
  { id: 2, type: 'stove', label: 'コンロ', color: 0xff7043, x: 700, y: 60, width: 80, height: 80 },
  { id: 3, type: 'plate_stack', label: '皿置き場', color: 0x90caf9, x: 60, y: 500, width: 80, height: 80 },
  { id: 4, type: 'serving', label: '提供口', color: 0xffd54f, x: 700, y: 500, width: 80, height: 80 },
  { id: 5, type: 'trash', label: 'ゴミ箱', color: 0x616161, x: 380, y: 540, width: 60, height: 60 },
]
