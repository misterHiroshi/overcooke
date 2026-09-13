import { STATIONS } from './stations'
import {
  type Facing,
  type HeldItem,
  type Ingredient,
  type Order,
  type PlayerInput,
  type PlayerSnapshot,
  type StateSnapshot,
  type StationDef,
  isDish,
  dishMatchesRecipe,
  INGREDIENT_PREP,
  RECIPES,
  CUT_DURATION,
  COOK_DURATION,
  GAME_DURATION,
  ORDER_TIME_LIMIT,
  ORDER_SPAWN_INTERVAL,
  MAX_ORDERS,
  SCORE_PER_ORDER,
  TIMEOUT_PENALTY,
} from './types'

const PLAYER_SIZE = 32
const MOVE_SPEED = 200 // px/秒
const INTERACT_REACH = 16

const RESTART_DELAY = 5 // 秒: ゲーム終了後、次のラウンド開始までの待ち時間

const PLAYER_COLORS = [0x4da6ff, 0xff8a65, 0x81c784, 0xba68c8]
const SPAWN_POINTS = [
  { x: 340, y: 280 },
  { x: 460, y: 280 },
  { x: 340, y: 360 },
  { x: 460, y: 360 },
]

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

interface StationRuntime {
  def: StationDef
  bounds: Rect
  itemOnStation?: Ingredient
  progress: number
}

interface PlayerRuntime {
  id: string
  x: number
  y: number
  color: number
  holding: HeldItem | null
  input: PlayerInput
  facing: Facing
}

/**
 * 1つのキッチン(ゲームセッション)を丸ごと管理する。
 * サーバー権威モデル: このクラスの中身だけが「正解」の状態。
 * クライアントは入力を送るだけ、描画はserialize()の結果を使う。
 */
export class GameRoom {
  private players = new Map<string, PlayerRuntime>()
  private stations: StationRuntime[] = STATIONS.map((def) => ({
    def,
    bounds: { x: def.x, y: def.y, width: def.width, height: def.height },
    progress: 0,
  }))

  private orders: Order[] = []
  private nextOrderId = 1
  private spawnTimer = ORDER_SPAWN_INTERVAL
  private score = 0
  private gameTimeLeft = GAME_DURATION
  private gameOver = false
  private restartTimer = 0
  // 接続順に増え続けるカウンター。players.sizeだと途中で誰か切断した時に
  // 番号がズレて色が衝突するため、これで割り当てる
  private connectionCounter = 0

  addPlayer(id: string): void {
    const slot = this.connectionCounter++
    const spawn = SPAWN_POINTS[slot % SPAWN_POINTS.length]
    const color = PLAYER_COLORS[slot % PLAYER_COLORS.length]
    this.players.set(id, {
      id,
      x: spawn.x,
      y: spawn.y,
      color,
      holding: null,
      input: { left: false, right: false, up: false, down: false, space: false },
      facing: 'down',
    })
  }

  removePlayer(id: string): void {
    this.players.delete(id)
  }

  setInput(id: string, input: PlayerInput): void {
    const player = this.players.get(id)
    if (player) player.input = input
  }

  /** Spaceキーが押された瞬間(移動/連続処理とは別に1回だけ実行) */
  interact(id: string): void {
    if (this.gameOver) return
    const player = this.players.get(id)
    if (!player) return

    const station = this.nearbyStation(player)
    if (!station) return

    switch (station.def.type) {
      case 'ingredient':
        this.interactIngredientStation(player, station)
        break
      case 'cutting_board':
        this.interactPrepStation(player, station, 'cut')
        break
      case 'stove':
        this.interactPrepStation(player, station, 'cook')
        break
      case 'plate_stack':
        this.interactPlateStack(player)
        break
      case 'serving':
        this.interactServing(player)
        break
      case 'trash':
        player.holding = null
        break
    }
  }

  private interactIngredientStation(player: PlayerRuntime, station: StationRuntime): void {
    const ingredientKind = station.def.ingredientKind!
    const prep = INGREDIENT_PREP[ingredientKind]

    if (!player.holding) {
      // 手が空 → 新しく取る(下ごしらえ不要な食材はそのまま使える状態で)
      player.holding = { kind: 'ingredient', ingredientKind, state: prep === 'none' ? 'ready' : 'raw' }
      return
    }

    // 皿を持っていて、下ごしらえ不要な食材(パン等)ならそのまま皿に追加できる
    if (isDish(player.holding) && prep === 'none') {
      player.holding.items.push({ kind: 'ingredient', ingredientKind, state: 'ready' })
    }
  }

  /** まな板(cut)とコンロ(cook)で共通の「置く/取る/皿に追加する」処理 */
  private interactPrepStation(
    player: PlayerRuntime,
    station: StationRuntime,
    prepType: 'cut' | 'cook',
  ): void {
    const doneState = prepType === 'cut' ? 'cut' : 'cooked'

    // 手に該当する下ごしらえ前の食材を持っていて、台が空 → 置く
    if (
      player.holding &&
      !isDish(player.holding) &&
      player.holding.state === 'raw' &&
      INGREDIENT_PREP[player.holding.ingredientKind] === prepType &&
      !station.itemOnStation
    ) {
      station.itemOnStation = player.holding
      station.progress = 0
      player.holding = null
      return
    }

    const readyItem = station.itemOnStation?.state === doneState ? station.itemOnStation : undefined
    if (!readyItem) return

    // 台に完成品が乗ってる状態で、手が空 → そのまま持つ
    if (!player.holding) {
      player.holding = readyItem
      station.itemOnStation = undefined
      station.progress = 0
      return
    }

    // 台に完成品が乗ってる状態で、皿を持っている → 皿に追加する
    if (isDish(player.holding)) {
      player.holding.items.push(readyItem)
      station.itemOnStation = undefined
      station.progress = 0
    }
  }

  private interactPlateStack(player: PlayerRuntime): void {
    if (!player.holding) {
      player.holding = { kind: 'plate', items: [] }
      return
    }
    // 下ごしらえ済みの単品を持っている → 皿に乗せ替える(単品持ち運びのショートカット)
    if (!isDish(player.holding) && player.holding.state !== 'raw') {
      player.holding = { kind: 'plate', items: [player.holding] }
    }
  }

  private interactServing(player: PlayerRuntime): void {
    if (!player.holding || !isDish(player.holding)) return
    const dish = player.holding
    player.holding = null

    for (const recipe of RECIPES) {
      if (!dishMatchesRecipe(dish, recipe)) continue
      const matchIndex = this.orders.findIndex((o) => o.recipe === recipe.id)
      if (matchIndex === -1) continue
      this.orders.splice(matchIndex, 1)
      this.score += SCORE_PER_ORDER
      return
    }
    // どの注文にもマッチしなければ皿は無駄になる(スコアなし)
  }

  private nearbyStation(player: PlayerRuntime): StationRuntime | undefined {
    const half = PLAYER_SIZE / 2 + INTERACT_REACH
    const reach: Rect = { x: player.x - half, y: player.y - half, width: half * 2, height: half * 2 }
    return this.stations.find((s) => overlaps(s.bounds, reach))
  }

  /** 1tick分ゲームを進める */
  tick(seconds: number): void {
    if (this.gameOver) {
      // 終了画面をしばらく表示した後、自動で次のラウンドを始める
      this.restartTimer += seconds
      if (this.restartTimer >= RESTART_DELAY) {
        this.resetRound()
      }
      return
    }

    for (const player of this.players.values()) {
      this.moveWithCollision(player, seconds)
    }

    // まな板: 誰かがSpaceを押しながら隣接していれば進捗が進む
    for (const station of this.stations) {
      if (station.def.type !== 'cutting_board') continue
      const item = station.itemOnStation
      if (!item || item.state !== 'raw') continue
      const someoneChopping = [...this.players.values()].some(
        (p) => p.input.space && this.nearbyStation(p) === station,
      )
      if (someoneChopping) {
        station.progress += seconds / CUT_DURATION
        if (station.progress >= 1) {
          item.state = 'cut'
          station.progress = 1
        }
      }
    }

    // コンロ: 自動加熱
    for (const station of this.stations) {
      if (station.def.type !== 'stove') continue
      const item = station.itemOnStation
      if (!item || item.state !== 'raw') continue
      station.progress += seconds / COOK_DURATION
      if (station.progress >= 1) {
        item.state = 'cooked'
        station.progress = 1
      }
    }

    this.updateOrders(seconds)

    this.gameTimeLeft -= seconds
    if (this.gameTimeLeft <= 0) {
      this.gameTimeLeft = 0
      this.gameOver = true
    }
  }

  /** ラウンドをリセットして次のゲームを始める(プレイヤーは接続を保ったまま) */
  private resetRound(): void {
    this.restartTimer = 0
    this.score = 0
    this.gameTimeLeft = GAME_DURATION
    this.gameOver = false
    this.orders = []
    this.spawnTimer = ORDER_SPAWN_INTERVAL

    for (const station of this.stations) {
      station.itemOnStation = undefined
      station.progress = 0
    }

    let i = 0
    for (const player of this.players.values()) {
      const spawn = SPAWN_POINTS[i % SPAWN_POINTS.length]
      player.x = spawn.x
      player.y = spawn.y
      player.holding = null
      i++
    }
  }

  private moveWithCollision(player: PlayerRuntime, seconds: number): void {
    const distance = MOVE_SPEED * seconds
    let dx = 0
    let dy = 0
    if (player.input.left) dx -= distance
    if (player.input.right) dx += distance
    if (player.input.up) dy -= distance
    if (player.input.down) dy += distance

    // 向き(facing)は最後に押された方向のキーで更新する(持ち物の表示位置に使う)
    if (player.input.left) player.facing = 'left'
    else if (player.input.right) player.facing = 'right'
    else if (player.input.up) player.facing = 'up'
    else if (player.input.down) player.facing = 'down'

    const half = PLAYER_SIZE / 2

    if (dx !== 0) {
      const next: Rect = { x: player.x + dx - half, y: player.y - half, width: PLAYER_SIZE, height: PLAYER_SIZE }
      if (!this.stations.some((s) => overlaps(s.bounds, next))) player.x += dx
    }
    if (dy !== 0) {
      const next: Rect = { x: player.x - half, y: player.y + dy - half, width: PLAYER_SIZE, height: PLAYER_SIZE }
      if (!this.stations.some((s) => overlaps(s.bounds, next))) player.y += dy
    }
  }

  private updateOrders(seconds: number): void {
    this.spawnTimer += seconds
    if (this.spawnTimer >= ORDER_SPAWN_INTERVAL && this.orders.length < MAX_ORDERS) {
      this.spawnTimer = 0
      const recipe = RECIPES[Math.floor(Math.random() * RECIPES.length)]
      this.orders.push({
        id: this.nextOrderId++,
        recipe: recipe.id,
        timeLeft: ORDER_TIME_LIMIT,
        timeLimit: ORDER_TIME_LIMIT,
      })
    }

    for (const order of this.orders) order.timeLeft -= seconds
    const expiredCount = this.orders.filter((o) => o.timeLeft <= 0).length
    if (expiredCount > 0) {
      this.orders = this.orders.filter((o) => o.timeLeft > 0)
      this.score = Math.max(0, this.score - TIMEOUT_PENALTY * expiredCount)
    }
  }

  /** クライアントに送る静的レイアウト(接続直後に1回送る) */
  getStationDefs(): StationDef[] {
    return this.stations.map((s) => s.def)
  }

  serialize(): StateSnapshot {
    const players: PlayerSnapshot[] = [...this.players.values()].map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      color: p.color,
      holding: p.holding,
      facing: p.facing,
    }))

    return {
      players,
      stations: this.stations.map((s) => ({
        id: s.def.id,
        itemOnStation: s.itemOnStation,
        progress: s.progress,
      })),
      orders: this.orders,
      score: this.score,
      gameTimeLeft: this.gameTimeLeft,
      gameOver: this.gameOver,
    }
  }
}
