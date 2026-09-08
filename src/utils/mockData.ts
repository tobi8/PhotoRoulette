/**
 * Mock party photo pack & simulated players for testing and demo mode
 */

import { Player } from '../types/game'

export const AVATAR_EMOJIS = ['🦊', '🐱', '🐼', '🦁', '🦄', '🐸', '🐨', '🐙', '🦖', '🐵', '🚀', '🔥']

export const AVATAR_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
]

// Canvas helper to generate themed colorful mock party photos
export function generateMockPhoto(label: string, bgColor: string, icon: string, isDocument = false): string {
  if (typeof document === 'undefined') {
    return `data:image/jpeg;base64,mock_${encodeURIComponent(label)}`
  }
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  if (isDocument) {
    // Generate mock receipt/document
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 800, 600)

    ctx.fillStyle = '#111827'
    ctx.font = 'bold 28px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('STORE RECEIPT / INVOICE #9482', 400, 60)

    ctx.font = '16px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('------------------------------------------------------------', 80, 100)
    ctx.fillText('DATE: 2026-09-08    TIME: 14:22:01    REGISTER: 04', 80, 130)
    ctx.fillText('ITEM 1: ESPRESSO ROAST COFFEE                  $18.50', 80, 180)
    ctx.fillText('ITEM 2: AVOCADO TOAST BREAKFAST               $14.20', 80, 220)
    ctx.fillText('ITEM 3: FRESH PRESSED ORANGE JUICE             $6.50', 80, 260)
    ctx.fillText('ITEM 4: SCONE WITH STRAWBERRY JAM              $4.50', 80, 300)
    ctx.fillText('SUBTOTAL:                                     $43.70', 80, 360)
    ctx.fillText('TAX (8.25%):                                   $3.61', 80, 400)
    ctx.font = 'bold 20px monospace'
    ctx.fillText('TOTAL BALANCE:                                $47.31', 80, 450)
    ctx.font = '16px monospace'
    ctx.fillText('============================================================', 80, 490)
    ctx.textAlign = 'center'
    ctx.fillText('THANK YOU FOR YOUR PURCHASE! PLEASE COME AGAIN.', 400, 530)
    return canvas.toDataURL('image/jpeg', 0.8)
  }

  // Normal fun party photo
  const grad = ctx.createLinearGradient(0, 0, 800, 600)
  grad.addColorStop(0, bgColor)
  grad.addColorStop(1, '#0f172a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 800, 600)

  // Decorative shapes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.beginPath()
  ctx.arc(200, 150, 120, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(650, 450, 180, 0, Math.PI * 2)
  ctx.fill()

  // Icon / Emoji
  ctx.font = '110px system-ui, Apple Color Emoji'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, 400, 240)

  // Label
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 36px system-ui, sans-serif'
  ctx.fillText(label, 400, 380)

  // Subtitle
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.font = '20px system-ui, sans-serif'
  ctx.fillText('Photo Roulette Memories 📸', 400, 430)

  return canvas.toDataURL('image/jpeg', 0.8)
}

import mockVideosData from './mockVideos.json'

export function getMockPartyPhotos() {
  return [
    { id: 'mock-1', title: 'Summer Roadtrip 🚗', color: '#6366f1', emoji: '🏖️' },
    { id: 'mock-2', title: 'Karaoke Night 🎤', color: '#ec4899', emoji: '🎸' },
    { id: 'mock-3', title: 'Spicy Taco Challenge 🌮', color: '#f59e0b', emoji: '🌶️' },
    { id: 'mock-4', title: 'Sleepy Cat Nap 💤', color: '#10b981', emoji: '😴' },
    { id: 'mock-5', title: 'Festival Confetti 🎉', color: '#8b5cf6', emoji: '🪩' },
    { id: 'mock-6', title: 'Hiking Mountain Peak ⛰️', color: '#06b6d4', emoji: '🏕️' },
    { id: 'mock-7', title: 'Cooking Disaster 🔥', color: '#ef4444', emoji: '🥞' },
    { id: 'mock-8', title: 'Theme Park Rollercoaster 🎢', color: '#3b82f6', emoji: '🎢' },
  ].map((item) => ({
    id: item.id,
    type: 'image' as const,
    dataUrl: generateMockPhoto(item.title, item.color, item.emoji),
  }))
}

export function getMockPartyVideos() {
  const clips = [
    { id: 'mock-vid-1', title: 'Karaoke Night 🎤', key: 'karaoke', color: '#ec4899', emoji: '🎤' },
    { id: 'mock-vid-2', title: 'Dance Floor Vibe 🪩', key: 'dance', color: '#8b5cf6', emoji: '🪩' },
    { id: 'mock-vid-3', title: 'Champagne Pop 🍾', key: 'cheers', color: '#f59e0b', emoji: '🍾' },
    { id: 'mock-vid-4', title: 'Rollercoaster Ride 🎢', key: 'rollercoaster', color: '#3b82f6', emoji: '🎢' },
  ]
  return clips.map((c) => ({
    id: c.id,
    type: 'video' as const,
    dataUrl: (mockVideosData as Record<string, string>)[c.key] || '',
    previewUrl: generateMockPhoto(c.title, c.color, c.emoji),
  }))
}

export function getMockPartyDeck(mediaType: 'photos_only' | 'videos_only' | 'mixed' = 'mixed') {
  const photos = getMockPartyPhotos()
  const videos = getMockPartyVideos()

  if (mediaType === 'photos_only') {
    return photos
  }
  if (mediaType === 'videos_only') {
    return videos
  }

  // Mixed: interleave photos and videos
  const mixed: Array<{ id: string; type: 'image' | 'video'; dataUrl: string; previewUrl?: string }> = []
  const maxLen = Math.max(photos.length, videos.length)
  for (let i = 0; i < maxLen; i++) {
    if (i < photos.length) mixed.push(photos[i])
    if (i < videos.length) mixed.push(videos[i])
  }
  return mixed
}

export const MOCK_BOT_PLAYERS: Array<Omit<Player, 'id' | 'isHost' | 'mediaCount' | 'score' | 'streak' | 'lastRoundPoints' | 'fastestAnswersCount'>> = [
  { name: 'Alex 🦊', avatar: '🦊', color: '#ef4444', isReady: true },
  { name: 'Sammy 🐼', avatar: '🐼', color: '#3b82f6', isReady: true },
  { name: 'Taylor 🦁', avatar: '🦁', color: '#10b981', isReady: true },
]
