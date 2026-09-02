const SLIDER_ONLY_PREFIX = '[[slider-only:v1]]'
export const SLIDER_ONLY_TITLE_MAX_LENGTH = 150
export const SLIDER_ONLY_SUBTITLE_MAX_LENGTH = 300

export interface SliderOnlyContent {
  title: string
  subtitle: string
}

export function encodeSliderOnlyPrompt(title: string, subtitle: string): string {
  const cleanedTitle = title.trim()
  const cleanedSubtitle = subtitle.trim()
  if (!cleanedTitle || !cleanedSubtitle) {
    throw new Error('Slider-only questions require a title and subtitle.')
  }
  if (
    cleanedTitle.length > SLIDER_ONLY_TITLE_MAX_LENGTH
    || cleanedSubtitle.length > SLIDER_ONLY_SUBTITLE_MAX_LENGTH
  ) {
    throw new Error('The slider-only title or subtitle is too long.')
  }
  return `${SLIDER_ONLY_PREFIX}${JSON.stringify([cleanedTitle, cleanedSubtitle])}`
}

export function parseSliderOnlyPrompt(prompt: string): SliderOnlyContent | null {
  if (!prompt.startsWith(SLIDER_ONLY_PREFIX)) return null
  try {
    const parsed: unknown = JSON.parse(prompt.slice(SLIDER_ONLY_PREFIX.length))
    if (!Array.isArray(parsed) || parsed.length !== 2) return null
    const [title, subtitle] = parsed
    if (
      typeof title !== 'string'
      || !title.trim()
      || typeof subtitle !== 'string'
      || !subtitle.trim()
    ) return null
    return { title, subtitle }
  } catch {
    return null
  }
}

export function displayPrompt(prompt: string): string {
  return parseSliderOnlyPrompt(prompt)?.title ?? prompt
}
