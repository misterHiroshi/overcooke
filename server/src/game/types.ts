export type IngredientKind = 'tomato' | 'lettuce' | 'patty' | 'bun'
export type IngredientState = 'raw' | 'cut' | 'cooked' | 'ready'

/** 食材ごとに必要な下ごしらえ */
export const INGREDIENT_PREP: Record<IngredientKind, 'cut' | 'cook' | 'none'> = {
  tomato: 'cut',
  lettuce: 'cut',
  patty: 'cook',
  bun: 'none',
}

export interface Ingredient {
  kind: 'ingredient'
  ingredientKind: IngredientKind
  state: IngredientState
}

export interface Dish {
  kind: 'plate'
  items: Ingredient[]
}

export type HeldItem = Ingredient | Dish

export function isDish(item: HeldItem): item is Dish {
  return item.kind === 'plate'
}

export interface RecipeRequirement {
  ingredientKind: IngredientKind
  state: IngredientState
}

export interface Recipe {
  id: 'salad' | 'hamburger'
  label: string
  requires: RecipeRequirement[]
}

export const RECIPES: Recipe[] = [
  {
    id: 'salad',
    label: 'サラダ',
    requires: [
      { ingredientKind: 'tomato', state: 'cut' },
      { ingredientKind: 'lettuce', state: 'cut' },
    ],
  },
  {
    id: 'hamburger',
    label: 'ハンバーガー',
    requires: [
      { ingredientKind: 'bun', state: 'ready' },
      { ingredientKind: 'patty', state: 'cooked' },
      { ingredientKind: 'tomato', state: 'cut' },
    ],
  },
]

export function findRecipe(id: Recipe['id']): Recipe {
  const recipe = RECIPES.find((r) => r.id === id)
  if (!recipe) throw new Error(`unknown recipe: ${id}`)
  return recipe
}

/** 皿の中身が指定レシピの要求と過不足なく一致するか */
export function dishMatchesRecipe(dish: Dish, recipe: Recipe): boolean {
  if (dish.items.length !== recipe.requires.length) return false
  const remaining = [...dish.items]
  for (const req of recipe.requires) {
    const idx = remaining.findIndex(
      (item) => item.ingredientKind === req.ingredientKind && item.state === req.state,
    )
    if (idx === -1) return false
    remaining.splice(idx, 1)
  }
  return true
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
  /** type: 'ingredient' の場合のみ。どの食材を出すか */
  ingredientKind?: IngredientKind
}

export interface Order {
  id: number
  recipe: Recipe['id']
  timeLeft: number
  timeLimit: number
}

export type Facing = 'up' | 'down' | 'left' | 'right'

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
  facing: Facing
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

// ゲーム設定値(client/src/net/types.tsと同じ値)
export const CUT_DURATION = 2
export const COOK_DURATION = 3
export const GAME_DURATION = 120
export const ORDER_TIME_LIMIT = 25
export const ORDER_SPAWN_INTERVAL = 10
export const MAX_ORDERS = 4
export const SCORE_PER_ORDER = 10
export const TIMEOUT_PENALTY = 1
