import React, { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

interface ConfettiEffectProps {
  trigger?: boolean
}

export const ConfettiEffect: React.FC<ConfettiEffectProps> = ({ trigger = true }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const instanceRef = useRef<confetti.CreateTypes | null>(null)

  useEffect(() => {
    if (!trigger || !canvasRef.current) return

    confetti.reset()

    const myConfetti = confetti.create(canvasRef.current, {
      resize: true,
      useWorker: false,
      disableForReducedMotion: true,
    })
    instanceRef.current = myConfetti

    myConfetti({
      particleCount: 50,
      spread: 60,
      startVelocity: 45,
      decay: 0.92,
      ticks: 160,
      origin: { y: 0.7 },
    })

    myConfetti({
      particleCount: 40,
      spread: 100,
      startVelocity: 35,
      decay: 0.92,
      ticks: 160,
      origin: { y: 0.7 },
    })

    let count = 0
    const interval = setInterval(() => {
      count++
      if (count > 2) {
        clearInterval(interval)
        return
      }

      myConfetti({
        particleCount: 25,
        angle: 60,
        spread: 50,
        startVelocity: 40,
        decay: 0.92,
        ticks: 160,
        origin: { x: 0, y: 0.75 },
      })

      myConfetti({
        particleCount: 25,
        angle: 120,
        spread: 50,
        startVelocity: 40,
        decay: 0.92,
        ticks: 160,
        origin: { x: 1, y: 0.75 },
      })
    }, 1200)

    const timeout = setTimeout(() => {
      clearInterval(interval)
    }, 3600)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
      if (instanceRef.current) {
        instanceRef.current.reset()
        instanceRef.current = null
      }
    }
  }, [trigger])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999] w-full h-full"
    />
  )
}
