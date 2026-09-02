import type { Coordinate } from './types'

export const AXIS_ENDPOINT_SEPARATOR = ' ↔ '

export interface AxisEndpoints {
  negative: string
  positive: string
}

export interface QuadrantMeaning {
  horizontal: string
  vertical: string
}

export function encodeAxisEndpoints(
  negative: string,
  positive: string,
): string | null {
  const cleanedNegative = negative.trim()
  const cleanedPositive = positive.trim()
  if (!cleanedNegative && !cleanedPositive) return null
  if (!cleanedNegative || !cleanedPositive) {
    throw new Error('Both ends of an axis must be provided.')
  }
  return `${cleanedNegative}${AXIS_ENDPOINT_SEPARATOR}${cleanedPositive}`
}

export function parseAxisEndpoints(label: string | null): AxisEndpoints | null {
  if (!label) return null
  const parts = label.split(AXIS_ENDPOINT_SEPARATOR)
  if (parts.length !== 2) return null
  const [negative, positive] = parts.map((part) => part.trim())
  return negative && positive ? { negative, positive } : null
}

export function quadrantMeaning(
  coordinate: Coordinate,
  xAxisLabel: string | null,
  yAxisLabel: string | null,
): QuadrantMeaning | null {
  const x = parseAxisEndpoints(xAxisLabel)
  const y = parseAxisEndpoints(yAxisLabel)
  if (!x || !y) return null
  return {
    horizontal: coordinate.x < 0.5 ? x.negative : x.positive,
    vertical: coordinate.y < 0.5 ? y.negative : y.positive,
  }
}
