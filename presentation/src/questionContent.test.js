import assert from "node:assert/strict";
import test from "node:test";

import {
  displayPrompt,
  parseAxisEndpoints,
  parseSliderOnlyPrompt,
  selectPresentationSlides,
} from "./questionContent.js";

test("parses encoded axis endpoints", () => {
  assert.deepEqual(parseAxisEndpoints("Less ↔ More"), {
    negative: "Less",
    positive: "More",
  });
  assert.equal(parseAxisEndpoints("Engagement"), null);
});

test("shows the question and both descriptions from current slider-only prompts", () => {
  const encoded = '[[slider-only:v3]]["How ready?","Energy","Quiet to active","Focus","Broad to precise"]';

  assert.equal(displayPrompt(encoded), "How ready?");
  assert.deepEqual(parseSliderOnlyPrompt(encoded)?.sliders, [
    { title: "Energy", subtitle: "Quiet to active" },
    { title: "Focus", subtitle: "Broad to precise" },
  ]);
});

test("keeps legacy slider-only prompts readable", () => {
  assert.equal(displayPrompt('[[slider-only:v1]]["Legacy question","Legacy detail"]'), "Legacy question");
  assert.equal(displayPrompt('[[slider-only:v2]]["Question","Title","Detail"]'), "Question");
});

test("leaves malformed encoded prompts untouched", () => {
  const malformed = "[[slider-only:v3]]not-json";
  assert.equal(displayPrompt(malformed), malformed);
  assert.equal(parseSliderOnlyPrompt(malformed), null);
});

test("selects two coordinate slides followed by one slider-only slide", () => {
  const firstCoordinate = { id: "first", sessionId: "session-1", sliderDescriptions: null };
  const extraFirstSessionQuestion = { id: "extra", sessionId: "session-1", sliderDescriptions: null };
  const slider = { id: "slider", sessionId: "session-3", sliderDescriptions: [{ title: "One" }] };
  const secondCoordinate = { id: "second", sessionId: "session-2", sliderDescriptions: null };

  assert.deepEqual(
    selectPresentationSlides([firstCoordinate, extraFirstSessionQuestion, slider, secondCoordinate]),
    [firstCoordinate, secondCoordinate, slider],
  );
  assert.deepEqual(
    selectPresentationSlides([firstCoordinate, extraFirstSessionQuestion, slider]),
    [firstCoordinate, extraFirstSessionQuestion, slider],
  );
});

test("does not require responses when selecting stored slides", () => {
  const firstCoordinate = { id: "first", sessionId: "session-1", sliderDescriptions: null, points: [] };
  const secondCoordinate = { id: "second", sessionId: "session-2", sliderDescriptions: null, points: [] };
  const slider = { id: "slider", sessionId: "session-3", sliderDescriptions: [{ title: "One" }], points: [] };

  assert.deepEqual(selectPresentationSlides([firstCoordinate, secondCoordinate, slider]), [
    firstCoordinate,
    secondCoordinate,
    slider,
  ]);
});

test("falls back to stored order when session or slider metadata is unavailable", () => {
  const first = { id: "first", sessionId: null, sliderDescriptions: null };
  const second = { id: "second", sessionId: null, sliderDescriptions: null };
  const third = { id: "third", sessionId: null, sliderDescriptions: null };

  assert.deepEqual(selectPresentationSlides([first, second, third]), [first, second, third]);
  assert.equal(selectPresentationSlides([first, second]), null);
});
