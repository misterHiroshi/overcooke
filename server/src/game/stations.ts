import type { StationDef } from './types'

/**
 * キッチンの設備配置。
 * client/src/net/types.ts 経由でクライアントにも同じ内容がinitイベントで届く。
 *
 * まな板は2台ある: サラダはトマト・レタス両方を切る必要があり、
 * まな板1台だと「切った物を置いたまま皿を取りに行く」動線が2重に必要になり
 * 1人プレイで詰むため。
 */
export const STATIONS: StationDef[] = [
  { id: 0, type: 'ingredient', ingredientKind: 'tomato', label: 'トマト', color: 0x8bc34a, x: 20, y: 50, width: 70, height: 70 },
  { id: 1, type: 'cutting_board', label: 'まな板', color: 0xd7ccc8, x: 100, y: 40, width: 80, height: 50 },
  { id: 2, type: 'ingredient', ingredientKind: 'lettuce', label: 'レタス', color: 0xa5d6a7, x: 190, y: 50, width: 70, height: 70 },
  { id: 3, type: 'cutting_board', label: 'まな板', color: 0xd7ccc8, x: 270, y: 40, width: 80, height: 50 },
  { id: 4, type: 'ingredient', ingredientKind: 'patty', label: '肉', color: 0x8d6e63, x: 360, y: 50, width: 70, height: 70 },
  { id: 5, type: 'stove', label: 'コンロ', color: 0xff7043, x: 440, y: 50, width: 70, height: 70 },
  { id: 6, type: 'ingredient', ingredientKind: 'bun', label: 'パン', color: 0xffcc80, x: 520, y: 50, width: 70, height: 70 },
  { id: 7, type: 'plate_stack', label: '皿置き場', color: 0x90caf9, x: 60, y: 500, width: 80, height: 80 },
  { id: 8, type: 'serving', label: '提供口', color: 0xffd54f, x: 700, y: 500, width: 80, height: 80 },
  { id: 9, type: 'trash', label: 'ゴミ箱', color: 0x616161, x: 380, y: 540, width: 60, height: 60 },
]
