import { io, type Socket } from 'socket.io-client'

// 開発時はViteの5173番とサーバーの3001番が別オリジンなので明示的に指定する。
// 本番ビルド(.env.production)ではVITE_SERVER_URLを空にして「同一オリジン」に
// 接続させる(クライアントとサーバーを同じドメインの別パスで配信するため)。
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL !== undefined
    ? import.meta.env.VITE_SERVER_URL
    : 'http://localhost:3001'

export function connectToServer(): Socket {
  return SERVER_URL ? io(SERVER_URL) : io()
}
