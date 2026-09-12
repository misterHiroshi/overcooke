/** 食材の状態 */
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

/** プレイヤーが持っている物の表示用ラベル */
export function labelFor(item: HeldItem): string {
  if (isDish(item)) {
    return `皿(${labelFor(item.item)})`
  }
  const stateLabel: Record<IngredientState, string> = {
    raw: '生',
    cut: 'カット済',
    cooked: '調理済',
  }
  return `トマト:${stateLabel[item.state]}`
}

// 切る/焼くに必要な秒数
export const CUT_DURATION = 2
export const COOK_DURATION = 3
