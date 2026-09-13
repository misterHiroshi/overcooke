import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

const app = express()
const httpServer = createServer(app)

// 開発中はViteの5173番から接続してくるためCORSを許可する
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`)

  // 疎通確認用: クライアントからのpingにpongを返す
  socket.on('ping', (payload) => {
    socket.emit('pong', payload)
  })

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`)
})
