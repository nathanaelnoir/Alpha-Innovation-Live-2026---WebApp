import type { Coordinate } from './types'

export interface ElementBounds {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value))

export function normalizePointer(
  clientX: number,
  clientY: number,
  bounds: ElementBounds,
): Coordinate {
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new RangeError('Coordinate surface must have a positive size')
  }

  return {
    x: clamp((clientX - bounds.left) / bounds.width),
    y: clamp(1 - (clientY - bounds.top) / bounds.height),
  }
}

export function coordinateToPercent(coordinate: Coordinate): {
  left: number
  top: number
} {
  return {
    left: clamp(coordinate.x) * 100,
    top: (1 - clamp(coordinate.y)) * 100,
  }
}

