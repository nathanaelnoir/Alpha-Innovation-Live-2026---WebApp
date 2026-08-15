import { mkdirSync, writeFileSync } from "node:fs";

const sampleRate = 44100;
const seconds = 1.8;
const frames = Math.floor(sampleRate * seconds);
const rootMidi = 61; // C#4
const scale = [0, 2, 3, 5, 7, 8, 10];
const names = ["cs-minor", "ds-diminished", "e-major", "fs-minor", "gs-minor", "a-major", "b-major"];
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

mkdirSync("public/audio/chords", { recursive: true });

for (let degree = 0; degree < scale.length; degree += 1) {
  const chordMidi = [0, 2, 4].map((step) => {
    const scaleDegree = degree + step;
    return rootMidi + scale[scaleDegree % scale.length] + Math.floor(scaleDegree / scale.length) * 12;
  });
  const samples = new Float32Array(frames);
  let peak = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / sampleRate;
    const attack = Math.min(1, time / 0.055);
    const tail = Math.min(1, (seconds - time) / 0.22);
    const envelope = attack * Math.exp(-time * 1.38) * tail;
    let value = 0;
    chordMidi.forEach((midi, noteIndex) => {
      const hz = frequency(midi);
      const phase = noteIndex * 0.71;
      value += Math.sin(2 * Math.PI * hz * time + phase) * 0.48;
      value += Math.sin(2 * Math.PI * hz * 2 * time + phase * 1.3) * 0.13;
      value += Math.sin(2 * Math.PI * hz * 3 * time + phase * 0.6) * 0.045;
      value += Math.sin(2 * Math.PI * hz * 1.003 * time + phase) * 0.1;
    });
    samples[frame] = value * envelope;
    peak = Math.max(peak, Math.abs(samples[frame]));
  }

  const bytesPerSample = 2;
  const dataSize = frames * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * bytesPerSample, 28); wav.writeUInt16LE(bytesPerSample, 32);
  wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(dataSize, 40);
  const gain = 0.72 / Math.max(peak, 1e-6);
  for (let frame = 0; frame < frames; frame += 1) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[frame] * gain)) * 32767), 44 + frame * 2);
  }
  writeFileSync(`public/audio/chords/${names[degree]}.wav`, wav);
}
