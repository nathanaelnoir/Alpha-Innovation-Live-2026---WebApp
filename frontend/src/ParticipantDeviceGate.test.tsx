import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { isLikelyDesktopDevice } from './deviceDetection'
import { ParticipantDeviceGate } from './ParticipantDeviceGate'

describe('ParticipantDeviceGate', () => {
  it.each([
    ['traditional desktop', true, 0, true],
    ['phone', false, 5, false],
    ['touch tablet', false, 10, false],
    ['tablet with a fine pointer', true, 10, false],
  ])(
    'classifies a %s',
    (_label, hasFineHoverPointer, maxTouchPoints, expected) => {
      expect(isLikelyDesktopDevice(hasFineHoverPointer, maxTouchPoints)).toBe(
        expected,
      )
    },
  )

  it('blocks the participant application on a traditional desktop', () => {
    render(
      <ParticipantDeviceGate isDesktop>
        <div>Participant survey</div>
      </ParticipantDeviceGate>,
    )

    expect(
      screen.getByRole('heading', { name: 'Please use a phone or tablet' }),
    ).toBeInTheDocument()
    expect(
      screen.getByTitle('Scan to open eigenvalue.space on a mobile device'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Participant survey')).not.toBeInTheDocument()
  })

  it('renders the participant application on touch devices', () => {
    render(
      <ParticipantDeviceGate isDesktop={false}>
        <div>Participant survey</div>
      </ParticipantDeviceGate>,
    )

    expect(screen.getByText('Participant survey')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Please use a phone or tablet' }),
    ).not.toBeInTheDocument()
  })
})
