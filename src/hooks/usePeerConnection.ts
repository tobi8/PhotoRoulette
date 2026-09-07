import { useCallback, useEffect, useRef, useState } from 'react'
import Peer, { DataConnection } from 'peerjs'
import { PeerMessage } from '../types/game'
import { CHUNK_SIZE } from '../utils/imageCompression'

// Room code prefix to avoid collisions on public PeerJS cloud
const PEER_PREFIX = 'pr-roulette-v1-'

export function formatRoomCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Omit 0/O and 1/I for clarity
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

  // Chunk reassembly buffers: messageId -> { received: Map<number, string>, total: number }
  const chunkBuffersRef = useRef<Map<string, { received: Map<number, string>; total: number }>>(new Map())

  const messageHandlerRef = useRef(onMessageReceived)
  messageHandlerRef.current = onMessageReceived

  const disconnectHandlerRef = useRef(onPeerDisconnected)
  disconnectHandlerRef.current = onPeerDisconnected

  // Clean up existing peer and connections
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
    setIsConnected(false)
    setIsConnecting(false)
    setPeerId('')
    setError(null)
  }, [])

  // Process received raw data (handles chunking & direct messages)
  const handleRawData = useCallback((data: any, fromPeerId: string) => {
    if (!data) return

    // Chunk packet handling
    if (data.type === 'DATA_CHUNK' && data.payload) {
      const { chunkId, index, total, data: chunkData } = data.payload
      let buffer = chunkBuffersRef.current.get(chunkId)
      if (!buffer) {
        buffer = { received: new Map(), total }
        chunkBuffersRef.current.set(chunkId, buffer)
      }
      buffer.received.set(index, chunkData)

      // Reassemble once complete
      if (buffer.received.size === buffer.total) {
        let fullStr = ''
        for (let i = 0; i < buffer.total; i++) {
          fullStr += buffer.received.get(i) || ''
        }
        chunkBuffersRef.current.delete(chunkId)
        try {
          const originalMsg: PeerMessage = JSON.parse(fullStr)
          messageHandlerRef.current?.(originalMsg, fromPeerId)
        } catch (e) {
          console.error('Failed to parse reassembled chunk message:', e)
        }
      }
      return
    }

    // Direct PeerMessage
    if (data.type) {
      messageHandlerRef.current?.(data as PeerMessage, fromPeerId)
    }
  }, [])

  // Safely send a message through a DataConnection (chunked if large)
  const sendThroughConnection = useCallback((conn: DataConnection, message: PeerMessage) => {
    if (!conn || !conn.open) return

    const serialized = JSON.stringify(message)
    if (serialized.length > CHUNK_SIZE) {
      const chunkId = `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const total = Math.ceil(serialized.length / CHUNK_SIZE)
      for (let i = 0; i < total; i++) {
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
      }
    } else {
      conn.send(message)
    }
  }, [])

  // Host: Broadcast message to all connected clients
  const broadcast = useCallback(
    (message: PeerMessage) => {
      connectionsRef.current.forEach((conn) => {
        sendThroughConnection(conn, message)
      })
    },
    [sendThroughConnection]
  )

  // Host: Send message to specific client
  const sendToPeer = useCallback(
    (targetPeerId: string, message: PeerMessage) => {
      const conn = connectionsRef.current.get(targetPeerId)
      if (conn) {
        sendThroughConnection(conn, message)
      }
    },
    [sendThroughConnection]
  )

  // Client: Send message to Host
  const sendToHost = useCallback(
    (message: PeerMessage) => {
      if (hostConnectionRef.current && hostConnectionRef.current.open) {
        sendThroughConnection(hostConnectionRef.current, message)
      } else {
        console.warn('Host connection not open, could not send message:', message.type)
      }
    },
    [sendThroughConnection]
  )

  // Host: Create a new room
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

            conn.on('error', (err) => {
              console.warn(`Connection error with peer ${conn.peer}:`, err)
              connectionsRef.current.delete(conn.peer)
              disconnectHandlerRef.current?.(conn.peer)
            })
          })

          peer.on('error', (err: any) => {
            console.error('PeerJS error:', err)
            if (err.type === 'unavailable-id') {
              // Code collision, retry with new code
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

  // Client: Join an existing room
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
          // Initialize client peer with random ID
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

            // Connect to host
            const conn = peer.connect(hostFullPeerId, {
              reliable: true,
            })

            hostConnectionRef.current = conn

            conn.on('open', () => {
              setIsConnected(true)
              setIsConnecting(false)
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
              console.error('Host connection error:', err)
              setError('Failed to establish connection with room')
              setIsConnecting(false)
              reject(err)
            })
          })

          peer.on('error', (err: any) => {
            console.error('PeerJS client error:', err)
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
    [cleanup, handleRawData]
  )

  // Disconnect & destroy on unmount
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
  }
}
