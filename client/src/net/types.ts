// サーバー(server/src/game/types.ts)から送られてくるデータの型。
// 今はモノレポ構成にしていないため手動で同期している。

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

export interface PlayerSnapshot {
  id: string
  x: number
  y: number
  color: number
  holding: HeldItem | null
}

export interface StationSnapshot {
  id: number
  itemOnStation?: Ingredient
  progress: number
}

export interface StateSnapshot {
  players: PlayerSnapshot[]
  stations: StationSnapshot[]
  orders: Order[]
  score: number
  gameTimeLeft: number
  gameOver: boolean
}

export function recipeLabel(recipe: Order['recipe']): string {
  const labels: Record<Order['recipe'], string> = { tomato: 'トマト料理' }
  return labels[recipe]
}

export function labelFor(item: HeldItem): string {
  if (isDish(item)) return `皿(${labelFor(item.item)})`
  const stateLabel: Record<IngredientState, string> = { raw: '生', cut: 'カット済', cooked: '調理済' }
  return `トマト:${stateLabel[item.state]}`
}
