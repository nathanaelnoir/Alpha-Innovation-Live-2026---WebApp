import { describe, expect, it } from 'vitest'
import {
  displayPrompt,
  encodeSliderOnlyPrompt,
  parseSliderOnlyPrompt,
} from './sliderOnly'

describe('slider-only prompt encoding', () => {
  it('round-trips a title and longer subtitle', () => {
    const encoded = encodeSliderOnlyPrompt(
      'Who should make these decisions?',
      'Decision making',
      'Show where responsibility should sit in this situation.',
    )
    expect(parseSliderOnlyPrompt(encoded)).toEqual({
      question: 'Who should make these decisions?',
      title: 'Decision making',
      subtitle: 'Show where responsibility should sit in this situation.',
    })
    expect(displayPrompt(encoded)).toBe('Who should make these decisions?')
  })

  it('keeps the original two-part slider encoding readable', () => {
    expect(
      parseSliderOnlyPrompt('[[slider-only:v1]]["Decision making","Choose a position."]'),
    ).toEqual({
      question: 'Decision making',
      title: null,
      subtitle: 'Choose a position.',
    })
  })

  it('supports a long survey question within the backend prompt limit', () => {
    const question = 'Q'.repeat(600)
    const encoded = encodeSliderOnlyPrompt(question, 'Title', 'Subtitle')

    expect(parseSliderOnlyPrompt(encoded)?.question).toBe(question)
    expect(encoded.length).toBeLessThanOrEqual(1000)
  })

  it('leaves normal and malformed prompts unchanged', () => {
    expect(parseSliderOnlyPrompt('A normal question')).toBeNull()
    expect(displayPrompt('[[slider-only:v1]]broken')).toBe(
      '[[slider-only:v1]]broken',
    )
  })
})
