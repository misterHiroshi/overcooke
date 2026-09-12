import Phaser from 'phaser'

/**
 * ゲームのメインシーン。
 * STEP2時点では: プレイヤー1体を四角で表現し、矢印キーで移動できるだけ。
 *
 * 注: Phaser標準の input.keyboard.createCursorKeys() は、この環境では
 * 稀にkeyupを取りこぼしキーが押しっぱなし扱いのまま固まる不具合が確認されたため、
 * 生のDOM keydown/keyupイベントを自前で追跡する方式に切り替えている。
 */
export class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle
  private readonly moveSpeed = 200 // px/秒
  private readonly pressedKeys = new Set<string>()

  constructor() {
    super('MainScene')
  }

  create(): void {
    // 背景（キッチンの床をイメージした色）
    this.cameras.main.setBackgroundColor('#2f2f3a')

    // プレイヤー: 仮表示として青い四角
    this.player = this.add.rectangle(400, 300, 32, 32, 0x4da6ff)

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

  update(_time: number, delta: number): void {
    const seconds = delta / 1000
    const distance = this.moveSpeed * seconds

    let dx = 0
    let dy = 0

    if (this.pressedKeys.has('ArrowLeft')) dx -= distance
    if (this.pressedKeys.has('ArrowRight')) dx += distance
    if (this.pressedKeys.has('ArrowUp')) dy -= distance
    if (this.pressedKeys.has('ArrowDown')) dy += distance

    this.player.x += dx
    this.player.y += dy
  }
}
