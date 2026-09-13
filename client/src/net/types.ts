// サーバー(server/src/game/types.ts)から送られてくるデータの型。
// 今はモノレポ構成にしていないため手動で同期している。

export type IngredientKind = 'tomato' | 'lettuce' | 'patty' | 'bun'
export type IngredientState = 'raw' | 'cut' | 'cooked' | 'ready'

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

export interface PlayerSnapshot {
  id: string
  x: number
  y: number
  color: number
  holding: HeldItem | null
  facing: Facing
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

export function recipeLabel(id: Recipe['id']): string {
  return RECIPES.find((r) => r.id === id)?.label ?? id
}

const INGREDIENT_KIND_LABEL: Record<IngredientKind, string> = {
  tomato: 'トマト',
  lettuce: 'レタス',
  patty: '肉',
  bun: 'パン',
}

const INGREDIENT_STATE_LABEL: Record<IngredientState, string> = {
  raw: '生',
  cut: 'カット済',
  cooked: '調理済',
  ready: '',
}

function ingredientLabel(item: Ingredient): string {
  const stateLabel = INGREDIENT_STATE_LABEL[item.state]
  const kindLabel = INGREDIENT_KIND_LABEL[item.ingredientKind]
  return stateLabel ? `${kindLabel}:${stateLabel}` : kindLabel
}

export function labelFor(item: HeldItem): string {
  if (isDish(item)) {
    if (item.items.length === 0) return '皿(空)'
    return `皿(${item.items.map(ingredientLabel).join(', ')})`
  }
  return ingredientLabel(item)
}

const INGREDIENT_EMOJI: Record<IngredientKind, string> = {
  tomato: '🍅',
  lettuce: '🥬',
  patty: '🥩',
  bun: '🍞',
}

const RECIPE_EMOJI: Record<Recipe['id'], string> = {
  salad: '🥗',
  hamburger: '🍔',
}

/** 皿の中身が指定レシピの要求と過不足なく一致するか(見た目の判定用) */
function dishMatchesRecipe(dish: Dish, recipe: Recipe): boolean {
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

/** 表示用の絵文字。皿が完成レシピと一致していれば完成品の絵文字を返す */
export function emojiFor(item: HeldItem): string {
  if (isDish(item)) {
    if (item.items.length === 0) return '🍽️'
    const matched = RECIPES.find((r) => dishMatchesRecipe(item, r))
    if (matched) return RECIPE_EMOJI[matched.id]
    return item.items.map((i) => INGREDIENT_EMOJI[i.ingredientKind]).join('')
  }
  return INGREDIENT_EMOJI[item.ingredientKind]
}
