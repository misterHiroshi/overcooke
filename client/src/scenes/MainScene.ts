import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { connectToServer } from '../net/socket'
import {
  type StationDef,
  type StationSnapshot,
  type StateSnapshot,
  type PlayerInput,
  type PlayerSnapshot,
  type Facing,
  labelFor,
  recipeLabel,
  recipeIngredientsEmoji,
  emojiFor,
} from '../net/types'

/** 向きに応じて、持ち物アイコンをキャラのどちら側にずらすかを返す */
function heldItemOffset(facing: Facing, distance: number): { dx: number; dy: number } {
  switch (facing) {
    case 'up':
      return { dx: 0, dy: -distance }
    case 'down':
      return { dx: 0, dy: distance }
    case 'left':
      return { dx: -distance, dy: 0 }
    case 'right':
      return { dx: distance, dy: 0 }
  }
}

/** 向きを角度(度)に変換。三角形の矢印マーカーの回転に使う */
function facingAngle(facing: Facing): number {
  switch (facing) {
    case 'up':
      return 0
    case 'right':
      return 90
    case 'down':
      return 180
    case 'left':
      return 270
  }
}

/** ちょっとした「変化した感」を出す拡大縮小ポップ演出 */
function popTween(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject): void {
  scene.tweens.add({
    targets: target,
    scale: { from: 0.3, to: 1 },
    duration: 220,
    ease: 'Back.out',
  })
}

interface StationVisual {
  def: StationDef
  labelText: Phaser.GameObjects.Text
  itemBg: Phaser.GameObjects.Arc
  itemText: Phaser.GameObjects.Text
  barBg: Phaser.GameObjects.Rectangle
  barFill: Phaser.GameObjects.Rectangle
  /** 直前フレームでの表示内容(変化検知用の指紋) */
  lastFingerprint: string
}

interface PlayerVisual {
  sprite: Phaser.GameObjects.Sprite
  meRing: Phaser.GameObjects.Arc
  facingArrow: Phaser.GameObjects.Triangle
  heldItemBg: Phaser.GameObjects.Arc
  heldItem: Phaser.GameObjects.Text
  youLabel: Phaser.GameObjects.Text
  lastX: number
  lastY: number
  /** 実際に画面に描画してる座標(サーバーからの座標へ滑らかに追従させる) */
  renderX: number
  renderY: number
  walkTime: number
  lastHoldingFingerprint: string
}

/**
 * ゲームのメインシーン。
 * STEP6時点では: サーバー権威モデルに移行。
 * このクラスは「自分の入力をサーバーへ送る」「サーバーから来た状態を描画する」
 * だけを行い、ゲームロジック(移動判定・調理進行・注文管理等)は一切持たない。
 *
 * 注: Phaser標準の input.keyboard.createCursorKeys() は、この環境では
 * 稀にkeyupを取りこぼしキーが押しっぱなし扱いのまま固まる不具合が確認されたため、
 * 生のDOM keydown/keyupイベントを自前で追跡する方式に切り替えている。
 */
export class MainScene extends Phaser.Scene {
  private readonly playerSize = 32
  private readonly pressedKeys = new Set<string>()

  private socket!: Socket
  private myId: string | null = null

  private stationVisuals = new Map<number, StationVisual>()
  private playerVisuals = new Map<string, PlayerVisual>()
  private latestState: StateSnapshot | null = null

  private holdingText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private timeText!: Phaser.GameObjects.Text
  private ordersText!: Phaser.GameObjects.Text
  private gameOverText!: Phaser.GameObjects.Text
  private connectionText!: Phaser.GameObjects.Text

  constructor() {
    super('MainScene')
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2f2f3a')

    this.holdingText = this.add.text(10, 10, '', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#000000',
    })
    this.scoreText = this.add.text(10, 36, '', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#000000',
    })
    this.timeText = this.add.text(10, 140, '', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#000000',
    })
    this.ordersText = this.add.text(10, 166, '', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000',
      lineSpacing: 10, // 絵文字は行の高さがテキストより大きく、詰めると重なるため広めに
    })
    this.gameOverText = this.add
      .text(400, 300, '', {
        fontSize: '32px',
        color: '#ffffff',
        backgroundColor: '#000000',
        align: 'center',
        padding: { x: 16, y: 12 },
      })
      .setOrigin(0.5)
      .setVisible(false)
    this.connectionText = this.add
      .text(400, 300, 'サーバーに接続中...', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)

    this.setupInput()
    this.setupNetwork()
  }

  private setupNetwork(): void {
    this.socket = connectToServer()

    this.socket.on('connect', () => {
      this.myId = this.socket.id ?? null
      this.connectionText.setVisible(false)
    })

    this.socket.on('disconnect', () => {
      this.connectionText.setText('サーバーとの接続が切れました').setVisible(true)
    })

    this.socket.on('init', (payload: { stations: StationDef[] }) => {
      this.createStationVisuals(payload.stations)
    })

    this.socket.on('state', (state: StateSnapshot) => {
      this.latestState = state
    })
  }

  /**
   * 色ごとに簡易ドット絵風シェフキャラのテクスチャを1回だけ生成してキャッシュする。
   * (帽子をかぶった小さいキャラ。目は正面固定、向きは別途矢印マーカーで示す)
   */
  private ensureChefTexture(color: number): string {
    const key = `chef_${color}`
    if (this.textures.exists(key)) return key

    const w = 30
    const h = 36
    const g = this.add.graphics()

    // 体(角丸の四角)
    g.fillStyle(color, 1)
    g.fillRoundedRect(4, 15, w - 8, h - 17, 5)
    // 首元の影
    g.fillStyle(0x000000, 0.15)
    g.fillRect(4, 15, w - 8, 3)
    // 頭
    g.fillStyle(0xffe0b2, 1)
    g.fillCircle(w / 2, 13, 10)
    // シェフハット
    g.fillStyle(0xffffff, 1)
    g.fillRoundedRect(w / 2 - 8, 0, 16, 9, 4)
    g.fillRect(w / 2 - 10, 7, 20, 4)
    // 目
    g.fillStyle(0x1a1a1a, 1)
    g.fillCircle(w / 2 - 3.5, 13, 1.5)
    g.fillCircle(w / 2 + 3.5, 13, 1.5)

    g.generateTexture(key, w, h)
    g.destroy()
    return key
  }

  private createStationVisuals(stations: StationDef[]): void {
    for (const def of stations) {
      const centerX = def.x + def.width / 2
      const centerY = def.y + def.height / 2

      const rect = this.add.rectangle(centerX, centerY, def.width, def.height, def.color)
      rect.setStrokeStyle(2, 0x000000, 0.3)

      // 設備名(常に箱の下に小さく表示)
      const labelText = this.add
        .text(centerX, def.y + def.height + 12, def.label, {
          fontSize: '12px',
          color: '#dddddd',
          align: 'center',
        })
        .setOrigin(0.5)

      // 乗ってる食材の絵文字+ 見やすくするための丸皿風の背景
      const itemBg = this.add.circle(centerX, centerY, 20, 0xffffff, 0.85).setVisible(false)
      const itemText = this.add.text(centerX, centerY, '', { fontSize: '30px' }).setOrigin(0.5)

      // 下ごしらえ進捗バー(箱のすぐ下)
      const barWidth = def.width - 10
      const barBg = this.add
        .rectangle(centerX, def.y + def.height + 3, barWidth, 5, 0x000000, 0.5)
        .setVisible(false)
      const barFill = this.add
        .rectangle(centerX - barWidth / 2, def.y + def.height + 3, 0, 5, 0x4caf50)
        .setOrigin(0, 0.5)
        .setVisible(false)

      if (def.type === 'obstacle') {
        itemText.setText('🧱') // 障害物は常に同じ見た目(動的更新なし)
      }

      this.stationVisuals.set(def.id, {
        def,
        labelText,
        itemBg,
        itemText,
        barBg,
        barFill,
        lastFingerprint: '',
      })
    }
  }

  private setupInput(): void {
    const sendInput = () => {
      const input: PlayerInput = {
        left: this.pressedKeys.has('ArrowLeft'),
        right: this.pressedKeys.has('ArrowRight'),
        up: this.pressedKeys.has('ArrowUp'),
        down: this.pressedKeys.has('ArrowDown'),
        space: this.pressedKeys.has('Space'),
      }
      this.socket?.emit('input', input)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.pressedKeys.has(e.code)) {
        this.pressedKeys.add(e.code)
        sendInput()
      }
      if (e.code === 'Space') {
        e.preventDefault() // ページスクロール防止
        this.socket?.emit('interact')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (this.pressedKeys.has(e.code)) {
        this.pressedKeys.delete(e.code)
        sendInput()
      }
    }
    const onBlur = () => {
      if (this.pressedKeys.size > 0) {
        this.pressedKeys.clear()
        sendInput()
      }
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
    if (!this.latestState) return
    this.renderState(this.latestState, delta / 1000)
  }

  private renderState(state: StateSnapshot, deltaSeconds: number): void {
    this.syncPlayers(state.players, deltaSeconds)
    this.syncStationLabels(state)
    this.updateHud(state)
  }

  private syncPlayers(players: PlayerSnapshot[], deltaSeconds: number): void {
    const seenIds = new Set<string>()

    for (const p of players) {
      seenIds.add(p.id)
      let visual = this.playerVisuals.get(p.id)
      if (!visual) {
        const textureKey = this.ensureChefTexture(p.color)
        const sprite = this.add.sprite(p.x, p.y, textureKey)
        const meRing = this.add
          .circle(p.x, p.y, this.playerSize / 2 + 5)
          .setStrokeStyle(3, 0xffffff, 1)
          .setVisible(false)
        const facingArrow = this.add
          .triangle(p.x, p.y, 0, -6, -5, 5, 5, 5, 0xffeb3b)
          .setOrigin(0.5)
        const initialOffset = heldItemOffset(p.facing, this.playerSize)
        const heldItemBg = this.add
          .circle(p.x + initialOffset.dx, p.y + initialOffset.dy, 16, 0xffffff, 0.85)
          .setVisible(false)
        const heldItem = this.add
          .text(p.x + initialOffset.dx, p.y + initialOffset.dy, '', { fontSize: '22px' })
          .setOrigin(0.5)
          .setVisible(false)
        const youLabel = this.add
          .text(p.x, p.y - this.playerSize - 18, 'YOU', {
            fontSize: '12px',
            color: '#ffff00',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setVisible(false)
        visual = {
          sprite,
          meRing,
          facingArrow,
          heldItemBg,
          heldItem,
          youLabel,
          lastX: p.x,
          lastY: p.y,
          renderX: p.x,
          renderY: p.y,
          walkTime: 0,
          lastHoldingFingerprint: '',
        }
        this.playerVisuals.set(p.id, visual)
      }

      const isMe = p.id === this.myId
      // サーバーは20Hzでしか座標を送ってこないので、そのまま描画すると
      // カクカク見える。毎フレーム、最新座標へ少しずつ近づけて滑らかにする
      const moved = Math.hypot(p.x - visual.lastX, p.y - visual.lastY) > 0.5
      visual.lastX = p.x
      visual.lastY = p.y
      // 半減期80msで最新座標に近づける(1〜2tick分かけて追いつくので滑らかに見える)
      const lerpT = 1 - Math.pow(0.5, deltaSeconds / 0.08)
      visual.renderX = Phaser.Math.Linear(visual.renderX, p.x, lerpT)
      visual.renderY = Phaser.Math.Linear(visual.renderY, p.y, lerpT)
      // 補間後の距離が大きすぎる場合(接続直後や巻き戻り)はワープさせて追いつく
      if (Math.hypot(p.x - visual.renderX, p.y - visual.renderY) > 80) {
        visual.renderX = p.x
        visual.renderY = p.y
      }
      const rx = visual.renderX
      const ry = visual.renderY

      // 歩行アニメ: 動いてる間だけプルプルと上下+左右にスケールが揺れる
      if (moved) {
        visual.walkTime += deltaSeconds * 14
        const wobble = Math.sin(visual.walkTime)
        visual.sprite.setScale(1 - wobble * 0.05, 1 + wobble * 0.05)
      } else {
        visual.walkTime = 0
        visual.sprite.setScale(1, 1)
      }

      visual.sprite.setPosition(rx, ry)
      visual.meRing.setPosition(rx, ry)
      visual.meRing.setVisible(isMe)

      // 向き矢印: キャラの外周に、向いてる方向へ向けて表示
      const arrowOffset = heldItemOffset(p.facing, this.playerSize / 2 + 8)
      visual.facingArrow.setPosition(rx + arrowOffset.dx, ry + arrowOffset.dy)
      visual.facingArrow.setAngle(facingAngle(p.facing))

      const offset = heldItemOffset(p.facing, this.playerSize)
      visual.heldItemBg.setPosition(rx + offset.dx, ry + offset.dy)
      visual.heldItem.setPosition(rx + offset.dx, ry + offset.dy)
      const hasItem = p.holding !== null
      visual.heldItemBg.setVisible(hasItem)
      visual.heldItem.setVisible(hasItem)
      if (p.holding) {
        visual.heldItem.setText(emojiFor(p.holding))
        // 何か持った/持ち物が変わった瞬間だけポンと拡大するアニメで気づきやすく
        const fingerprint = JSON.stringify(p.holding)
        if (fingerprint !== visual.lastHoldingFingerprint) {
          popTween(this, visual.heldItem)
          popTween(this, visual.heldItemBg)
        }
        visual.lastHoldingFingerprint = fingerprint
      } else {
        visual.lastHoldingFingerprint = ''
      }

      visual.youLabel.setPosition(rx, ry - this.playerSize - 18)
      visual.youLabel.setVisible(isMe)
    }

    // 切断したプレイヤーの表示を消す
    for (const [id, visual] of this.playerVisuals) {
      if (!seenIds.has(id)) {
        visual.sprite.destroy()
        visual.meRing.destroy()
        visual.facingArrow.destroy()
        visual.heldItemBg.destroy()
        visual.heldItem.destroy()
        visual.youLabel.destroy()
        this.playerVisuals.delete(id)
      }
    }
  }

  private syncStationLabels(state: StateSnapshot): void {
    for (const stationState of state.stations) {
      const visual = this.stationVisuals.get(stationState.id)
      if (!visual) continue

      if (visual.def.type === 'obstacle') continue // 常に固定表示のまま

      if (visual.def.type === 'conveyor') {
        this.syncConveyor(visual, stationState)
        continue
      }

      if (visual.def.type === 'counter') {
        this.syncCounter(visual, stationState)
        continue
      }

      const item = stationState.itemOnStation
      if (!item) {
        visual.itemBg.setVisible(false)
        visual.itemText.setText('')
        visual.barBg.setVisible(false)
        visual.barFill.setVisible(false)
        visual.lastFingerprint = ''
        continue
      }

      visual.itemBg.setVisible(true)
      visual.itemText.setText(emojiFor(item))

      // 食材が新しく置かれた/状態が変わった瞬間だけポンと拡大アニメ
      const fingerprint = `${item.ingredientKind}:${item.state}`
      if (fingerprint !== visual.lastFingerprint) {
        popTween(this, visual.itemText)
        popTween(this, visual.itemBg)
      }
      visual.lastFingerprint = fingerprint

      const barWidth = visual.def.width - 10
      if (item.state === 'burnt') {
        // 焦げたら完全に真っ赤なバーで警告し、それ以上は進行しない
        visual.barBg.setVisible(true)
        visual.barFill.setVisible(true)
        visual.barFill.setFillStyle(0xf44336)
        visual.barFill.width = barWidth
      } else {
        visual.barBg.setVisible(true)
        visual.barFill.setVisible(true)
        // 調理完了後(cooked)は焦げるまでのカウントダウンなのでオレンジで警告
        visual.barFill.setFillStyle(item.state === 'cooked' ? 0xff9800 : 0x4caf50)
        visual.barFill.width = barWidth * stationState.progress
      }
    }
  }

  /** カウンター: 置かれてる物をそのまま真ん中に表示するだけ */
  private syncCounter(visual: StationVisual, stationState: StationSnapshot): void {
    if (!stationState.counterItem) {
      visual.itemBg.setVisible(false)
      visual.itemText.setText('')
      visual.lastFingerprint = ''
      return
    }
    visual.itemBg.setVisible(true)
    visual.itemText.setText(emojiFor(stationState.counterItem))

    const fingerprint = JSON.stringify(stationState.counterItem)
    if (fingerprint !== visual.lastFingerprint) {
      popTween(this, visual.itemText)
      popTween(this, visual.itemBg)
    }
    visual.lastFingerprint = fingerprint
  }

  /** ベルトコンベア: 乗ってる物を位置に応じて左右にスライドさせる */
  private syncConveyor(visual: StationVisual, stationState: StationSnapshot): void {
    if (!stationState.beltItem) {
      visual.itemBg.setVisible(false)
      visual.itemText.setText('')
      visual.lastFingerprint = ''
      return
    }
    const pos = stationState.beltPosition ?? 0
    const startX = visual.def.x + 24
    const endX = visual.def.x + visual.def.width - 24
    const x = startX + (endX - startX) * pos
    const y = visual.def.y + visual.def.height / 2
    visual.itemBg.setPosition(x, y)
    visual.itemBg.setVisible(true)
    visual.itemText.setPosition(x, y)
    visual.itemText.setText(emojiFor(stationState.beltItem))

    const fingerprint = JSON.stringify(stationState.beltItem)
    if (fingerprint !== visual.lastFingerprint && pos < 0.05) {
      // ベルトに乗せた瞬間だけポップ(毎フレーム動くので位置基準では出さない)
      popTween(this, visual.itemText)
      popTween(this, visual.itemBg)
    }
    visual.lastFingerprint = fingerprint
  }

  private updateHud(state: StateSnapshot): void {
    const me = state.players.find((p) => p.id === this.myId)
    this.holdingText.setText(`持ち物: ${me?.holding ? labelFor(me.holding) : '(なし)'}`)
    this.scoreText.setText(`スコア: ${state.score}`)
    this.timeText.setText(`残り時間: ${Math.ceil(state.gameTimeLeft)}秒`)

    if (state.orders.length === 0) {
      this.ordersText.setText('注文: (なし)')
    } else {
      const lines = state.orders.map(
        (o) =>
          `${recipeLabel(o.recipe)} ${recipeIngredientsEmoji(o.recipe)} 残り${Math.ceil(o.timeLeft)}秒`,
      )
      this.ordersText.setText(['注文:', ...lines].join('\n'))
    }

    if (state.gameOver) {
      this.gameOverText.setText(`終了!\nスコア: ${state.score}`).setVisible(true)
    }
  }
}
