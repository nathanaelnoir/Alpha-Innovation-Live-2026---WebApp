import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArtworkBrand } from './ArtworkBrand'

describe('ArtworkBrand', () => {
  it('exposes one accessible artwork title while duplicating the visual marquee', () => {
    const { container } = render(<ArtworkBrand />)

    expect(
      screen.getByRole('link', { name: 'eigenvalue.space home' }),
    ).toHaveAttribute('href', '/')
    expect(container.querySelectorAll('.artwork-brand__title')).toHaveLength(2)
    expect(container.querySelector('.artwork-brand__viewport')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})
