import { useCallback, useEffect, useRef, useState } from 'react'
import Peer, { DataConnection } from 'peerjs'
import { PeerMessage } from '../types/game'
import { CHUNK_SIZE } from '../utils/imageCompression'
import { clockSync } from '../utils/clockSync'

const PEER_PREFIX = 'pr-roulette-v1-'

export function formatRoomCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function usePeerConnection(
  onMessageReceived?: (msg: PeerMessage, fromPeerId: string) => void,
  onPeerDisconnected?: (peerId: string) => void
) {
  const [peerId, setPeerId] = useState<string>('')
  const [roomCode, setRoomCode] = useState<string>('')
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [isConnecting, setIsConnecting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isHost, setIsHost] = useState<boolean>(false)

  const peerRef = useRef<Peer | null>(null)
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map())
  const hostConnectionRef = useRef<DataConnection | null>(null)

  const chunkBuffersRef = useRef<Map<string, { received: Map<number, string>; total: number }>>(new Map())

  const messageHandlerRef = useRef(onMessageReceived)
  messageHandlerRef.current = onMessageReceived

  const disconnectHandlerRef = useRef(onPeerDisconnected)
  disconnectHandlerRef.current = onPeerDisconnected

  const sendThroughConnection = useCallback(async (conn: DataConnection, message: PeerMessage) => {
    if (!conn || !conn.open) return

    const serialized = JSON.stringify(message)
    if (serialized.length > CHUNK_SIZE) {
      const chunkId = `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const total = Math.ceil(serialized.length / CHUNK_SIZE)
      for (let i = 0; i < total; i++) {
        if (!conn.open) return
        const dc = (conn as any).dataChannel as RTCDataChannel | undefined
        if (dc && dc.bufferedAmount > 64 * 1024) {
          await new Promise<void>((resolve) => {
            const check = () => {
              if (!dc || dc.bufferedAmount <= 16 * 1024) {
                resolve()
              } else {
                setTimeout(check, 15)
              }
            }
            setTimeout(check, 15)
          })
        }
        const slice = serialized.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        conn.send({
          type: 'DATA_CHUNK',
          senderId: message.senderId,
          payload: {
            chunkId,
            index: i,
            total,
            data: slice,
          },
        })
        if (i % 8 === 7) {
          await new Promise((r) => setTimeout(r, 5))
        }
      }
    } else {
      conn.send(message)
    }
  }, [])

  const handleRawData = useCallback((data: any, fromPeerId: string) => {
    if (!data) return

    if (data.type === 'DATA_CHUNK' && data.payload) {
      const { chunkId, index, total, data: chunkData } = data.payload
      let buffer = chunkBuffersRef.current.get(chunkId)
      if (!buffer) {
        buffer = { received: new Map(), total }
        chunkBuffersRef.current.set(chunkId, buffer)
      }
      buffer.received.set(index, chunkData)

      if (buffer.received.size === buffer.total) {
        let fullStr = ''
        for (let i = 0; i < buffer.total; i++) {
          fullStr += buffer.received.get(i) || ''
        }
        chunkBuffersRef.current.delete(chunkId)
        try {
          const originalMsg: PeerMessage = JSON.parse(fullStr)
          handleRawData(originalMsg, fromPeerId)
        } catch {}
      }
      return
    }

    if (data.type === 'PING') {
      const conn = connectionsRef.current.get(fromPeerId) || (hostConnectionRef.current?.peer === fromPeerId ? hostConnectionRef.current : null)
      if (conn && conn.open) {
        sendThroughConnection(conn, {
          type: 'PONG',
          senderId: peerRef.current?.id || '',
          payload: {
            clientSendTime: data.payload?.clientSendTime,
            serverReceiveTime: Date.now(),
          },
        })
      }
      return
    }

    if (data.type === 'PONG') {
      const clientReceiveTime = Date.now()
      const clientSendTime = data.payload?.clientSendTime
      const serverTime = data.payload?.serverReceiveTime
      if (clientSendTime && serverTime) {
        clockSync.recordSample(clientSendTime, serverTime, clientReceiveTime)
      }
      return
    }

    if (data.type) {
      messageHandlerRef.current?.(data as PeerMessage, fromPeerId)
    }
  }, [sendThroughConnection])

  const cleanup = useCallback(() => {
    connectionsRef.current.forEach((conn) => {
      try {
        conn.close()
      } catch {}
    })
    connectionsRef.current.clear()

    if (hostConnectionRef.current) {
      try {
        hostConnectionRef.current.close()
      } catch {}
      hostConnectionRef.current = null
    }

    if (peerRef.current) {
      try {
        peerRef.current.destroy()
      } catch {}
      peerRef.current = null
    }

    chunkBuffersRef.current.clear()
    clockSync.reset()
    setIsConnected(false)
    setIsConnecting(false)
    setPeerId('')
    setError(null)
  }, [])

  const broadcast = useCallback(
    (message: PeerMessage) => {
      connectionsRef.current.forEach((conn) => {
        sendThroughConnection(conn, message)
      })
    },
    [sendThroughConnection]
  )

  const sendToPeer = useCallback(
    (targetPeerId: string, message: PeerMessage) => {
      const conn = connectionsRef.current.get(targetPeerId)
      if (conn) {
        sendThroughConnection(conn, message)
      }
    },
    [sendThroughConnection]
  )

  const sendToHost = useCallback(
    (message: PeerMessage) => {
      if (hostConnectionRef.current && hostConnectionRef.current.open) {
        sendThroughConnection(hostConnectionRef.current, message)
      }
    },
    [sendThroughConnection]
  )

  const performTimeSync = useCallback(() => {
    if (hostConnectionRef.current && hostConnectionRef.current.open) {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (hostConnectionRef.current && hostConnectionRef.current.open) {
            sendThroughConnection(hostConnectionRef.current, {
              type: 'PING',
              senderId: peerRef.current?.id || '',
              payload: { clientSendTime: Date.now() },
            })
          }
        }, i * 200)
      }
    }
  }, [sendThroughConnection])

  const createRoom = useCallback(
    async (customCode?: string): Promise<{ code: string; peerId: string }> => {
      cleanup()
      setIsConnecting(true)
      setError(null)
      setIsHost(true)

      const code = formatRoomCode(customCode || generateRoomCode())
      const fullPeerId = `${PEER_PREFIX}${code}`

      return new Promise((resolve, reject) => {
        try {
          const peer = new Peer(fullPeerId, {
            debug: 1,
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' },
              ],
            },
          })

          peerRef.current = peer

          peer.on('open', (id) => {
            setPeerId(id)
            setRoomCode(code)
            setIsConnected(true)
            setIsConnecting(false)
            resolve({ code, peerId: id })
          })

          peer.on('connection', (conn) => {
            conn.on('open', () => {
              connectionsRef.current.set(conn.peer, conn)
            })

            conn.on('data', (data) => {
              handleRawData(data, conn.peer)
            })

            conn.on('close', () => {
              connectionsRef.current.delete(conn.peer)
              disconnectHandlerRef.current?.(conn.peer)
            })

            conn.on('error', () => {
              connectionsRef.current.delete(conn.peer)
              disconnectHandlerRef.current?.(conn.peer)
            })
          })

          peer.on('error', (err: any) => {
            if (err.type === 'unavailable-id') {
              const retryCode = generateRoomCode()
              createRoom(retryCode).then(resolve).catch(reject)
            } else {
              setError(err.message || 'Peer connection error')
              setIsConnecting(false)
              reject(err)
            }
          })
        } catch (e: any) {
          setError(e.message || 'Failed to initialize peer')
          setIsConnecting(false)
          reject(e)
        }
      })
    },
    [cleanup, handleRawData]
  )

  const joinRoom = useCallback(
    async (codeToJoin: string): Promise<{ code: string; peerId: string }> => {
      cleanup()
      setIsConnecting(true)
      setError(null)
      setIsHost(false)

      const formattedCode = formatRoomCode(codeToJoin)
      const hostFullPeerId = `${PEER_PREFIX}${formattedCode}`

      return new Promise((resolve, reject) => {
        try {
          const peer = new Peer({
            debug: 1,
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' },
              ],
            },
          })

          peerRef.current = peer

          peer.on('open', (id) => {
            setPeerId(id)
            setRoomCode(formattedCode)

            const conn = peer.connect(hostFullPeerId, {
              reliable: true,
            })

            hostConnectionRef.current = conn

            conn.on('open', () => {
              setIsConnected(true)
              setIsConnecting(false)
              performTimeSync()
              resolve({ code: formattedCode, peerId: id })
            })

            conn.on('data', (data) => {
              handleRawData(data, hostFullPeerId)
            })

            conn.on('close', () => {
              setIsConnected(false)
              setError('Disconnected from host')
              disconnectHandlerRef.current?.(hostFullPeerId)
            })

            conn.on('error', (err) => {
              setError('Failed to establish connection with room')
              setIsConnecting(false)
              reject(err)
            })
          })

          peer.on('error', (err: any) => {
            setError(err.message || 'Room connection failed. Check room code.')
            setIsConnecting(false)
            reject(err)
          })
        } catch (e: any) {
          setError(e.message || 'Failed to connect')
          setIsConnecting(false)
          reject(e)
        }
      })
    },
    [cleanup, handleRawData, performTimeSync]
  )

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    peerId,
    roomCode,
    isHost,
    isConnected,
    isConnecting,
    error,
    createRoom,
    joinRoom,
    broadcast,
    sendToPeer,
    sendToHost,
    disconnect: cleanup,
    syncClock: performTimeSync,
  }
}
