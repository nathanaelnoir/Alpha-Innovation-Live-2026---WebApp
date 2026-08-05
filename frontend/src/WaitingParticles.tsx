import { useEffect, useRef, type PointerEvent } from 'react'

const PARTICLE_COUNT = 8_000
const ATTRACTION = 0.01
const DAMPING = 0.9
const REPEL_STRENGTH = 28

interface PointerPosition {
  x: number
  y: number
  active: boolean
}

export function WaitingParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0, active: false })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof window.CanvasRenderingContext2D === 'undefined') return
    const context = canvas.getContext('2d')
    if (!context) return

    const positionsX = new Float32Array(PARTICLE_COUNT)
    const positionsY = new Float32Array(PARTICLE_COUNT)
    const velocitiesX = new Float32Array(PARTICLE_COUNT)
    const velocitiesY = new Float32Array(PARTICLE_COUNT)
    const sinSquaredIndex = new Float32Array(PARTICLE_COUNT)
    const cosSquaredIndex = new Float32Array(PARTICLE_COUNT)
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      sinSquaredIndex[index] = Math.sin(index * index)
      cosSquaredIndex[index] = Math.cos(index * index)
    }

    let radius = 0
    let repelRadius = 0
    let angle = 0
    let frameId = 0

    const placeParticles = () => {
      for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        positionsX[index] = Math.sin(index + angle) * sinSquaredIndex[index]! * radius
        positionsY[index] = cosSquaredIndex[index]! * radius
        velocitiesX[index] = 0
        velocitiesY[index] = 0
      }
    }

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(bounds.width))
      canvas.height = Math.max(1, Math.round(bounds.height))
      radius = Math.min(canvas.width * 0.38, canvas.height * 0.24)
      repelRadius = Math.min(canvas.width, canvas.height) * 0.2
      placeParticles()
    }
    resize()

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(resize)
    resizeObserver?.observe(canvas)

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ?? false

    const draw = () => {
      context.fillStyle = '#050505'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#f1f1ed'

      const centerX = canvas.width / 2
      const centerY = canvas.height * 0.3
      const pointer = pointerRef.current
      const repelRadiusSquared = repelRadius * repelRadius

      for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        const homeX = Math.sin(index + angle) * sinSquaredIndex[index]! * radius
        const homeY = cosSquaredIndex[index]! * radius
        let positionX = positionsX[index]!
        let positionY = positionsY[index]!
        let velocityX = velocitiesX[index]!
        let velocityY = velocitiesY[index]!
        velocityX += (homeX - positionX) * ATTRACTION
        velocityY += (homeY - positionY) * ATTRACTION

        if (pointer.active) {
          const awayX = positionX - pointer.x
          const awayY = positionY - pointer.y
          const distanceSquared = awayX * awayX + awayY * awayY
          if (distanceSquared > 0.1 && distanceSquared < repelRadiusSquared) {
            const distance = Math.sqrt(distanceSquared)
            const force = REPEL_STRENGTH * (1 - distance / repelRadius)
            velocityX += (awayX / distance) * force
            velocityY += (awayY / distance) * force
          }
        }

        velocityX *= DAMPING
        velocityY *= DAMPING
        positionX += velocityX
        positionY += velocityY
        velocitiesX[index] = velocityX
        velocitiesY[index] = velocityY
        positionsX[index] = positionX
        positionsY[index] = positionY
        context.fillRect(
          centerX + positionX,
          centerY + positionY,
          1.5,
          1.5,
        )
      }

      if (!reducedMotion) {
        angle += 0.01
        frameId = window.requestAnimationFrame(draw)
      }
    }
    draw()

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
    }
  }, [])

  const updatePointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerRef.current = {
      x: event.clientX - bounds.left - bounds.width / 2,
      y: event.clientY - bounds.top - bounds.height / 2,
      active: true,
    }
  }

  const clearPointer = () => {
    pointerRef.current.active = false
  }

  return (
    <canvas
      ref={canvasRef}
      className="waiting-particles"
      data-testid="waiting-particles"
      aria-hidden="true"
      onPointerDown={updatePointer}
      onPointerMove={updatePointer}
      onPointerLeave={clearPointer}
      onPointerUp={clearPointer}
      onPointerCancel={clearPointer}
    />
  )
}
