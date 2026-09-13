export type IngredientState = 'raw' | 'cut' | 'cooked'

export interface Ingredient {
  kind: 'tomato'
  state: IngredientState
}

export interface Dish {
  kind: 'plate'
  item: Ingredient
}

export type HeldItem = Ingredient | Dish

export function isDish(item: HeldItem): item is Dish {
  return item.kind === 'plate'
}

export type StationType =
  | 'ingredient'
  | 'cutting_board'
  | 'stove'
  | 'plate_stack'
  | 'serving'
  | 'trash'

export interface StationDef {
  id: number
  type: StationType
  label: string
  color: number
  x: number
  y: number
  width: number
  height: number
}

export interface Order {
  id: number
  recipe: Ingredient['kind']
  timeLeft: number
  timeLimit: number
}

export interface PlayerInput {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  space: boolean
}

/** クライアントに送るプレイヤーの状態(見た目に必要な分だけ) */
export interface PlayerSnapshot {
  id: string
  x: number
  y: number
  color: number
  holding: HeldItem | null
}

/** クライアントに送る設備の動的な状態(位置等の静的情報はinitで別送済み) */
export interface StationSnapshot {
  id: number
  itemOnStation?: Ingredient
  progress: number
}

/** サーバーから毎tick送られる状態のスナップショット全体 */
export interface StateSnapshot {
  players: PlayerSnapshot[]
  stations: StationSnapshot[]
  orders: Order[]
  score: number
  gameTimeLeft: number
  gameOver: boolean
}

// ゲーム設定値(client/src/entities/Item.ts, Order.tsと同じ値)
export const CUT_DURATION = 2
export const COOK_DURATION = 3
export const GAME_DURATION = 120
export const ORDER_TIME_LIMIT = 15
export const ORDER_SPAWN_INTERVAL = 8
export const MAX_ORDERS = 4
export const SCORE_PER_ORDER = 10
export const TIMEOUT_PENALTY = 1
