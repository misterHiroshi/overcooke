import Phaser from 'phaser'
import { STATIONS, type StationDef } from '../entities/Station'
import {
  type HeldItem,
  type Ingredient,
  isDish,
  labelFor,
  CUT_DURATION,
  COOK_DURATION,
} from '../entities/Item'

interface StationRuntime {
  def: StationDef
  bounds: Phaser.Geom.Rectangle
  labelText: Phaser.GameObjects.Text
  /** まな板/コンロに置かれている食材(調理中含む) */
  itemOnStation?: Ingredient
  /** 切る/焼くの進捗(0〜1) */
  progress: number
}

/**
 * ゲームのメインシーン。
 * STEP4時点では: 1食材(トマト)の 拾う→切る→焼く→皿に乗せる→提供 の
 * 最小フローをローカル単独で完結させる。
 *
 * 注: Phaser標準の input.keyboard.createCursorKeys() は、この環境では
 * 稀にkeyupを取りこぼしキーが押しっぱなし扱いのまま固まる不具合が確認されたため、
 * 生のDOM keydown/keyupイベントを自前で追跡する方式に切り替えている。
 */
export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle
  private readonly playerSize = 32
  private readonly moveSpeed = 200 // px/秒
  private readonly interactReach = 16 // プレイヤー矩形をこの分広げて設備との重なりを判定
  private readonly pressedKeys = new Set<string>()

  private stations: StationRuntime[] = []
  private holding: HeldItem | null = null
  private servedCount = 0

  private holdingText!: Phaser.GameObjects.Text
  private servedText!: Phaser.GameObjects.Text
  private heldItemVisual!: Phaser.GameObjects.Rectangle

  constructor() {
    super('MainScene')
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2f2f3a')

    this.stations = STATIONS.map((def) => this.createStationRuntime(def))

    this.player = this.add.rectangle(400, 300, this.playerSize, this.playerSize, 0x4da6ff)
    this.heldItemVisual = this.add.rectangle(400, 300, 12, 12, 0xffffff).setVisible(false)

    this.holdingText = this.add.text(10, 10, '', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#000000',
    })
    this.servedText = this.add.text(10, 36, '', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#000000',
    })
    this.updateHud()

    this.setupInput()
  }

  private createStationRuntime(def: StationDef): StationRuntime {
    const rect = this.add.rectangle(
      def.x + def.width / 2,
      def.y + def.height / 2,
      def.width,
      def.height,
      def.color,
    )
    rect.setStrokeStyle(2, 0x000000, 0.3)

    const labelText = this.add
      .text(def.x + def.width / 2, def.y + def.height / 2, def.label, {
        fontSize: '14px',
        color: '#1a1a1a',
        align: 'center',
      })
      .setOrigin(0.5)

    return {
      def,
      bounds: new Phaser.Geom.Rectangle(def.x, def.y, def.width, def.height),
      labelText,
      progress: 0,
    }
  }

  private setupInput(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      this.pressedKeys.add(e.code)
      if (e.code === 'Space') {
        e.preventDefault() // ページスクロール防止
        this.tryInteract()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      this.pressedKeys.delete(e.code)
    }
    const onBlur = () => {
      this.pressedKeys.clear()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    })
  }

  update(_time: number, delta: number): void {
    const seconds = delta / 1000
    const distance = this.moveSpeed * seconds

    let dx = 0
    let dy = 0
    if (this.pressedKeys.has('ArrowLeft')) dx -= distance
    if (this.pressedKeys.has('ArrowRight')) dx += distance
    if (this.pressedKeys.has('ArrowUp')) dy -= distance
    if (this.pressedKeys.has('ArrowDown')) dy += distance

    this.moveWithCollision(dx, dy)
    this.updateHeldItemVisual()

    // まな板: Spaceを押している間だけ切る進捗が進む
    const nearby = this.nearbyStation()
    if (nearby?.def.type === 'cutting_board' && this.pressedKeys.has('Space')) {
      this.progressCutting(nearby, seconds)
    }

    // コンロ: 食材が乗っていれば自動で加熱が進む(キー不要)
    for (const station of this.stations) {
      if (station.def.type === 'stove') {
        this.progressCooking(station, seconds)
      }
    }
  }

  private moveWithCollision(dx: number, dy: number): void {
    const half = this.playerSize / 2

    if (dx !== 0) {
      const next = new Phaser.Geom.Rectangle(
        this.player.x + dx - half,
        this.player.y - half,
        this.playerSize,
        this.playerSize,
      )
      if (!this.overlapsAnyStation(next)) this.player.x += dx
    }

    if (dy !== 0) {
      const next = new Phaser.Geom.Rectangle(
        this.player.x - half,
        this.player.y + dy - half,
        this.playerSize,
        this.playerSize,
      )
      if (!this.overlapsAnyStation(next)) this.player.y += dy
    }
  }

  private overlapsAnyStation(bounds: Phaser.Geom.Rectangle): boolean {
    return this.stations.some((s) => Phaser.Geom.Rectangle.Overlaps(s.bounds, bounds))
  }

  /** プレイヤーの近く(手が届く範囲)にある設備を1つ返す */
  private nearbyStation(): StationRuntime | undefined {
    const half = this.playerSize / 2 + this.interactReach
    const reach = new Phaser.Geom.Rectangle(
      this.player.x - half,
      this.player.y - half,
      half * 2,
      half * 2,
    )
    return this.stations.find((s) => Phaser.Geom.Rectangle.Overlaps(s.bounds, reach))
  }

  /** Spaceキーが押された瞬間の処理(移動/自動進行とは別に1回だけ実行) */
  private tryInteract(): void {
    const station = this.nearbyStation()
    if (!station) return

    switch (station.def.type) {
      case 'ingredient':
        this.interactIngredient()
        break
      case 'cutting_board':
        this.interactCuttingBoard(station)
        break
      case 'stove':
        this.interactStove(station)
        break
      case 'plate_stack':
        this.interactPlateStack()
        break
      case 'serving':
        this.interactServing()
        break
      case 'trash':
        this.holding = null
        break
    }
    this.updateHud()
  }

  private interactIngredient(): void {
    if (this.holding) return // 手がふさがってたら拾えない
    this.holding = { kind: 'tomato', state: 'raw' }
  }

  private interactCuttingBoard(station: StationRuntime): void {
    // 手に生のトマト、まな板が空 → 置く
    if (this.holding && this.holding.kind === 'tomato' && this.holding.state === 'raw' && !station.itemOnStation) {
      station.itemOnStation = this.holding
      station.progress = 0
      this.holding = null
      return
    }
    // まな板にカット済みが乗ってて、手が空 → 取る
    if (!this.holding && station.itemOnStation?.state === 'cut') {
      this.holding = station.itemOnStation
      station.itemOnStation = undefined
      station.progress = 0
    }
  }

  private progressCutting(station: StationRuntime, seconds: number): void {
    const item = station.itemOnStation
    if (!item || item.state !== 'raw') return
    station.progress += seconds / CUT_DURATION
    if (station.progress >= 1) {
      item.state = 'cut'
      station.progress = 1
    }
    this.refreshStationLabel(station)
  }

  private interactStove(station: StationRuntime): void {
    // 手にカット済みトマト、コンロが空 → 置いて加熱開始
    if (this.holding && this.holding.kind === 'tomato' && this.holding.state === 'cut' && !station.itemOnStation) {
      station.itemOnStation = this.holding
      station.progress = 0
      this.holding = null
      return
    }
    // コンロに調理済みが乗ってて、手が空 → 取る
    if (!this.holding && station.itemOnStation?.state === 'cooked') {
      this.holding = station.itemOnStation
      station.itemOnStation = undefined
      station.progress = 0
      this.refreshStationLabel(station)
    }
  }

  private progressCooking(station: StationRuntime, seconds: number): void {
    const item = station.itemOnStation
    if (!item || item.state !== 'cut') return
    station.progress += seconds / COOK_DURATION
    if (station.progress >= 1) {
      item.state = 'cooked'
      station.progress = 1
    }
    this.refreshStationLabel(station)
  }

  private interactPlateStack(): void {
    // 調理済みトマトを持っている → 皿に乗せる
    if (this.holding && this.holding.kind === 'tomato' && this.holding.state === 'cooked') {
      this.holding = { kind: 'plate', item: this.holding }
    }
  }

  private interactServing(): void {
    if (this.holding && isDish(this.holding)) {
      this.holding = null
      this.servedCount += 1
    }
  }

  private refreshStationLabel(station: StationRuntime): void {
    const item = station.itemOnStation
    if (!item) {
      station.labelText.setText(station.def.label)
      return
    }
    const pct = Math.round(station.progress * 100)
    station.labelText.setText(`${station.def.label}\n${labelFor(item)}\n${pct}%`)
  }

  private updateHeldItemVisual(): void {
    this.heldItemVisual.setPosition(this.player.x, this.player.y - this.playerSize)
    this.heldItemVisual.setVisible(this.holding !== null)
    if (this.holding) {
      this.heldItemVisual.setFillStyle(isDish(this.holding) ? 0xffe082 : 0xef5350)
    }
  }

  private updateHud(): void {
    this.holdingText.setText(`持ち物: ${this.holding ? labelFor(this.holding) : '(なし)'}`)
    this.servedText.setText(`提供数: ${this.servedCount}`)
  }
}
