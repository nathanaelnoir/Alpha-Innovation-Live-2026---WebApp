const SLIDER_ONLY_V1_PREFIX = '[[slider-only:v1]]'
const SLIDER_ONLY_V2_PREFIX = '[[slider-only:v2]]'
const SLIDER_ONLY_V3_PREFIX = '[[slider-only:v3]]'
export const SLIDER_ONLY_QUESTION_MAX_LENGTH = 600
export const SLIDER_ONLY_TITLE_MAX_LENGTH = 100
export const SLIDER_ONLY_SUBTITLE_MAX_LENGTH = 220
const SLIDER_ONLY_PROMPT_MAX_LENGTH = 2000

export interface SliderDescription {
  title: string | null
  subtitle: string | null
}

export interface SliderOnlyContent {
  question: string
  sliders: [SliderDescription, SliderDescription]
}

export function encodeSliderOnlyPrompt(
  question: string,
  firstTitle: string,
  firstSubtitle: string,
  secondTitle: string,
  secondSubtitle: string,
): string {
  const cleanedQuestion = question.trim()
  const cleanedFirstTitle = firstTitle.trim()
  const cleanedFirstSubtitle = firstSubtitle.trim()
  const cleanedSecondTitle = secondTitle.trim()
  const cleanedSecondSubtitle = secondSubtitle.trim()
  if (
    !cleanedQuestion
    || !cleanedFirstTitle
    || !cleanedFirstSubtitle
    || !cleanedSecondTitle
    || !cleanedSecondSubtitle
  ) {
    throw new Error('Slider-only questions require a question and two slider descriptions.')
  }
  if (
    cleanedQuestion.length > SLIDER_ONLY_QUESTION_MAX_LENGTH
    || cleanedFirstTitle.length > SLIDER_ONLY_TITLE_MAX_LENGTH
    || cleanedFirstSubtitle.length > SLIDER_ONLY_SUBTITLE_MAX_LENGTH
    || cleanedSecondTitle.length > SLIDER_ONLY_TITLE_MAX_LENGTH
    || cleanedSecondSubtitle.length > SLIDER_ONLY_SUBTITLE_MAX_LENGTH
  ) {
    throw new Error('The slider-only question, title, or subtitle is too long.')
  }
  const encoded = `${SLIDER_ONLY_V3_PREFIX}${JSON.stringify([
    cleanedQuestion,
    cleanedFirstTitle,
    cleanedFirstSubtitle,
    cleanedSecondTitle,
    cleanedSecondSubtitle,
  ])}`
  if (encoded.length > SLIDER_ONLY_PROMPT_MAX_LENGTH) {
    throw new Error('The combined slider-only text is too long.')
  }
  return encoded
}

export function parseSliderOnlyPrompt(prompt: string): SliderOnlyContent | null {
  const isV3 = prompt.startsWith(SLIDER_ONLY_V3_PREFIX)
  const isV2 = prompt.startsWith(SLIDER_ONLY_V2_PREFIX)
  const prefix = isV3
    ? SLIDER_ONLY_V3_PREFIX
    : isV2
      ? SLIDER_ONLY_V2_PREFIX
      : SLIDER_ONLY_V1_PREFIX
  if (!prompt.startsWith(prefix)) return null
  try {
    const parsed: unknown = JSON.parse(prompt.slice(prefix.length))
    if (!Array.isArray(parsed)) return null
    if (!isV2 && parsed.length === 2) {
      const [question, subtitle] = parsed
      if (
        typeof question === 'string'
        && question.trim()
        && typeof subtitle === 'string'
        && subtitle.trim()
      ) return {
        question,
        sliders: [
          { title: null, subtitle },
          { title: null, subtitle: null },
        ],
      }
      return null
    }
    if (isV2 && parsed.length === 3) {
      const [question, title, subtitle] = parsed
      if (
        typeof question === 'string'
        && question.trim()
        && typeof title === 'string'
        && title.trim()
        && typeof subtitle === 'string'
        && subtitle.trim()
      ) return {
        question,
        sliders: [
          { title, subtitle },
          { title: null, subtitle: null },
        ],
      }
      return null
    }
    if (!isV3 || parsed.length !== 5) return null
    const [question, firstTitle, firstSubtitle, secondTitle, secondSubtitle] = parsed
    if (
      typeof question !== 'string'
      || !question.trim()
      || typeof firstTitle !== 'string'
      || !firstTitle.trim()
      || typeof firstSubtitle !== 'string'
      || !firstSubtitle.trim()
      || typeof secondTitle !== 'string'
      || !secondTitle.trim()
      || typeof secondSubtitle !== 'string'
      || !secondSubtitle.trim()
    ) return null
    return {
      question,
      sliders: [
        { title: firstTitle, subtitle: firstSubtitle },
        { title: secondTitle, subtitle: secondSubtitle },
      ],
    }
  } catch {
    return null
  }
}

export function displayPrompt(prompt: string): string {
  return parseSliderOnlyPrompt(prompt)?.question ?? prompt
}
