import { io, type Socket } from 'socket.io-client'

// 本番では環境変数でサーバーURLを差し替える(未設定時は開発用ローカルサーバー)
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export function connectToServer(): Socket {
  return io(SERVER_URL)
}
