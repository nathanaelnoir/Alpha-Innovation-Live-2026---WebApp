import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { coordinateToPercent, normalizePointer } from './coordinates'
import type { Coordinate } from './types'

interface CoordinatePlaneProps {
  value: Coordinate | null
  onChange: (coordinate: Coordinate) => void
  xAxisLabel: string | null
  yAxisLabel: string | null
  disabled?: boolean
  text?: CoordinatePlaneText
}

export interface CoordinatePlaneText {
  ariaLabel: string
  selectedPoint: string
  noPoint: string
  tapHint: string
  horizontal: string
  vertical: string
}

const defaultText: CoordinatePlaneText = {
  ariaLabel: 'Choose your response on the coordinate plane',
  selectedPoint: 'Selected point',
  noPoint: 'No point selected',
  tapHint: '[ TAP OR DRAG TO RESPOND ]',
  horizontal: 'horizontal',
  vertical: 'vertical',
}

const KEYBOARD_STEP = 0.02

export function CoordinatePlane({
  value,
  onChange,
  xAxisLabel,
  yAxisLabel,
  disabled = false,
  text = defaultText,
}: CoordinatePlaneProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)

  const selectFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !surfaceRef.current) return
    const bounds = surfaceRef.current.getBoundingClientRect()
    onChange(normalizePointer(event.clientX, event.clientY, bounds))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    selectFromPointer(event)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      selectFromPointer(event)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return
    }
    event.preventDefault()
    const current = value ?? { x: 0.5, y: 0.5 }
    const next = {
      x:
        current.x +
        (event.key === 'ArrowRight' ? KEYBOARD_STEP : event.key === 'ArrowLeft' ? -KEYBOARD_STEP : 0),
      y:
        current.y +
        (event.key === 'ArrowUp' ? KEYBOARD_STEP : event.key === 'ArrowDown' ? -KEYBOARD_STEP : 0),
    }
    onChange({
      x: Math.min(1, Math.max(0, next.x)),
      y: Math.min(1, Math.max(0, next.y)),
    })
  }

  const point = value ? coordinateToPercent(value) : null
  const readableValue = value
    ? `${text.selectedPoint}: ${xAxisLabel ?? text.horizontal} ${Math.round(value.x * 100)}%, ${yAxisLabel ?? text.vertical} ${Math.round(value.y * 100)}%`
    : text.noPoint

  return (
    <div className="coordinate-layout">
      {/* <div className="axis-label axis-label--y">
        <span>{yAxisLabel ?? 'Vertical scale'}</span>
        <span className="axis-arrow" aria-hidden="true">↑</span>
      </div> */}
      <div
        ref={surfaceRef}
        className={`coordinate-surface${disabled ? ' coordinate-surface--disabled' : ''}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={text.ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ? Math.round(value.x * 100) : undefined}
        aria-valuetext={readableValue}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKeyDown}
        data-testid="coordinate-surface"
      >
        <svg className="coordinate-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <rect width="100" height="100" />
          {/* <path className="grid-micro" d="M10 0V100 M20 0V100 M30 0V100 M40 0V100 M60 0V100 M70 0V100 M80 0V100 M90 0V100 M0 10H100 M0 20H100 M0 30H100 M0 40H100 M0 60H100 M0 70H100 M0 80H100 M0 90H100" /> */}
          <path
            className="grid-minor"
            d="M25 0V100 M75 0V100 M0 25H100 M0 75H100"
            data-testid="quadrant-guides"
          />
          <path className="grid-major" d="M50 0V100 M0 50H100" />
        </svg>
        <div className="scan-band" aria-hidden="true" />
        <div className="coordinate-scale" data-testid="coordinate-scale" aria-hidden="true">
          <span className="coordinate-scale__marker coordinate-scale__marker--x-min">X/0%</span>
          <span className="coordinate-scale__marker coordinate-scale__marker--x-max">X/100%</span>
          <span className="coordinate-scale__marker coordinate-scale__marker--y-min">Y/0%</span>
          <span className="coordinate-scale__marker coordinate-scale__marker--y-max">Y/100%</span>
        </div>
        {point && (
          <div
            className="selected-point"
            style={{ left: `${point.left}%`, top: `${point.top}%` }}
            aria-hidden="true"
          >
            <span />
          </div>
        )}
        {!value && <span className="tap-hint">{text.tapHint}</span>}
      </div>
      {/* <div className="axis-label axis-label--x">
        <span>{xAxisLabel ?? 'Horizontal scale'}</span>
        <span className="axis-arrow" aria-hidden="true">→</span>
      </div> */}
    </div>
  )
}
