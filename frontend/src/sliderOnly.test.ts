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
      'Degree of automation',
      'Show how strongly technology should influence the decision.',
    )
    expect(parseSliderOnlyPrompt(encoded)).toEqual({
      question: 'Who should make these decisions?',
      sliders: [
        {
          title: 'Decision making',
          subtitle: 'Show where responsibility should sit in this situation.',
        },
        {
          title: 'Degree of automation',
          subtitle: 'Show how strongly technology should influence the decision.',
        },
      ],
    })
    expect(displayPrompt(encoded)).toBe('Who should make these decisions?')
  })

  it('keeps the original two-part slider encoding readable', () => {
    expect(
      parseSliderOnlyPrompt('[[slider-only:v1]]["Decision making","Choose a position."]'),
    ).toEqual({
      question: 'Decision making',
      sliders: [
        { title: null, subtitle: 'Choose a position.' },
        { title: null, subtitle: null },
      ],
    })
  })

  it('supports a long survey question within the backend prompt limit', () => {
    const question = 'Q'.repeat(600)
    const encoded = encodeSliderOnlyPrompt(
      question,
      'First title',
      'First subtitle',
      'Second title',
      'Second subtitle',
    )

    expect(parseSliderOnlyPrompt(encoded)?.question).toBe(question)
    expect(encoded.length).toBeLessThanOrEqual(2000)
  })

  it('leaves normal and malformed prompts unchanged', () => {
    expect(parseSliderOnlyPrompt('A normal question')).toBeNull()
    expect(displayPrompt('[[slider-only:v1]]broken')).toBe(
      '[[slider-only:v1]]broken',
    )
  })
})
