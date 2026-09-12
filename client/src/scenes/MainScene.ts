import Phaser from 'phaser'
import { STATIONS, type StationDef } from '../entities/Station'

/**
 * ゲームのメインシーン。
 * STEP3時点では: プレイヤー移動 + 調理設備の配置と当たり判定のみ。
 * (切る/焼く/提供などの調理ロジックはまだ未実装)
 *
 * 注: Phaser標準の input.keyboard.createCursorKeys() は、この環境では
 * 稀にkeyupを取りこぼしキーが押しっぱなし扱いのまま固まる不具合が確認されたため、
 * 生のDOM keydown/keyupイベントを自前で追跡する方式に切り替えている。
 */
export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle
  private readonly playerSize = 32
  private readonly moveSpeed = 200 // px/秒
  private readonly pressedKeys = new Set<string>()
  private stationBounds: Phaser.Geom.Rectangle[] = []

  constructor() {
    super('MainScene')
  }

  create(): void {
    // 背景（キッチンの床をイメージした色）
    this.cameras.main.setBackgroundColor('#2f2f3a')

    this.createStations()

    // プレイヤー: 仮表示として青い四角
    this.player = this.add.rectangle(400, 300, this.playerSize, this.playerSize, 0x4da6ff)

    const onKeyDown = (e: KeyboardEvent) => {
      this.pressedKeys.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      this.pressedKeys.delete(e.code)
    }
    // ウィンドウがフォーカスを失った時は全キー状態をクリア
    // (フォーカスが無い間はkeyupが届かず押しっぱなし扱いのまま残るため)
    const onBlur = () => {
      this.pressedKeys.clear()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    // シーン終了時にリスナーを掃除
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    })
  }

  /** 設備を描画し、当たり判定用の矩形リストを作る */
  private createStations(): void {
    for (const station of STATIONS) {
      this.drawStation(station)
      this.stationBounds.push(
        new Phaser.Geom.Rectangle(station.x, station.y, station.width, station.height),
      )
    }
  }

  private drawStation(station: StationDef): void {
    const rect = this.add.rectangle(
      station.x + station.width / 2,
      station.y + station.height / 2,
      station.width,
      station.height,
      station.color,
    )
    rect.setStrokeStyle(2, 0x000000, 0.3)

    this.add
      .text(station.x + station.width / 2, station.y + station.height / 2, station.label, {
        fontSize: '14px',
        color: '#1a1a1a',
      })
      .setOrigin(0.5)
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
  }

  /** 軸ごとに移動を試し、設備と重なる場合はその軸の移動だけキャンセルする(壁ずり) */
  private moveWithCollision(dx: number, dy: number): void {
    const half = this.playerSize / 2

    if (dx !== 0) {
      const nextBounds = new Phaser.Geom.Rectangle(
        this.player.x + dx - half,
        this.player.y - half,
        this.playerSize,
        this.playerSize,
      )
      if (!this.overlapsAnyStation(nextBounds)) {
        this.player.x += dx
      }
    }

    if (dy !== 0) {
      const nextBounds = new Phaser.Geom.Rectangle(
        this.player.x - half,
        this.player.y + dy - half,
        this.playerSize,
        this.playerSize,
      )
      if (!this.overlapsAnyStation(nextBounds)) {
        this.player.y += dy
      }
    }
  }

  private overlapsAnyStation(bounds: Phaser.Geom.Rectangle): boolean {
    return this.stationBounds.some((station) => Phaser.Geom.Rectangle.Overlaps(station, bounds))
  }
}
