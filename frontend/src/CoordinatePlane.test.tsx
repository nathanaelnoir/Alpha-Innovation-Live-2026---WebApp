import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CoordinatePlane } from './CoordinatePlane'

describe('CoordinatePlane', () => {
  it('selects normalized coordinates with a touch pointer', () => {
    const onChange = vi.fn()
    render(
      <CoordinatePlane
        value={null}
        onChange={onChange}
        xAxisLabel="Engagement (low to high)"
        yAxisLabel="Understanding (low to high)"
      />,
    )
    expect(screen.getByTestId('quadrant-guides')).toBeInTheDocument()
    const scale = within(screen.getByTestId('coordinate-scale'))
    expect(scale.getByText('X/0%')).toBeInTheDocument()
    expect(scale.getByText('X/100%')).toBeInTheDocument()
    expect(scale.getByText('Y/0%')).toBeInTheDocument()
    expect(scale.getByText('Y/100%')).toBeInTheDocument()
    const surface = screen.getByTestId('coordinate-surface')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 300,
      height: 200,
      right: 310,
      bottom: 220,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 235,
      clientY: 70,
    })

    expect(onChange).toHaveBeenCalledWith({ x: 0.75, y: 0.75 })
  })

  it('supports keyboard adjustment and clamps at graph boundaries', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <CoordinatePlane value={{ x: 0.99, y: 1 }} onChange={onChange} xAxisLabel={null} yAxisLabel={null} />,
    )
    const surface = screen.getByRole('slider')
    fireEvent.keyDown(surface, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith({ x: 1, y: 1 })

    rerender(
      <CoordinatePlane value={{ x: 0.5, y: 0.5 }} onChange={onChange} xAxisLabel={null} yAxisLabel={null} />,
    )
    fireEvent.keyDown(surface, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith({ x: 0.5, y: 0.48 })
  })
})
