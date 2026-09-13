import type { Ingredient } from './Item'

export interface Order {
  id: number
  /** 注文される食材の種類。現状はトマトのみ */
  recipe: Ingredient['kind']
  timeLeft: number
  timeLimit: number
}

// ゲーム全体の設定
export const GAME_DURATION = 120 // 秒
export const ORDER_TIME_LIMIT = 15 // 秒: 1注文の制限時間
export const ORDER_SPAWN_INTERVAL = 8 // 秒: 注文発生間隔
export const MAX_ORDERS = 4 // 同時に出る注文の上限

export const SCORE_PER_ORDER = 10
export const TIMEOUT_PENALTY = 1

export function recipeLabel(recipe: Order['recipe']): string {
  const labels: Record<Order['recipe'], string> = { tomato: 'トマト料理' }
  return labels[recipe]
}
