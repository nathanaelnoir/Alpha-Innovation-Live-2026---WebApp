export const AXIS_ENDPOINT_SEPARATOR = " ↔ ";

const SLIDER_ONLY_PREFIXES = [
  ["[[slider-only:v3]]", 5],
  ["[[slider-only:v2]]", 3],
  ["[[slider-only:v1]]", 2],
];

export function parseAxisEndpoints(label) {
  if (!label) return null;
  const parts = label.split(AXIS_ENDPOINT_SEPARATOR);
  if (parts.length !== 2) return null;
  const [negative, positive] = parts.map((part) => part.trim());
  return negative && positive ? { negative, positive } : null;
}

export function parseSliderOnlyPrompt(prompt) {
  const version = SLIDER_ONLY_PREFIXES.find(([prefix]) => prompt.startsWith(prefix));
  if (!version) return null;
  const [prefix, expectedLength] = version;

  try {
    const values = JSON.parse(prompt.slice(prefix.length));
    if (
      !Array.isArray(values)
      || values.length !== expectedLength
      || values.some((value) => typeof value !== "string" || !value.trim())
    ) return null;

    if (expectedLength === 5) {
      return {
        question: values[0],
        sliders: [
          { title: values[1], subtitle: values[2] },
          { title: values[3], subtitle: values[4] },
        ],
      };
    }
    if (expectedLength === 3) {
      return {
        question: values[0],
        sliders: [
          { title: values[1], subtitle: values[2] },
          { title: null, subtitle: null },
        ],
      };
    }
    return {
      question: values[0],
      sliders: [
        { title: null, subtitle: values[1] },
        { title: null, subtitle: null },
      ],
    };
  } catch {
    return null;
  }
}

export function displayPrompt(prompt) {
  return parseSliderOnlyPrompt(prompt)?.question ?? prompt;
}

export function selectPresentationSlides(datasets) {
  const coordinateSlides = datasets.filter((dataset) => !dataset.sliderDescriptions);
  const sliderSlide = datasets.find((dataset) => dataset.sliderDescriptions);
  if (coordinateSlides.length < 2 || !sliderSlide) return null;
  return [coordinateSlides[0], coordinateSlides[1], sliderSlide];
}
