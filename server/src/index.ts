import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { GameRoom } from './game/GameRoom'
import type { PlayerInput } from './game/types'

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001
const TICK_RATE_HZ = 20

const app = express()
const httpServer = createServer(app)

// 開発中はViteの5173番等、別オリジンから接続してくるためCORSを許可する
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// STEP6では部屋分けはせず、全員が1つのキッチンに入る単一ルーム構成
const room = new GameRoom()

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`)
  room.addPlayer(socket.id)

  // 接続直後に1回だけ設備の静的レイアウトを送る
  socket.emit('init', { stations: room.getStationDefs() })

  socket.on('input', (input: PlayerInput) => {
    room.setInput(socket.id, input)
  })

  socket.on('interact', () => {
    room.interact(socket.id)
  })

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`)
    room.removePlayer(socket.id)
  })
})

// ゲームループ: 一定間隔でtickを進め、全クライアントに状態をブロードキャストする
let lastTick = Date.now()
setInterval(() => {
  const now = Date.now()
  const seconds = (now - lastTick) / 1000
  lastTick = now

  room.tick(seconds)
  io.emit('state', room.serialize())
}, 1000 / TICK_RATE_HZ)

httpServer.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`)
})
