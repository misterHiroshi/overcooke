import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'
import { connectToServer } from '../net/socket'
import {
  type StationDef,
  type StateSnapshot,
  type PlayerInput,
  type PlayerSnapshot,
  isDish,
  labelFor,
  recipeLabel,
} from '../net/types'

interface StationVisual {
  def: StationDef
  labelText: Phaser.GameObjects.Text
}

interface PlayerVisual {
  rect: Phaser.GameObjects.Rectangle
  heldItem: Phaser.GameObjects.Rectangle
  youLabel: Phaser.GameObjects.Text
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
    this.timeText = this.add.text(460, 10, '', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#000000',
    })
    this.ordersText = this.add.text(460, 36, '', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000',
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

  private createStationVisuals(stations: StationDef[]): void {
    for (const def of stations) {
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

      this.stationVisuals.set(def.id, { def, labelText })
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

  update(): void {
    if (!this.latestState) return
    this.renderState(this.latestState)
  }

  private renderState(state: StateSnapshot): void {
    this.syncPlayers(state.players)
    this.syncStationLabels(state)
    this.updateHud(state)
  }

  private syncPlayers(players: PlayerSnapshot[]): void {
    const seenIds = new Set<string>()

    for (const p of players) {
      seenIds.add(p.id)
      let visual = this.playerVisuals.get(p.id)
      if (!visual) {
        const rect = this.add.rectangle(p.x, p.y, this.playerSize, this.playerSize, p.color)
        const heldItem = this.add.rectangle(p.x, p.y - this.playerSize, 12, 12, 0xffffff).setVisible(false)
        const youLabel = this.add
          .text(p.x, p.y - this.playerSize - 14, 'YOU', {
            fontSize: '12px',
            color: '#ffff00',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setVisible(false)
        visual = { rect, heldItem, youLabel }
        this.playerVisuals.set(p.id, visual)
      }
      const isMe = p.id === this.myId
      visual.rect.setPosition(p.x, p.y)
      visual.rect.setFillStyle(p.color)
      // 自分のキャラだけ白い枠線で強調する
      if (isMe) {
        visual.rect.setStrokeStyle(3, 0xffffff, 1)
      } else {
        visual.rect.setStrokeStyle()
      }
      visual.heldItem.setPosition(p.x, p.y - this.playerSize)
      visual.heldItem.setVisible(p.holding !== null)
      if (p.holding) {
        visual.heldItem.setFillStyle(isDish(p.holding) ? 0xffe082 : 0xef5350)
      }
      visual.youLabel.setPosition(p.x, p.y - this.playerSize - 14)
      visual.youLabel.setVisible(isMe)
    }

    // 切断したプレイヤーの表示を消す
    for (const [id, visual] of this.playerVisuals) {
      if (!seenIds.has(id)) {
        visual.rect.destroy()
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

      const item = stationState.itemOnStation
      if (!item) {
        visual.labelText.setText(visual.def.label)
        continue
      }
      const pct = Math.round(stationState.progress * 100)
      visual.labelText.setText(`${visual.def.label}\n${labelFor(item)}\n${pct}%`)
    }
  }

  private updateHud(state: StateSnapshot): void {
    const me = state.players.find((p) => p.id === this.myId)
    this.holdingText.setText(`持ち物: ${me?.holding ? labelFor(me.holding) : '(なし)'}`)
    this.scoreText.setText(`スコア: ${state.score}`)
    this.timeText.setText(`残り時間: ${Math.ceil(state.gameTimeLeft)}秒`)

    if (state.orders.length === 0) {
      this.ordersText.setText('注文: (なし)')
    } else {
      const lines = state.orders.map((o) => `${recipeLabel(o.recipe)} 残り${Math.ceil(o.timeLeft)}秒`)
      this.ordersText.setText(['注文:', ...lines].join('\n'))
    }

    if (state.gameOver) {
      this.gameOverText.setText(`終了!\nスコア: ${state.score}`).setVisible(true)
    }
  }
}
