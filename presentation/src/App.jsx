import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
import * as THREE from "three";
import { evaluate, getAudioContext, getSuperdoughAudioController, hush, initAudio, initStrudel } from "@strudel/web";
import { displayPrompt, parseAxisEndpoints, parseSliderOnlyPrompt, selectPresentationSlides } from "./questionContent.js";

const TARGET_SECONDS = 16.5;
const MIN_POINTS = 1;
const MAX_POINTS = 150;
const LOOKAHEAD = 0.16;
const FIRST_RUN_LOOKAHEAD = 0.45;
const AUDIO_WARMUP_MS = 300;
const COORDINATE_REVEAL_MS = 1320;
const DATA_CLEAR_MS = 1100;
const NEXT_QUESTION_BLEND_MS = 1320;
const FINAL_RELEASE_SECONDS = 0.06;
const AUDIO_TEMPO_SCALE = 0.92;
const STRUDEL_CPM = 70 * AUDIO_TEMPO_SCALE;
const STRUDEL_BACKGROUND = `
setcpm(${STRUDEL_CPM})
`;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

let audioWarmupPromise = null;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const lerp = (a, b, t) => a + (b - a) * t;

function warmAudioEngine() {
  if (audioWarmupPromise) return audioWarmupPromise;
  audioWarmupPromise = (async () => {
    const strudelContext = getAudioContext();
    await Promise.all([Tone.start(), strudelContext.resume(), initAudio(), initStrudel()]);
    const masterGain = getSuperdoughAudioController().output.destinationGain.gain;
    const now = strudelContext.currentTime;
    masterGain.cancelScheduledValues(now);
    masterGain.setValueAtTime(0, now);
    await evaluate(`${STRUDEL_BACKGROUND}\n$: note("a4").s("sine").fast(8).gain(0)`);
    await new Promise((resolve) => window.setTimeout(resolve, AUDIO_WARMUP_MS));
    hush();
  })().catch((error) => {
    audioWarmupPromise = null;
    throw error;
  });
  return audioWarmupPromise;
}

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function seededShuffle(points, seedText) {
  let seed = 2166136261;
  for (const character of String(seedText)) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  const random = mulberry32(seed >>> 0);
  const shuffled = points.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function makeDataset(id, question, count, clusters, seed) {
  const random = mulberry32(seed);
  const points = Array.from({ length: count }, () => {
    const c = clusters[Math.floor(random() * clusters.length)];
    return { x: c[0] + gaussian(random) * c[2], y: c[1] + gaussian(random) * c[3] };
  });
  return { id, question, points };
}

const DEMO_DATA = [
  makeDataset("q_001", "Where does confidence meet curiosity?", 150, [[-0.45, 0.38, 0.2, 0.18], [0.42, -0.25, 0.16, 0.23]], 11),
  makeDataset("q_002", "How close are urgency and shared understanding?", 150, [[-0.5, -0.2, 0.15, 0.2], [0.05, 0.42, 0.22, 0.13], [0.55, -0.05, 0.14, 0.24]], 27),
  makeDataset("q_003", "What shape does collective optimism take?", 150, [[-0.38, 0.2, 0.24, 0.14], [0.4, 0.3, 0.19, 0.18], [0.15, -0.5, 0.18, 0.12]], 43),
  makeDataset("q_004", "Where are risk and reward in balance?", 150, [[-0.35, -0.35, 0.23, 0.2], [0.45, 0.4, 0.24, 0.19]], 81),
  makeDataset("q_005", "How aligned does the room feel now?", 150, [[-0.1, 0.05, 0.22, 0.18], [0.55, 0.32, 0.13, 0.15]], 119),
];

const QUESTION_TRANSLATIONS = {
  q_001: {
    EN: "Where does confidence meet curiosity?",
    DE: "Wo treffen Vertrauen und Neugier aufeinander?",
    IT: "Dove si incontrano fiducia e curiosità?",
  },
  q_002: {
    EN: "How close are urgency and shared understanding?",
    DE: "Wie nah liegen Dringlichkeit und gemeinsames Verständnis beieinander?",
    IT: "Quanto sono vicine l’urgenza e la comprensione condivisa?",
  },
  q_003: {
    EN: "What shape does collective optimism take?",
    DE: "Welche Form nimmt kollektiver Optimismus an?",
    IT: "Che forma assume l’ottimismo collettivo?",
  },
  q_004: {
    EN: "Where are risk and reward in balance?",
    DE: "Wo stehen Risiko und Ertrag im Gleichgewicht?",
    IT: "Dove sono in equilibrio rischio e rendimento?",
  },
  q_005: {
    EN: "How aligned does the room feel now?",
    DE: "Wie abgestimmt fühlt sich der Raum jetzt an?",
    IT: "Quanto si sente allineata la sala in questo momento?",
  },
};

function getQuestionTranslations(dataset) {
  if (dataset?.translations) {
    return Object.entries(dataset.translations).filter(([, question]) => question);
  }
  const translations = QUESTION_TRANSLATIONS[dataset?.id];
  return translations ? Object.entries(translations) : [["EN", dataset?.question ?? ""]];
}

// Keep question changes asynchronous so the transition waits for a complete dataset.
async function fakeFetchDataset(index, source = DEMO_DATA) {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return source[index] ?? null;
}

function validateDataset(raw) {
  if (!raw || typeof raw.question !== "string" || !Array.isArray(raw.points)) return null;
  let dropped = 0;
  const points = raw.points.slice(0, MAX_POINTS).flatMap((point) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      dropped += 1;
      return [];
    }
    return [{ x: clamp(x, -1, 1), y: clamp(y, -1, 1) }];
  });
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    position: Number(raw.position) || 1,
    question: raw.question.trim(),
    translations: raw.translations ?? null,
    axisLabels: raw.axisLabels ?? null,
    axisEndpoints: raw.axisEndpoints ?? {
      x: parseAxisEndpoints(raw.axisLabels?.x),
      y: parseAxisEndpoints(raw.axisLabels?.y),
    },
    sliderDescriptions: raw.sliderDescriptions ?? null,
    sessionId: raw.sessionId ?? null,
    sessionTitle: raw.sessionTitle ?? null,
    points,
    dropped,
  };
}

function presentationToDatasets(presentation) {
  if (!presentation || !Array.isArray(presentation.questions)) return [];
  return presentation.questions.map((question) => {
    const sliderContent = [question.prompt, question.prompt_de, question.prompt_it]
      .filter(Boolean)
      .map(parseSliderOnlyPrompt)
      .find(Boolean) ?? null;
    return {
      id: question.id,
      position: question.position,
      question: displayPrompt(question.prompt),
      translations: {
        EN: displayPrompt(question.prompt),
        DE: question.prompt_de ? displayPrompt(question.prompt_de) : null,
        IT: question.prompt_it ? displayPrompt(question.prompt_it) : null,
      },
      axisLabels: {
        x: question.x_axis_label,
        y: question.y_axis_label,
      },
      axisEndpoints: {
        x: parseAxisEndpoints(question.x_axis_label),
        y: parseAxisEndpoints(question.y_axis_label),
      },
      sliderDescriptions: sliderContent?.sliders ?? null,
      sessionId: presentation.id,
      sessionTitle: presentation.title,
      points: question.points.map((point) => ({
        x: Number(point.x) * 2 - 1,
        y: Number(point.y) * 2 - 1,
      })),
    };
  });
}

async function fetchPresentations(token) {
  const response = await fetch(`${API_BASE_URL}/api/v1/presentation/all`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || `Presentation API returned ${response.status}`);
  }
  return response.json();
}

function prepareRun(dataset, targetSeconds) {
  // Random-looking but repeatable per dataset. Dots remain visual while one
  // constant Strudel tone spans the complete movement.
  const ordered = seededShuffle(
    dataset.points.map((point, sourceIndex) => ({ ...point, sourceIndex })),
    dataset.id,
  );
  const count = ordered.length;
  const sequenceDuration = targetSeconds;
  const rawSpacing = sequenceDuration / count;
  const regime = rawSpacing > 0.8 ? "sparse" : rawSpacing < 0.2 ? "dense" : "nominal";
  const nominalDuration = sequenceDuration;
  let mean = { x: 0, y: 0 };
  let spread = 0;
  let previousDegree = 3;

  const events = ordered.map((point, index) => {
    const previous = mean;
    const pointCount = index + 1;
    mean = {
      x: previous.x + (point.x - previous.x) / pointCount,
      y: previous.y + (point.y - previous.y) / pointCount,
    };
    spread += (Math.hypot(point.x - mean.x, point.y - mean.y) - spread) / pointCount;
    const shift = Math.hypot(mean.x - previous.x, mean.y - previous.y);
    const weight = clamp(shift / (1 / pointCount), 0.2, 3);
    const distance = Math.hypot(point.x - mean.x, point.y - mean.y);
    const progress = count === 1 ? 1 : index / (count - 1);
    const scaleDegree = Math.round(((point.y + 1) / 2) * 6);
    // Follow the data contour without allowing octave-folding to drift the
    // sequence progressively downward over a long dataset.
    const degree = clamp(previousDegree + clamp(scaleDegree - previousDegree, -2, 2), 0, 6);
    previousDegree = degree;
    return {
      ...point,
      index,
      count: pointCount,
      mean,
      spread,
      distance,
      weight,
      compressedWeight: Math.sqrt(weight / 3),
      degree,
      pan: lerp(0.2, 0.8, (point.x + 1) / 2),
      cutoff: lerp(1000, 4000, (point.x + 1) / 2),
      velocity: clamp(0.62 + Math.sqrt(weight / 3) * 0.3, 0.62, 0.92),
      accent: index > 3 && distance > Math.max(0.42, spread * 1.35),
      progress,
      time: index * (nominalDuration / count),
    };
  });

  return {
    events,
    duration: nominalDuration,
    regime,
  };
}

function buildForwardComposition(run, movementIndex) {
  const variations = [
    { transpose: 0, cpm: 70, data: "f#5", figureFast: 2, pulseSlow: 7, clusterSlow: 13, voice: "sine", low: 1100, high: 4200, noiseSlow: 17 },
    { transpose: 5, cpm: 67, data: "b5", figureFast: 1.7, pulseSlow: 9, clusterSlow: 15, voice: "triangle", low: 850, high: 3500, noiseSlow: 21 },
    { transpose: -2, cpm: 73, data: "e5", figureFast: 2.3, pulseSlow: 6, clusterSlow: 11, voice: "sine", low: 1450, high: 5200, noiseSlow: 14 },
    { transpose: 3, cpm: 65, data: "g#5", figureFast: 1.55, pulseSlow: 11, clusterSlow: 17, voice: "sawtooth", low: 720, high: 3100, noiseSlow: 24 },
    { transpose: 7, cpm: 71, data: "c#6", figureFast: 2.1, pulseSlow: 8, clusterSlow: 12, voice: "triangle", low: 1250, high: 4700, noiseSlow: 19 },
  ];
  const variation = variations[movementIndex % variations.length];
  const compositionCpm = variation.cpm * AUDIO_TEMPO_SCALE;
  const forwardCycles = run.duration * compositionCpm / 60;
  const dataNotes = run.events.map((_, index) => index === 0 || index === run.events.length - 1 ? "a5" : variation.data).join(" ") || "~";

  return `
// @version 1.0
setcpm(${compositionCpm})
const figure = note("<f#4 a4 b4> <d5 c#5 b4>")
  .add(note(${variation.transpose}))
  .fast(${variation.figureFast})
  .every(4, x => x.slow(3/2))
  .every(11, x => x.fast(7/6))
  .s("${variation.voice}")
  .gain(0.25)
  .att(0.01)
  .rel(0.3)
  .lpf(perlin.range(${variation.low}, ${variation.high}).slow(29))
  .pan(sine.range(0.28, 0.72).slow(31))
  .delay(0.08)
  .delaytime(0.11)
  .delayfeedback(0.14)
  .postgain(0.16)

const drone = stack(
  note("f#1").add(note(${variation.transpose})).s("sine").slow(23),
  note("b1").add(note(${variation.transpose + 0.11})).s("sawtooth").slow(29),
  note("d2").add(note(${variation.transpose - 0.08})).s("supersaw").slow(37)
)
  .att(5)
  .rel(10)
  .legato(1)
  .lpf(sine.range(170, 680).slow(41))
  .lpq(perlin.range(0.7, 2).slow(47))
  .lfo({c: "lpf", r: 0.022, dep: 0.32})
  .pan(sine.range(0.22, 0.78).slow(53))
  .room(0.32)
  .gain(0.42)
  .postgain(0.075)

const pulses = note("f#5 ~ ~ b5 ~ c#6 ~ ~ a5 ~")
  .add(note(${variation.transpose}))
  .slow(${variation.pulseSlow})
  .degradeBy(0.48)
  .rarely(add(note(12)))
  .s("sine")
  .att(0.001)
  .rel(0.016)
  .hpf(1300)
  .lpf(perlin.range(2800, 7200).slow(19))
  .pan(perlin.slow(17))
  .gain(perlin.range(0.3, 0.62).slow(23))
  .postgain(0.09)

const clusters = n("0 ~ 2 [~ 4] 1 ~ 5 ~ 3")
  .scale("B2:minor")
  .add(note(${variation.transpose}))
  .slow(${variation.clusterSlow})
  .degradeBy(0.42)
  .sometimes(add(note(12)))
  .s("sawtooth")
  .att(0.012)
  .rel(0.22)
  .bpf(perlin.range(350, 1600).slow(31))
  .bpq(2.4)
  .pan(sine.range(0.12, 0.88).slow(37))
  .gain(0.36)
  .postgain(0.08)

const noise = s("pink ~ ~ ~ pink ~ ~")
  .slow(${variation.noiseSlow})
  .degradeBy(0.56)
  .att(0.003)
  .rel(0.1)
  .bpf(perlin.range(650, 4600).slow(43))
  .bpq(perlin.range(1.4, 4.5).slow(37))
  .pan(perlin.slow(27))
  .gain(perlin.range(0.16, 0.4).slow(33))
  .postgain(0.04)

const bass = note("f#1 ~ ~ ~ b1 ~ ~")
  .add(note(${variation.transpose}))
  .slow(19)
  .degradeBy(0.62)
  .rarely(add(note(12)))
  .s("sine")
  .att(0.07)
  .rel(1.5)
  .lpf(perlin.range(100, 310).slow(39))
  .pan(0.5)
  .gain(0.44)
  .postgain(0.09)

const data = note("${dataNotes}")
  .slow(${forwardCycles})
  .s("sine")
  .att(0.001)
  .rel(0.007)
  .hpf(650)
  .lpf(3800)
  .pan(0.5)
  .gain(0.62)
  .postgain(0.075)

$: stack(drone, figure, pulses, clusters, noise, bass, data)
`;
}

function IkedaWaitingVisual({ reducedMotion }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl");
    if (!canvas || !gl) return undefined;

    const vertexSource = `
      attribute vec2 a_position;
      void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
    `;
    const fragmentSource = `
      #ifdef GL_ES
      precision mediump float;
      #endif
      uniform vec2 u_resolution;
      uniform float u_time;

      float random(in float x) { return fract(sin(x) * 1e4); }
      float random(in vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }
      float pattern(vec2 st, vec2 velocity, float threshold) {
        vec2 position = floor(st + velocity);
        return step(threshold, random(100.0 + position * 0.000001) + random(position.x) * 0.5);
      }

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        st.x *= u_resolution.x / u_resolution.y;
        vec2 grid = vec2(25.0, 50.0);
        st *= grid;

        vec2 integerPosition = floor(st);
        vec2 cellPosition = fract(st);
        float lane = integerPosition.x;
        vec2 velocity = vec2(0.0, 1.0)
          * u_time * 2.0 * max(grid.x, grid.y)
          * random(1.0 + lane);

        vec2 offset = vec2(0.0, 0.1);
        float firstSignal = pattern(st + offset, velocity, 1.0);
        float secondSignal = pattern(st, velocity, 1.0);
        float thirdSignal = pattern(st - offset, velocity, 1.0);
        float margin = step(0.1, cellPosition.x);
        float dataSignal = max(firstSignal, max(secondSignal, thirdSignal)) * margin;
        vec3 background = vec3(0.015);
        vec3 whiteInk = vec3(0.945);
        gl_FragColor = vec4(mix(background, whiteInk, dataSignal), 1.0);
      }
    `;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    if (!vertexShader || !fragmentShader || !program || !buffer) return undefined;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    const resolution = gl.getUniformLocation(program, "u_resolution");
    const time = gl.getUniformLocation(program, "u_time");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(bounds.width * dpr));
      canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    };
    resize();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);

    const startedAt = performance.now();
    let frameId = 0;
    const render = (now) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, reducedMotion ? 0 : (now - startedAt) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reducedMotion) frameId = window.requestAnimationFrame(render);
    };
    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} className="ikeda-waiting" aria-hidden="true" />;
}

function Plot({ dataset, state, visualRef, clearStartedAt, coordinateRevealStartedAt, reducedMotion }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let frame;
    const render = (now) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width, h = rect.height;
      ctx.clearRect(0, 0, w, h);
      const fade = state === "cleared" && clearStartedAt ? clamp(1 - (now - clearStartedAt) / 1000, 0, 1) : 1;
      const dataFade = state === "transforming" && clearStartedAt
        ? clamp(1 - (now - clearStartedAt) / DATA_CLEAR_MS, 0, 1)
        : fade;
      const revealRaw = state === "opening" && coordinateRevealStartedAt
        ? clamp((now - coordinateRevealStartedAt) / COORDINATE_REVEAL_MS, 0, 1)
        : 1;
      const reveal = reducedMotion ? 1 : 1 - Math.pow(1 - revealRaw, 3);
      const introAlpha = state === "opening" ? reveal : 1;
      const axisAlpha = state === "cleared" ? 0.12 : 0.32;

      // The reference uses one uninterrupted drafting grid behind a centered,
      // nearly-square coordinate field. Keeping the outer grid visible makes
      // the plot feel registered to the room rather than framed like a chart.
      const finalPlotSize = Math.min(w * (w < 720 ? 0.86 : 0.5), h * 0.86);
      const plotSize = finalPlotSize * (state === "opening" ? lerp(0.012, 1, reveal) : 1);
      const left = (w - plotSize) / 2;
      const top = (h - plotSize) / 2;
      const right = left + plotSize;
      const bottom = top + plotSize;
      const gridStep = clamp(finalPlotSize / 13.5, 24, 36);
      const X = (x) => left + ((x + 1) / 2) * plotSize;
      const Y = (y) => bottom - ((y + 1) / 2) * plotSize;

      // A very slight lift separates the active coordinate field from the
      // surrounding room without turning it into a conventional panel.
      ctx.fillStyle = `rgba(18,18,18,${introAlpha})`;
      ctx.fillRect(left, top, plotSize, plotSize);

      ctx.lineWidth = 0.5;
      ctx.strokeStyle = `rgba(190,202,210,${axisAlpha * 0.48 * introAlpha})`;
      const gridOriginX = left % gridStep;
      const gridOriginY = top % gridStep;
      for (let x = gridOriginX; x <= w; x += gridStep) {
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); ctx.stroke();
      }
      for (let y = gridOriginY; y <= h; y += gridStep) {
        ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); ctx.stroke();
      }

      // Brighter origin axes.
      const coordinateLineOpacity = axisAlpha * 1.35 * fade * introAlpha;
      ctx.strokeStyle = `rgba(255,255,255,${coordinateLineOpacity})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(left, Y(0)); ctx.lineTo(right, Y(0)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0), top); ctx.lineTo(X(0), bottom); ctx.stroke();

      // Open corner brackets and midpoint registration ticks, matching the
      // physical calibration-mark quality of the supplied image.
      const bracket = Math.min(clamp(finalPlotSize * 0.047, 24, 46), Math.max(1, plotSize * 0.34));
      const tick = Math.min(clamp(finalPlotSize * 0.022, 12, 22), Math.max(1, plotSize * 0.22));
      const edgeRevealAlpha = state === "opening" ? 0.55 + introAlpha * 0.45 : 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.98 * fade * edgeRevealAlpha})`;
      ctx.lineWidth = clamp(finalPlotSize * 0.004, 2.5, 4.5);
      ctx.lineCap = "round";
      const corner = (x, y, sx, sy) => {
        ctx.beginPath();
        ctx.moveTo(x, y + sy * bracket); ctx.lineTo(x, y); ctx.lineTo(x + sx * bracket, y);
        ctx.stroke();
      };
      corner(left, top, 1, 1); corner(right, top, -1, 1);
      corner(left, bottom, 1, -1); corner(right, bottom, -1, -1);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = `rgba(255,255,255,${coordinateLineOpacity})`;
      ctx.lineCap = "butt";
      ctx.beginPath(); ctx.moveTo(X(0) - tick, top); ctx.lineTo(X(0) + tick, top); ctx.moveTo(X(0), top); ctx.lineTo(X(0), top + tick * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0) - tick, bottom); ctx.lineTo(X(0) + tick, bottom); ctx.moveTo(X(0), bottom); ctx.lineTo(X(0), bottom - tick * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, Y(0) - tick); ctx.lineTo(left, Y(0) + tick); ctx.moveTo(left, Y(0)); ctx.lineTo(left + tick * 0.9, Y(0)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(right, Y(0) - tick); ctx.lineTo(right, Y(0) + tick); ctx.moveTo(right, Y(0)); ctx.lineTo(right - tick * 0.9, Y(0)); ctx.stroke();
      ctx.lineCap = "butt";

      // The active question's coordinate labels come directly from PostgreSQL.
      ctx.fillStyle = `rgba(255,255,255,${0.88 * fade * introAlpha})`;
      const axisLabelFontSize = 20;
      const axisLabelOffset = axisLabelFontSize + 10;
      ctx.font = `500 ${axisLabelFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const xEndpoints = dataset?.axisEndpoints?.x;
      const yEndpoints = dataset?.axisEndpoints?.y;
      if (xEndpoints) {
        ctx.textAlign = "left";
        ctx.fillText(xEndpoints.negative.toUpperCase(), left, bottom + axisLabelOffset);
        ctx.textAlign = "right";
        ctx.fillText(xEndpoints.positive.toUpperCase(), right, bottom + axisLabelOffset);
      } else if (dataset?.axisLabels?.x) {
        ctx.textAlign = "right";
        ctx.fillText(dataset.axisLabels.x.toUpperCase(), right, bottom + axisLabelOffset);
      }
      if (yEndpoints) {
        ctx.save();
        ctx.translate(left - axisLabelOffset, bottom);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "left";
        ctx.fillText(yEndpoints.negative.toUpperCase(), 0, 0);
        ctx.textAlign = "right";
        ctx.fillText(yEndpoints.positive.toUpperCase(), plotSize, 0);
        ctx.restore();
      } else if (dataset?.axisLabels?.y) {
        ctx.save();
        ctx.translate(left - axisLabelOffset, top);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "right";
        ctx.fillText(dataset.axisLabels.y.toUpperCase(), 0, 0);
        ctx.restore();
      }

      // Slider-only questions still resolve into the same two-dimensional
      // result field. Put each slider title on its corresponding axis instead
      // of repeating its title and explanatory subtitle beside the question.
      const xAxisTitle = dataset?.sliderDescriptions?.[0]?.title;
      const yAxisTitle = dataset?.sliderDescriptions?.[1]?.title;
      ctx.fillStyle = `rgba(255,255,255,${0.88 * fade * introAlpha})`;
      ctx.font = `500 ${axisLabelFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      if (xAxisTitle) {
        ctx.textAlign = "center";
        ctx.fillText(xAxisTitle.toUpperCase(), X(0), bottom + axisLabelOffset);
      }
      if (yAxisTitle) {
        ctx.save();
        ctx.translate(left - axisLabelOffset, Y(0));
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(yAxisTitle.toUpperCase(), 0, 0);
        ctx.restore();
      }

      // Minimal key, placed in the lower-left outer gutter.
      const legendX = clamp(left * 0.16, 22, 54);
      const legendGap = 42;
      const legendY = bottom - clamp(plotSize * 0.095, 60, 84);
      const legendMark = 12;
      ctx.font = `500 ${axisLabelFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = "left";
      ctx.fillStyle = `rgba(255,255,255,${0.96 * fade * introAlpha})`;
      ctx.fillRect(legendX - legendMark / 2, legendY - legendMark / 2, legendMark, legendMark);
      ctx.fillText("PARTICIPANT ANSWER", legendX + 20, legendY + 5);
      ctx.strokeStyle = `rgba(46,132,255,${fade * introAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(legendX - 7, legendY + legendGap - 7); ctx.lineTo(legendX + 7, legendY + legendGap + 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(legendX + 7, legendY + legendGap - 7); ctx.lineTo(legendX - 7, legendY + legendGap + 7); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.96 * fade * introAlpha})`;
      ctx.fillText("K VALUE / MEAN", legendX + 20, legendY + legendGap + 5);

      const visual = visualRef.current;
      if (visual.trail.length > 1) {
        ctx.strokeStyle = `rgba(255,255,255,${0.1 * dataFade})`; ctx.lineWidth = 0.5; ctx.beginPath();
        visual.trail.forEach((p, i) => i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))); ctx.stroke();
      }
      visual.points.forEach((point) => {
        const age = now - point.revealedAt;
        const isSignal = !reducedMotion && state === "playing" && age < 140;
        const size = 8 + point.compressedWeight * 7;
        const bloom = isSignal ? 1 + (1 - age / 140) * 1.6 : 1;
        ctx.fillStyle = isSignal
          ? `rgba(46,132,255,${dataFade})`
          : `rgba(255,255,255,${0.94 * dataFade})`;
        const pointSize = size * bloom;
        ctx.fillRect(
          Math.round(X(point.x) - pointSize / 2),
          Math.round(Y(point.y) - pointSize / 2),
          Math.round(pointSize),
          Math.round(pointSize),
        );
      });
      if (state === "playing" && visual.points.length) {
        const lastPoint = visual.points.at(-1);
        const scanX = lerp(left, right, lastPoint.progress);
        ctx.strokeStyle = `rgba(255,255,255,${0.24 * dataFade})`; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(scanX, top); ctx.lineTo(scanX, bottom); ctx.stroke();
      }
      if (visual.mean) {
        const kx = X(visual.mean.x);
        const ky = Y(visual.mean.y);

        // k is a compact X attached to a full-field blue helper cross.
        ctx.strokeStyle = `rgba(46,132,255,${0.52 * dataFade})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(left, ky); ctx.lineTo(right, ky); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(kx, top); ctx.lineTo(kx, bottom); ctx.stroke();

        const kArm = clamp(plotSize * 0.018, 10, 17);
        ctx.strokeStyle = `rgba(46,132,255,${dataFade})`;
        ctx.lineWidth = 3;
        ctx.lineCap = "square";
        ctx.beginPath(); ctx.moveTo(kx - kArm, ky - kArm); ctx.lineTo(kx + kArm, ky + kArm); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(kx + kArm, ky - kArm); ctx.lineTo(kx - kArm, ky + kArm); ctx.stroke();
        ctx.lineCap = "butt";
        ctx.fillStyle = `rgba(255,255,255,${dataFade})`;
        ctx.fillRect(Math.round(kx - 2), Math.round(ky - 2), 4, 4);
        ctx.fillStyle = `rgba(46,132,255,${0.9 * dataFade})`;
        ctx.font = "500 8px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillText("K", kx + kArm + 7, ky - 6);
      }

      // A live terminal-like receipt in the right gutter. The newest records
      // remain visible as the stream grows; every on-screen dot has a stable ID.
      const gutterWidth = w - right;
      if (gutterWidth > 155 && visual.points.length) {
        const streamLeft = right + clamp(gutterWidth * 0.12, 18, 48);
        const streamRight = w - clamp(gutterWidth * 0.08, 16, 32);
        const lineHeight = 24;
        const streamTop = top + 8;
        const streamBottom = bottom - 8;
        const visibleRows = Math.max(4, Math.floor((streamBottom - streamTop - 70) / lineHeight));
        const firstVisible = Math.max(0, visual.points.length - visibleRows);

        ctx.textAlign = "left";
        ctx.font = "500 16px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = `rgba(46,132,255,${0.92 * dataFade})`;
        ctx.fillText("/ DATA STREAM", streamLeft, streamTop + 15);
        ctx.fillStyle = `rgba(255,255,255,${0.82 * dataFade})`;
        ctx.fillText(`TOTAL PARTICIPANTS ${String(visual.points.length).padStart(3, "0")}`, streamLeft, streamTop + 39);
        ctx.strokeStyle = `rgba(255,255,255,${0.18 * dataFade})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(streamLeft, streamTop + 49); ctx.lineTo(streamRight, streamTop + 49); ctx.stroke();

        visual.points.slice(firstVisible).forEach((point, row) => {
          const absoluteIndex = firstVisible + row;
          const y = streamTop + 70 + row * lineHeight;
          const isLatest = absoluteIndex === visual.points.length - 1;
          const id = String(point.index + 1).padStart(3, "0");
          ctx.font = "500 16px ui-monospace, SFMono-Regular, Menlo, monospace";
          const idLabel = `USER ID ${id}`;
          const idLabelWidth = ctx.measureText(idLabel).width;
          ctx.fillStyle = `rgba(255,255,255,${dataFade})`;
          ctx.fillRect(streamLeft - 3, y - 16, idLabelWidth + 6, 20);
          ctx.fillStyle = `rgba(0,0,0,${dataFade})`;
          ctx.fillText(idLabel, streamLeft, y);
          if (streamRight - streamLeft > 178) {
            ctx.fillStyle = `rgba(255,255,255,${(isLatest ? 0.96 : 0.82) * dataFade})`;
            ctx.font = "500 16px ui-monospace, SFMono-Regular, Menlo, monospace";
            ctx.textAlign = "right";
            ctx.fillText(`${point.x >= 0 ? "+" : ""}${point.x.toFixed(2)}  ${point.y >= 0 ? "+" : ""}${point.y.toFixed(2)}`, streamRight, y);
            ctx.textAlign = "left";
          }
        });
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [dataset, state, visualRef, clearStartedAt, coordinateRevealStartedAt, reducedMotion]);
  return <canvas ref={canvasRef} className="plot" aria-label="Animated scatter plot" />;
}

function FinalVisualization({ datasets }) {
  const mountRef = useRef(null);
  const layerLabelRef = useRef(null);
  const clockLabelRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !datasets.length) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.032);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "final-canvas";
    mount.appendChild(renderer.domElement);

    const world = new THREE.Group();
    scene.add(world);
    const planeSize = 5;
    const layerDepth = 3.1;
    const layers = [];
    const means = [];
    const pointGeometry = new THREE.BoxGeometry(0.075, 0.075, 0.075);

    const lineObject = (positions, color, opacity) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      return new THREE.LineSegments(geometry, material);
    };

    datasets.forEach((dataset, layerIndex) => {
      const layer = new THREE.Group();
      layer.position.z = -layerIndex * layerDepth;
      world.add(layer);

      const backgroundMaterial = new THREE.MeshBasicMaterial({ color: 0x121212, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
      const background = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), backgroundMaterial);
      background.position.z = -0.035;
      layer.add(background);

      const gridPositions = [];
      for (let index = 0; index <= 10; index += 1) {
        const coordinate = -planeSize / 2 + (index / 10) * planeSize;
        gridPositions.push(coordinate, -planeSize / 2, 0, coordinate, planeSize / 2, 0);
        gridPositions.push(-planeSize / 2, coordinate, 0, planeSize / 2, coordinate, 0);
      }
      const grid = lineObject(gridPositions, 0x596168, 0.28);
      layer.add(grid);
      const axes = lineObject([
        -planeSize / 2, 0, 0.01, planeSize / 2, 0, 0.01,
        0, -planeSize / 2, 0.01, 0, planeSize / 2, 0.01,
      ], 0xffffff, 0.72);
      layer.add(axes);

      const edge = 0.27;
      const half = planeSize / 2;
      const cornerPositions = [
        -half, -half + edge, .03, -half, -half, .03, -half, -half, .03, -half + edge, -half, .03,
        half, -half + edge, .03, half, -half, .03, half, -half, .03, half - edge, -half, .03,
        -half, half - edge, .03, -half, half, .03, -half, half, .03, -half + edge, half, .03,
        half, half - edge, .03, half, half, .03, half, half, .03, half - edge, half, .03,
      ];
      const corners = lineObject(cornerPositions, 0xffffff, 0.95);
      layer.add(corners);

      const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f5f2, transparent: true, opacity: 0.94 });
      const points = new THREE.InstancedMesh(pointGeometry, pointMaterial, dataset.points.length);
      const matrix = new THREE.Matrix4();
      dataset.points.forEach((point, pointIndex) => {
        matrix.makeTranslation(clamp(point.x, -1, 1) * half, clamp(point.y, -1, 1) * half, 0.075);
        points.setMatrixAt(pointIndex, matrix);
      });
      points.instanceMatrix.needsUpdate = true;
      layer.add(points);

      const mean = dataset.points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
      mean.x /= dataset.points.length;
      mean.y /= dataset.points.length;
      const meanPosition = new THREE.Vector3(mean.x * half, mean.y * half, layer.position.z + 0.13);
      means.push(meanPosition);
      const kMaterial = new THREE.MeshBasicMaterial({ color: 0x2e84ff, transparent: true, opacity: 1 });
      const kGeometry = new THREE.BoxGeometry(0.42, 0.035, 0.05);
      const firstArm = new THREE.Mesh(kGeometry, kMaterial);
      const secondArm = new THREE.Mesh(kGeometry, kMaterial);
      firstArm.position.set(meanPosition.x, meanPosition.y, 0.13);
      secondArm.position.copy(firstArm.position);
      firstArm.rotation.z = Math.PI / 4;
      secondArm.rotation.z = -Math.PI / 4;
      layer.add(firstArm, secondArm);

      const materials = [backgroundMaterial, grid.material, axes.material, corners.material, pointMaterial, kMaterial];
      materials.forEach((material) => { material.userData.baseOpacity = material.opacity; material.opacity = 0; });
      layer.userData.materials = materials;
      layer.userData.revealAt = layerIndex === 0 ? 0 : 4 + layerIndex * 24;
      layers.push(layer);
    });

    const curve = new THREE.CatmullRomCurve3(means, false, "centripetal", 0.4);
    const curveSamples = curve.getPoints(600);
    const curveGeometry = new THREE.BufferGeometry().setFromPoints(curveSamples);
    curveGeometry.setDrawRange(0, 0);
    const curveMaterial = new THREE.LineBasicMaterial({ color: 0xff2747, transparent: true, opacity: 0.95, depthTest: false });
    const meanSpine = new THREE.Line(curveGeometry, curveMaterial);
    meanSpine.renderOrder = 5;
    world.add(meanSpine);

    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff2747, transparent: true, opacity: 0.95, depthTest: false }));
    pulse.visible = false;
    pulse.renderOrder = 6;
    world.add(pulse);

    const tubeRailMaterial = new THREE.LineBasicMaterial({ color: 0xff2747, transparent: true, opacity: 0, depthWrite: false });
    const railPositions = [];
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      railPositions.push(sx * planeSize / 2, sy * planeSize / 2, 0.02, sx * planeSize / 2, sy * planeSize / 2, -(datasets.length - 1) * layerDepth);
    });
    const railGeometry = new THREE.BufferGeometry();
    railGeometry.setAttribute("position", new THREE.Float32BufferAttribute(railPositions, 3));
    const rails = new THREE.LineSegments(railGeometry, tubeRailMaterial);
    world.add(rails);

    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = [];
    const random = mulberry32(2026);
    for (let index = 0; index < 650; index += 1) {
      dustPositions.push((random() - .5) * 10, (random() - .5) * 7, -random() * (datasets.length * layerDepth + 6));
    }
    dustGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({ color: 0x79818a, size: 0.018, transparent: true, opacity: 0.34, depthWrite: false });
    world.add(new THREE.Points(dustGeometry, dustMaterial));

    const scanMaterial = new THREE.MeshBasicMaterial({ color: 0xff2747, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false });
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(planeSize * 1.04, planeSize * 1.04), scanMaterial);
    world.add(scan);

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointerMove);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    const clock = new THREE.Clock();
    let frameId = 0;
    let lastHudSecond = -1;
    const render = () => {
      const elapsed = clock.getElapsedTime();
      let visibleLayers = 0;
      layers.forEach((layer) => {
        const alpha = clamp((elapsed - layer.userData.revealAt) / 5, 0, 1);
        const eased = alpha * alpha * (3 - 2 * alpha);
        layer.visible = eased > 0;
        if (eased > 0.98) visibleLayers += 1;
        layer.userData.materials.forEach((material) => { material.opacity = material.userData.baseOpacity * eased; });
        layer.scale.setScalar(0.94 + eased * 0.06);
      });

      const connectionProgress = clamp((elapsed - 28) / (24 * Math.max(1, datasets.length - 1)), 0, 1);
      curveGeometry.setDrawRange(0, Math.max(0, Math.floor(curveSamples.length * connectionProgress)));
      tubeRailMaterial.opacity = 0.12 * connectionProgress;
      if (connectionProgress > 0.01) {
        pulse.visible = true;
        pulse.position.copy(curve.getPoint((elapsed * 0.045) % Math.max(0.02, connectionProgress)));
      }
      scan.visible = connectionProgress > 0;
      scan.position.z = -connectionProgress * (datasets.length - 1) * layerDepth + ((Math.sin(elapsed * 0.45) + 1) / 2) * connectionProgress * (datasets.length - 1) * layerDepth;

      let targetZ = 0;
      if (elapsed < 18) {
        camera.position.set(Math.sin(elapsed * .12) * .18, Math.sin(elapsed * .09) * .12, 7.8 - Math.min(elapsed, 12) * .025);
      } else if (elapsed < 34) {
        const turn = THREE.MathUtils.smootherstep(elapsed, 18, 34);
        const angle = turn * 0.82;
        camera.position.set(Math.sin(angle) * 7.9, turn * 2.5, Math.cos(angle) * 7.9);
        targetZ = -0.5 * turn;
      } else {
        const deepest = Math.max(0, Math.min(datasets.length - 1, (elapsed - 4) / 24));
        targetZ = -deepest * layerDepth * 0.5;
        const angle = 0.82 + Math.sin(elapsed * 0.035) * 0.34;
        camera.position.set(Math.sin(angle) * 8.8 + pointer.x * .35, 3.1 - pointer.y * .28, targetZ + Math.cos(angle) * 8.8);
      }
      camera.lookAt(0, 0, targetZ);
      world.rotation.z = Math.sin(elapsed * 0.018) * 0.018;
      renderer.render(scene, camera);

      const second = Math.floor(elapsed);
      if (second !== lastHudSecond) {
        lastHudSecond = second;
        if (layerLabelRef.current) layerLabelRef.current.textContent = `VOLUME ${String(Math.max(1, visibleLayers)).padStart(2, "0")} / ${String(datasets.length).padStart(2, "0")}`;
        if (clockLabelRef.current) clockLabelRef.current.textContent = `${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}`;
      }
      frameId = window.requestAnimationFrame(render);
    };
    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", onPointerMove);
      resizeObserver.disconnect();
      const geometries = new Set();
      const materials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [datasets]);

  return <main className="final-view">
    <style>{FINAL_CSS}</style>
    <div ref={mountRef} className="final-stage" aria-label="Three-dimensional temporal response volume" />
    <header className="final-header">
      <div><span className="final-signal" /> ALPHA INNOVATION LIVE 2026</div>
      <span>FINAL / TEMPORAL RESPONSE VOLUME</span>
    </header>
    <aside className="final-readout">
      <span ref={layerLabelRef}>VOLUME 01 / {String(datasets.length).padStart(2, "0")}</span>
      <span ref={clockLabelRef}>00:00</span>
    </aside>
    <div className="final-legend"><span><i className="legend-white" /> PARTICIPANT</span><span><i className="legend-blue" /> K / MEAN</span><span><i className="legend-red" /> TEMPORAL SPINE</span></div>
  </main>;
}

function SessionApp({ initialSource, sessionTitle }) {
  const [source, setSource] = useState(initialSource);
  const [datasetIndex, setDatasetIndex] = useState(0);
  const [dataset, setDataset] = useState(() => validateDataset(initialSource[0]));
  const [state, setState] = useState("question");
  const [message, setMessage] = useState("");
  const [targetSeconds, setTargetSeconds] = useState(TARGET_SECONDS);
  const [paste, setPaste] = useState("");
  const [sessionStarted, setSessionStarted] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [clearStartedAt, setClearStartedAt] = useState(0);
  const [coordinateRevealStartedAt, setCoordinateRevealStartedAt] = useState(0);
  const [runMeta, setRunMeta] = useState(null);
  const reducedMotion = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);
  const visualRef = useRef({ points: [], trail: [], mean: null, playhead: null });
  const eventIdsRef = useRef([]);
  const transitionEchoRef = useRef(null);
  const strudelReadyRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const stateRef = useRef(state);
  const lastKeyRef = useRef(0);
  const prefetchedRef = useRef(new Map());
  const transitionBusyRef = useRef(false);
  stateRef.current = state;

  const clearSchedule = useCallback(() => {
    const transport = Tone.getTransport?.() ?? Tone.Transport;
    eventIdsRef.current.forEach((id) => transport.clear(id));
    eventIdsRef.current = [];
    transport.stop();
    transport.cancel(0);
    transport.seconds = 0;
  }, []);

  const stopPlayback = useCallback(() => {
    clearSchedule();
    if (strudelReadyRef.current) hush();
  }, [clearSchedule]);

  const loadDataset = useCallback(async (index) => {
    const raw = prefetchedRef.current.get(index) ?? await fakeFetchDataset(index, source);
    prefetchedRef.current.delete(index);
    const candidate = validateDataset(raw);
    if (!candidate) return null;
    setMessage(candidate.dropped ? `${candidate.dropped} invalid point${candidate.dropped === 1 ? " was" : "s were"} dropped.` : "");
    return candidate;
  }, [source]);

  const beginRun = useCallback(async (selectedDataset = dataset, selectedIndex = datasetIndex, requireQuestionState = true) => {
    if (!selectedDataset || (requireQuestionState && stateRef.current !== "question")) return;
    const run = prepareRun(selectedDataset, targetSeconds);
    const startDelay = playbackStartedRef.current ? LOOKAHEAD : FIRST_RUN_LOOKAHEAD;
    let strudelContext;
    let masterGain;
    try {
      setMessage("Starting Strudel…");
      // Resume both contexts synchronously while the Space key gesture is
      // still active. Waiting first causes browsers to reject the unlock.
      const toneResume = Tone.start();
      strudelContext = getAudioContext();
      const strudelResume = strudelContext.resume();
      if (!strudelReadyRef.current) {
        await Promise.all([toneResume, strudelResume, warmAudioEngine()]);
        strudelReadyRef.current = true;
      } else {
        await Promise.all([toneResume, strudelResume]);
      }
      if (transitionEchoRef.current) {
        const previousEcho = transitionEchoRef.current;
        previousEcho.delay.feedback.rampTo(0, 0.08);
        previousEcho.gain.gain.rampTo(0, 0.12);
        transitionEchoRef.current = null;
        window.setTimeout(() => {
          Object.values(previousEcho).forEach((node) => node?.dispose?.());
        }, 160);
      }
      const gain = new Tone.Gain(0.06).toDestination();
      const delay = new Tone.FeedbackDelay({ delayTime: 0.44, feedback: 0.48, wet: 1 }).connect(gain);
      const filter = new Tone.Filter(1250, "lowpass");
      filter.connect(gain);
      filter.connect(delay);
      const synth = new Tone.Synth({
        oscillator: { type: "sine" },
        envelope: { attack: 0.025, decay: 0.18, sustain: 0, release: 0.38 },
      }).connect(filter);
      transitionEchoRef.current = { synth, filter, delay, gain };
      masterGain = getSuperdoughAudioController().output.destinationGain.gain;
      const now = strudelContext.currentTime;
      masterGain.cancelScheduledValues(now);
      masterGain.setValueAtTime(0, now);
    } catch (error) {
      setMessage(`Could not start Strudel: ${error.message}`);
      return;
    }

    clearSchedule();
    visualRef.current = { points: [], trail: [], mean: null, runDuration: run.duration };
    setRunMeta({ regime: run.regime, count: run.events.length, duration: targetSeconds, engine: `A-linked movement ${String(selectedIndex + 1).padStart(2, "0")}` });
    setSessionStarted(true);

    try {
      // Start the composition muted. It is revealed at the same lookahead used
      // for the first scheduled point, after every dependency is ready.
      await evaluate(`${STRUDEL_BACKGROUND}\n${buildForwardComposition(run, selectedIndex)}`);
      const audioNow = strudelContext.currentTime;
      masterGain.cancelScheduledValues(audioNow);
      masterGain.setValueAtTime(0, audioNow);
      masterGain.setValueAtTime(1, audioNow + startDelay);
      setMessage("");
    } catch (error) {
      hush();
      setMessage(`Could not start Strudel: ${error.message}`);
      setState("question");
      return;
    }

    setState("playing");

    const transport = Tone.getTransport?.() ?? Tone.Transport;
    const draw = Tone.getDraw?.() ?? Tone.Draw;
    const startAt = startDelay;
    transport.bpm.value = 84;

    const bridgeStartId = transport.schedule((time) => {
      const bridge = transitionEchoRef.current;
      if (!bridge) return;
      bridge.synth.triggerAttackRelease("A4", 0.28, time, 0.42);
    }, startAt);
    eventIdsRef.current.push(bridgeStartId);

    run.events.forEach((event) => {
      const id = transport.schedule((time) => {
        draw.schedule(() => {
          const now = performance.now();
          visualRef.current.points.push({ ...event, revealedAt: now });
          visualRef.current.mean = event.mean;
          visualRef.current.trail.push(event.mean);
        }, time);
      }, startAt + event.time);
      eventIdsRef.current.push(id);
    });
    const lastPointTime = run.events.at(-1)?.time ?? run.duration;
    const completeId = transport.schedule((time) => {
      // Every movement resolves to a short A impulse. Its feedback repeats
      // decay across the inter-question field and overlap the next opening A.
      const bridge = transitionEchoRef.current;
      if (bridge) {
        bridge.synth.triggerAttackRelease("A4", 0.32, time, 0.4);
      }
      draw.schedule(() => {
        // The last data point is always the musical endpoint. Keep only a
        // near-instant click-safe release, triggered with the visual event.
        try {
          const strudelContext = getAudioContext();
          const masterGain = getSuperdoughAudioController().output.destinationGain.gain;
          const fadeAt = strudelContext.currentTime;
          masterGain.cancelScheduledValues(fadeAt);
          masterGain.setValueAtTime(masterGain.value, fadeAt);
          masterGain.linearRampToValueAtTime(0.0001, fadeAt + FINAL_RELEASE_SECONDS);
          window.setTimeout(() => hush(), FINAL_RELEASE_SECONDS * 1000 + 20);
        } catch {
          hush();
        }
        setState("complete");
      }, time);
    }, startAt + lastPointTime);
    eventIdsRef.current.push(completeId);
    transport.start();
    playbackStartedRef.current = true;

    const next = selectedIndex + 1;
    if (next < source.length && !prefetchedRef.current.has(next)) {
      fakeFetchDataset(next, source).then((value) => prefetchedRef.current.set(next, value));
    }
  }, [clearSchedule, dataset, datasetIndex, source, targetSeconds]);

  const handleAdvance = useCallback(async () => {
    if (transitionBusyRef.current) return;
    const current = stateRef.current;
    if (["opening", "playing", "transforming", "between", "question-transition"].includes(current)) return;
    transitionBusyRef.current = true;
    setActionPending(true);
    try {
      if (current === "question") {
        await beginRun();
      } else if (current === "complete") {
        if (datasetIndex >= source.length - 1) {
          stopPlayback();
          return;
        }
        stopPlayback();
        setClearStartedAt(performance.now());
        setState("transforming");
        await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 0 : DATA_CLEAR_MS));
        visualRef.current = { points: [], trail: [], mean: null, runDuration: null };
        const nextIndex = datasetIndex + 1;
        const next = await loadDataset(nextIndex);
        if (!next) {
          setState("complete");
          return;
        }
        setDatasetIndex(nextIndex);
        setDataset(next);
        setRunMeta(null);
        setState("question-transition");
        await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 0 : NEXT_QUESTION_BLEND_MS));
        setState("question");
      }
    } finally {
      transitionBusyRef.current = false;
      setActionPending(false);
    }
  }, [beginRun, datasetIndex, loadDataset, reducedMotion, source.length, stopPlayback]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        const now = performance.now();
        if (now - lastKeyRef.current < 300) return;
        lastKeyRef.current = now;
        void handleAdvance();
      } else if (event.key === "Escape" && stateRef.current === "playing") {
        stopPlayback();
        visualRef.current = { points: [], trail: [], mean: null, runDuration: null };
        setRunMeta(null);
        setState("question");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleAdvance, stopPlayback]);

  useEffect(() => () => {
    stopPlayback();
    if (transitionEchoRef.current) {
      Object.values(transitionEchoRef.current).forEach((node) => node?.dispose?.());
      transitionEchoRef.current = null;
    }
  }, [stopPlayback]);

  const importJson = () => {
    try {
      const parsed = JSON.parse(paste);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const parsedDatasets = list.map(validateDataset).filter(Boolean);
      const valid = parsedDatasets.filter((item) => item.points.length >= MIN_POINTS);
      if (!valid.length) throw new Error(`No dataset has at least ${MIN_POINTS} usable points`);
      const skipped = parsedDatasets.length - valid.length;
      setSource(valid);
      setDatasetIndex(0);
      setDataset(valid[0]);
      setMessage(`${valid.length} dataset${valid.length === 1 ? "" : "s"} ready${skipped ? `; ${skipped} too-small dataset skipped` : ""}.`);
      setPaste("");
      prefetchedRef.current.clear();
    } catch (error) {
      setMessage(`Could not load JSON: ${error.message}`);
    }
  };

  const actionLabel = state === "question"
    ? (sessionStarted ? `Start slide ${String(datasetIndex + 1).padStart(2, "0")}` : "Start presentation")
    : state === "complete"
      ? (datasetIndex === source.length - 1 ? "" : "Next slide")
      : "";

  return <main className={`app state-${state}`}>
    <style>{CSS}</style>
    <div className="wash" />
    <header className="brand"><span className="brand-mark" /> ALPHA INNOVATION LIVE 2026 <span className="counter">{`${String(datasetIndex + 1).padStart(2, "0")} / ${String(source.length).padStart(2, "0")}`}</span></header>
    <section className="stage">
      <>
        <div className="question-wrap">
          <p className="eyebrow">{dataset.sessionTitle ?? sessionTitle} – Question {String(dataset.position ?? datasetIndex + 1).padStart(2, "0")}</p>
          <h1>{getQuestionTranslations(dataset).map(([language, question]) => <span className="translation" key={language}><b>{language}</b><span>{question}</span></span>)}</h1>
        </div>
        <Plot dataset={dataset} state={state} visualRef={visualRef} clearStartedAt={clearStartedAt} coordinateRevealStartedAt={coordinateRevealStartedAt} reducedMotion={reducedMotion} />
      </>
    </section>
    {actionLabel && <footer>
      <span className="status">{message || "Manual presentation control"}</span>
      <button className="presentation-action" type="button" disabled={actionPending} onClick={() => void handleAdvance()}>
        <span>{actionPending ? "Starting…" : actionLabel}</span>
        <kbd>Space</kbd>
      </button>
    </footer>}
  </main>;
}

export default function App() {
  const [token, setToken] = useState("");
  const [presentation, setPresentation] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const connect = async (event) => {
    event.preventDefault();
    if (!token.trim() || loading) return;
    setLoading(true);
    setError("");
    const audioWarmup = warmAudioEngine().catch(() => undefined);
    try {
      const payload = await fetchPresentations(token.trim());
      await audioWarmup;
      const datasets = payload.flatMap(presentationToDatasets).map(validateDataset).filter(Boolean);
      const slides = selectPresentationSlides(datasets);
      if (!slides) throw new Error(`The presentation API returned only ${datasets.length} stored question${datasets.length === 1 ? "" : "s"}; three are required.`);
      setPresentation({ title: "All sessions", datasets: slides });
      setToken("");
    } catch (connectionError) {
      setError(connectionError.message);
    } finally {
      setLoading(false);
    }
  };

  if (!presentation) {
    return <main className="access-screen">
      <style>{ACCESS_CSS}</style>
      <form className="access-panel" onSubmit={connect}>
        <span className="access-kicker"><i /> ALPHA INNOVATION LIVE 2026</span>
        <h1>Presentation access</h1>
        <p>Enter the master organizer keyword to load every session's anonymized presentation data. Sessions do not need to be open.</p>
        <label>Master keyword<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" autoFocus /></label>
        <button type="submit" disabled={loading}>{loading ? "Loading data…" : "Load all presentations"}</button>
        {error && <output>{error}</output>}
      </form>
    </main>;
  }

  if (window.location.pathname.replace(/\/+$/, "") === "/final") {
    return <FinalVisualization datasets={presentation.datasets} />;
  }
  return <SessionApp initialSource={presentation.datasets} sessionTitle={presentation.title} />;
}

const ACCESS_CSS = String.raw`
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
  :root { color-scheme: dark; background: #000; color: #fff; font-family: "DM Mono", monospace; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #000; }
  .access-screen { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #000; }
  .access-panel { width: min(520px, 100%); display: grid; gap: 20px; }
  .access-kicker { display: flex; align-items: center; gap: 10px; font-size: 11px; letter-spacing: .14em; }
  .access-kicker i { width: 8px; height: 8px; border-radius: 50%; background: #2e84ff; box-shadow: 0 0 14px #2e84ff; }
  .access-panel h1 { margin: 18px 0 0; font-size: clamp(34px, 7vw, 72px); font-weight: 300; letter-spacing: -.06em; }
  .access-panel p { margin: 0; color: #999; font-size: 12px; line-height: 1.7; }
  .access-panel label { display: grid; gap: 8px; color: #2e84ff; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
  .access-panel input { width: 100%; padding: 14px; border: 1px solid #555; border-radius: 0; background: #121212; color: #fff; font: 14px "DM Mono", monospace; outline: none; }
  .access-panel input:focus { border-color: #2e84ff; }
  .access-panel button { justify-self: start; padding: 11px 15px; border: 0; border-radius: 0; background: #fff; color: #000; font: 500 10px "DM Mono", monospace; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; }
  .access-panel button:disabled { opacity: .45; cursor: wait; }
  .access-panel output { color: #ff5871; font-size: 11px; line-height: 1.5; }
`;

const FINAL_CSS = String.raw`
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
  :root { color-scheme: dark; background: #000; color: #fff; font-family: "DM Mono", monospace; }
  * { box-sizing: border-box; }
  html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #000; }
  .final-view { position: fixed; inset: 0; overflow: hidden; background: #000; }
  .final-stage { position: absolute; inset: 0; }
  .final-canvas { display: block; width: 100%; height: 100%; }
  .final-header { position: absolute; z-index: 4; top: 22px; left: 24px; right: 24px; display: flex; justify-content: space-between; align-items: center; color: rgba(255,255,255,.9); font: 500 11px "DM Mono", monospace; letter-spacing: .15em; text-transform: uppercase; pointer-events: none; }
  .final-header > div { display: flex; align-items: center; gap: 11px; }
  .final-header > span { color: rgba(255,255,255,.38); }
  .final-signal { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ff2747; box-shadow: 0 0 14px rgba(255,39,71,.72); animation: final-pulse 1.6s ease-in-out infinite; }
  .final-readout { position: absolute; z-index: 4; right: 24px; bottom: 23px; display: flex; gap: 20px; color: rgba(255,255,255,.72); font: 500 10px "DM Mono", monospace; letter-spacing: .14em; pointer-events: none; }
  .final-readout span:last-child { min-width: 48px; color: #ff2747; }
  .final-legend { position: absolute; z-index: 4; left: 24px; bottom: 22px; display: flex; gap: 22px; color: rgba(255,255,255,.58); font: 500 9px "DM Mono", monospace; letter-spacing: .1em; pointer-events: none; }
  .final-legend span { display: flex; align-items: center; gap: 8px; }
  .final-legend i { display: inline-block; width: 9px; height: 9px; }
  .legend-white { background: #f5f5f2; }
  .legend-blue { background: #2e84ff; transform: rotate(45deg); }
  .legend-red { width: 17px !important; height: 2px !important; background: #ff2747; box-shadow: 0 0 8px rgba(255,39,71,.65); }
  @keyframes final-pulse { 50% { opacity: .42; transform: scale(.72); } }
  @media (max-width: 700px) {
    .final-header { top: 15px; left: 15px; right: 15px; font-size: 8px; }
    .final-header > span { display: none; }
    .final-legend { left: 15px; bottom: 16px; flex-direction: column; gap: 7px; font-size: 7px; }
    .final-readout { right: 15px; bottom: 16px; font-size: 8px; }
  }
  @media (prefers-reduced-motion: reduce) { .final-signal { animation: none; } }
`;

const CSS = String.raw`
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
  :root { color-scheme: dark; font-family: "DM Mono", monospace; background: #000; color: #fff; }
  * { box-sizing: border-box; }
  body { margin: 0; overflow: hidden; background: #000; }
  button, input, textarea { font: inherit; }
  .app { min-height: 100vh; position: relative; overflow: hidden; background: #000; }
  .wash { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, transparent 0 7px, rgba(255,255,255,.012) 7px 8px); }
  .brand { position: absolute; z-index: 5; top: 20px; left: 22px; right: 22px; display: flex; align-items: center; gap: 12px; color: #fff; text-transform: uppercase; letter-spacing: .12em; font: 500 20px "DM Mono", monospace; }
  .brand-mark { width: 8px; height: 8px; border-radius: 50%; background: #2e84ff; animation: brand-pulse 1.8s ease-in-out infinite; }
  @keyframes brand-pulse {
    0%, 100% { opacity: .55; transform: scale(.82); box-shadow: 0 0 0 0 rgba(46,132,255,0); }
    50% { opacity: 1; transform: scale(1.18); box-shadow: 0 0 12px 2px rgba(46,132,255,.58); }
  }
  .counter { margin-left: auto; color: #858585; }
  .stage { height: 100vh; position: relative; display: grid; place-items: center; }
  .question-wrap { z-index: 2; position: absolute; width: min(860px, 82vw); text-align: left; transition: top 495ms linear, opacity 264ms linear; }
  .question-wrap h1 { margin: 10px 0; font-weight: 300; font-size: clamp(29px, 4.4vw, 62px); line-height: 1.04; letter-spacing: -.055em; text-wrap: balance; }
  .translation { display: grid; grid-template-columns: 2.2em 1fr; gap: .45em; margin: 1em 0; }
  .translation b { align-self: center; justify-self: start; padding: .35em .45em; color: #000; background: #fff; font: 500 clamp(8px, .7vw, 11px) "DM Mono", monospace; letter-spacing: .14em; }
  .eyebrow { margin: 0; color: #2e84ff; text-transform: uppercase; letter-spacing: .2em; font: 400 8px "DM Mono", monospace; }
  .plot { position: absolute; inset: 0; width: 100vw; height: 100vh; opacity: 0; transition: opacity 242ms linear; }
  .state-question .question-wrap, .state-question-transition .question-wrap, .state-opening .question-wrap, .state-playing .question-wrap, .state-complete .question-wrap, .state-transforming .question-wrap { top: 50%; left: 22px; width: calc(25vw - 52px); transform: translateY(-50%); }
  .state-opening .question-wrap { animation: side-question-in 770ms ease-out both; }
  @keyframes side-question-in {
    from { opacity: 0; transform: translate(-12px, -50%); }
    to { opacity: 1; transform: translate(0, -50%); }
  }
  .state-question .question-wrap h1, .state-question-transition .question-wrap h1, .state-opening .question-wrap h1, .state-playing .question-wrap h1, .state-complete .question-wrap h1, .state-transforming .question-wrap h1 { margin: 8px 0 0; font-size: 20px; line-height: 1.45; font-weight: 400; letter-spacing: -.025em; text-transform: uppercase; }
  .state-question .question-wrap .eyebrow, .state-question-transition .question-wrap .eyebrow, .state-opening .question-wrap .eyebrow, .state-playing .question-wrap .eyebrow, .state-complete .question-wrap .eyebrow, .state-transforming .question-wrap .eyebrow { display: block; font-size: 14px; font-weight: 500; }
  .state-question .plot, .state-opening .plot, .state-playing .plot, .state-complete .plot { opacity: 1; }
  .state-finished .plot { opacity: 1; }
  .state-finished .question-wrap { display: none; }
  .state-question-transition .question-wrap { z-index: 3; animation: next-question-in 1320ms ease-out both; }
  .state-question-transition .plot, .state-transforming .plot, .state-between .plot { opacity: 1; }
  .state-transforming .question-wrap { visibility: hidden; opacity: 0; animation: none; pointer-events: none; }
  .state-between .question-wrap { visibility: hidden; opacity: 0; pointer-events: none; }
  @keyframes next-question-in {
    0%, 16% { opacity: 0; }
    100% { opacity: 1; }
  }
  .state-cleared .question-wrap { opacity: 0; }
  .state-cleared .plot { opacity: .6; }
  footer { position: absolute; z-index: 6; left: 22px; right: 22px; bottom: 18px; min-height: 28px; display: flex; align-items: center; border-top: 1px solid #222; padding-top: 8px; }
  .status { color: #777; font: 300 8px "DM Mono", monospace; letter-spacing: .07em; text-transform: uppercase; }
  .presentation-action { margin-left: auto; display: flex; align-items: center; gap: 12px; border: 0; padding: 0; background: transparent; color: #fff; cursor: pointer; font: 500 10px "DM Mono", monospace; text-transform: uppercase; letter-spacing: .12em; }
  .presentation-action:hover span, .presentation-action:focus-visible span { color: #2e84ff; }
  .presentation-action:focus-visible { outline: 1px solid #2e84ff; outline-offset: 7px; }
  .presentation-action:disabled { opacity: .5; cursor: wait; }
  kbd { min-width: 48px; padding: 5px 8px; border: 1px solid #fff; border-radius: 0; background: #000; color: #fff; text-align: center; font: 400 8px "DM Mono", monospace; text-transform: uppercase; letter-spacing: .12em; }
  .setup { position: absolute; z-index: 10; top: 46px; right: 22px; width: min(286px, calc(100vw - 44px)); color: #aaa; }
  .setup details { border: 1px solid #333; border-radius: 0; background: #000; }
  .setup summary { cursor: pointer; padding: 10px 11px; color: #fff; font: 400 8px "DM Mono", monospace; text-transform: uppercase; letter-spacing: .16em; }
  .controls { display: grid; gap: 12px; padding: 10px 11px 12px; border-top: 1px solid #333; }
  .controls label { display: grid; grid-template-columns: 1fr auto; gap: 6px; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
  .controls input, .controls textarea { grid-column: 1 / -1; accent-color: #2e84ff; }
  .controls textarea { min-height: 70px; resize: vertical; color: #fff; background: #050505; border: 1px solid #444; border-radius: 0; padding: 7px; font: 8px "DM Mono", monospace; }
  .controls button { justify-self: start; border: 1px solid #fff; border-radius: 0; padding: 6px 9px; color: #000; background: #fff; cursor: pointer; font-size: 8px; text-transform: uppercase; letter-spacing: .1em; }
  .controls button:hover { color: #fff; background: #2e84ff; border-color: #2e84ff; }
  .credit { margin: -2px 0 0; color: #666; font: 8px/1.5 "DM Mono", monospace; text-transform: uppercase; }
  @media (max-width: 700px) {
    .brand { left: 14px; right: 14px; }
    .setup { right: 14px; }
    .plot { width: 100vw; height: 100vh; }
    footer { left: 14px; right: 14px; }
    .question-wrap { width: 88vw; }
    .state-question .question-wrap, .state-question-transition .question-wrap, .state-opening .question-wrap, .state-playing .question-wrap, .state-complete .question-wrap, .state-transforming .question-wrap { top: 50%; left: 14px; width: 42vw; transform: translateY(-50%); }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; } }
`;
