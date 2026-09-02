const SLIDER_ONLY_V1_PREFIX = '[[slider-only:v1]]'
const SLIDER_ONLY_V2_PREFIX = '[[slider-only:v2]]'
export const SLIDER_ONLY_QUESTION_MAX_LENGTH = 600
export const SLIDER_ONLY_TITLE_MAX_LENGTH = 100
export const SLIDER_ONLY_SUBTITLE_MAX_LENGTH = 220
const SLIDER_ONLY_PROMPT_MAX_LENGTH = 1000

export interface SliderOnlyContent {
  question: string
  title: string | null
  subtitle: string
}

export function encodeSliderOnlyPrompt(
  question: string,
  title: string,
  subtitle: string,
): string {
  const cleanedQuestion = question.trim()
  const cleanedTitle = title.trim()
  const cleanedSubtitle = subtitle.trim()
  if (!cleanedQuestion || !cleanedTitle || !cleanedSubtitle) {
    throw new Error('Slider-only questions require a question, title, and subtitle.')
  }
  if (
    cleanedQuestion.length > SLIDER_ONLY_QUESTION_MAX_LENGTH
    || cleanedTitle.length > SLIDER_ONLY_TITLE_MAX_LENGTH
    || cleanedSubtitle.length > SLIDER_ONLY_SUBTITLE_MAX_LENGTH
  ) {
    throw new Error('The slider-only question, title, or subtitle is too long.')
  }
  const encoded = `${SLIDER_ONLY_V2_PREFIX}${JSON.stringify([
    cleanedQuestion,
    cleanedTitle,
    cleanedSubtitle,
  ])}`
  if (encoded.length > SLIDER_ONLY_PROMPT_MAX_LENGTH) {
    throw new Error('The combined slider-only text is too long.')
  }
  return encoded
}

export function parseSliderOnlyPrompt(prompt: string): SliderOnlyContent | null {
  const isV2 = prompt.startsWith(SLIDER_ONLY_V2_PREFIX)
  const prefix = isV2 ? SLIDER_ONLY_V2_PREFIX : SLIDER_ONLY_V1_PREFIX
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
      ) return { question, title: null, subtitle }
      return null
    }
    if (parsed.length !== 3) return null
    const [question, title, subtitle] = parsed
    if (
      typeof question !== 'string'
      || !question.trim()
      || typeof title !== 'string'
      || !title.trim()
      || typeof subtitle !== 'string'
      || !subtitle.trim()
    ) return null
    return { question, title, subtitle }
  } catch {
    return null
  }
}

export function displayPrompt(prompt: string): string {
  return parseSliderOnlyPrompt(prompt)?.question ?? prompt
}
