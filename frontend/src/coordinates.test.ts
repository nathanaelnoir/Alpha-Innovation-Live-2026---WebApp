import { describe, expect, it } from 'vitest'
import { coordinateToPercent, normalizePointer } from './coordinates'

const bounds = { left: 100, top: 50, width: 400, height: 200 }

describe('normalizePointer', () => {
  it.each([
    ['top-left', 100, 50, { x: 0, y: 1 }],
    ['top-right', 500, 50, { x: 1, y: 1 }],
    ['bottom-left', 100, 250, { x: 0, y: 0 }],
    ['bottom-right', 500, 250, { x: 1, y: 0 }],
    ['center', 300, 150, { x: 0.5, y: 0.5 }],
  ])('normalizes the %s position', (_name, clientX, clientY, expected) => {
    expect(normalizePointer(clientX, clientY, bounds)).toEqual(expected)
  })

  it('clamps pointer positions outside the surface', () => {
    expect(normalizePointer(-100, 900, bounds)).toEqual({ x: 0, y: 0 })
    expect(normalizePointer(900, -100, bounds)).toEqual({ x: 1, y: 1 })
  })

  it('uses the current dimensions so responsive resizing keeps the scale normalized', () => {
    const desktop = normalizePointer(300, 150, bounds)
    const mobile = normalizePointer(175, 200, {
      left: 50,
      top: 100,
      width: 250,
      height: 200,
    })
    expect(desktop).toEqual({ x: 0.5, y: 0.5 })
    expect(mobile).toEqual(desktop)
  })

  it('rejects a surface without measurable dimensions', () => {
    expect(() => normalizePointer(0, 0, { ...bounds, width: 0 })).toThrow(RangeError)
  })
})

describe('coordinateToPercent', () => {
  it('converts bottom-left coordinates to CSS placement', () => {
    expect(coordinateToPercent({ x: 0.2, y: 0.75 })).toEqual({ left: 20, top: 25 })
  })
})

