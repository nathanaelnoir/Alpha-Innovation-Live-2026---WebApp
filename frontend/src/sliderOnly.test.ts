import { describe, expect, it } from 'vitest'
import {
  displayPrompt,
  encodeSliderOnlyPrompt,
  parseSliderOnlyPrompt,
} from './sliderOnly'

describe('slider-only prompt encoding', () => {
  it('round-trips a title and longer subtitle', () => {
    const encoded = encodeSliderOnlyPrompt(
      'Decision making',
      'Show where responsibility should sit in this situation.',
    )
    expect(parseSliderOnlyPrompt(encoded)).toEqual({
      title: 'Decision making',
      subtitle: 'Show where responsibility should sit in this situation.',
    })
    expect(displayPrompt(encoded)).toBe('Decision making')
  })

  it('leaves normal and malformed prompts unchanged', () => {
    expect(parseSliderOnlyPrompt('A normal question')).toBeNull()
    expect(displayPrompt('[[slider-only:v1]]broken')).toBe(
      '[[slider-only:v1]]broken',
    )
  })
})
