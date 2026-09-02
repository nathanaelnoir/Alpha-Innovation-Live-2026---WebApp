import { describe, expect, it } from 'vitest'
import {
  encodeAxisEndpoints,
  parseAxisEndpoints,
  quadrantMeaning,
} from './quadrants'

describe('quadrant labels', () => {
  it('encodes and parses both ends of an axis', () => {
    const encoded = encodeAxisEndpoints(' Internal processes ', 'Products and services')
    expect(encoded).toBe('Internal processes ↔ Products and services')
    expect(parseAxisEndpoints(encoded)).toEqual({
      negative: 'Internal processes',
      positive: 'Products and services',
    })
  })

  it('preserves compatibility with existing single axis labels', () => {
    expect(parseAxisEndpoints('Engagement (low to high)')).toBeNull()
    expect(encodeAxisEndpoints('', '')).toBeNull()
  })

  it('derives quadrant meaning and assigns center lines to positive ends', () => {
    const x = 'Internal processes ↔ Products and services'
    const y = 'Human-driven decisions ↔ AI-based decisions'
    expect(quadrantMeaning({ x: 0.25, y: 0.75 }, x, y)).toEqual({
      horizontal: 'Internal processes',
      vertical: 'AI-based decisions',
    })
    expect(quadrantMeaning({ x: 0.5, y: 0.5 }, x, y)).toEqual({
      horizontal: 'Products and services',
      vertical: 'AI-based decisions',
    })
  })
})
