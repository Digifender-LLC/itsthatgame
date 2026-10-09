// AudioFacade (IF-5): synthesized WebAudio effects, so games ship no audio files (D13).
// Each effect is a few layered voices (oscillator or noise) with an attack/decay envelope
// and an optional filter sweep, mixed through a compressor so stacked sounds don't clip.
// Plays nothing when sound effects are off.
import type { AudioFacade, Sfx, SfxOptions } from "@itg/game-sdk";

export interface Voice {
  /** Oscillator wave, or "noise" for a filtered white-noise burst. */
  type: OscillatorType | "noise";
  freq: number;
  /** Pitch at the end of the voice (exponential glide). */
  to?: number;
  /** Start offset and length in ms. */
  at?: number;
  ms: number;
  /** Peak gain, default 0.18. */
  gain?: number;
  /** Attack in ms, default 4. */
  attack?: number;
  /** Optional low-pass (or band-pass for noise) filter frequency. */
  filter?: number;
}

export const VOICES: Record<Sfx, Voice[]> = {
  tap: [{ type: "sine", freq: 880, to: 660, ms: 45, gain: 0.14 }],
  select: [
    { type: "triangle", freq: 620, to: 880, ms: 70, gain: 0.16 },
    { type: "sine", freq: 1240, ms: 40, gain: 0.05, at: 10 },
  ],
  move: [
    { type: "triangle", freq: 420, to: 560, ms: 80, gain: 0.16 },
    { type: "noise", freq: 2400, ms: 50, gain: 0.04, filter: 2400 },
  ],
  drop: [
    { type: "sine", freq: 300, to: 120, ms: 110, gain: 0.26 },
    { type: "noise", freq: 900, ms: 60, gain: 0.08, filter: 900 },
  ],
  pop: [
    { type: "sine", freq: 1100, to: 380, ms: 90, gain: 0.2 },
    { type: "noise", freq: 3000, ms: 30, gain: 0.05, filter: 3000 },
  ],
  bump: [
    { type: "square", freq: 140, to: 90, ms: 90, gain: 0.08, filter: 700 },
    { type: "sine", freq: 110, ms: 90, gain: 0.14 },
  ],
  whoosh: [{ type: "noise", freq: 600, to: 2600, ms: 180, gain: 0.1, attack: 60, filter: 1200 }],
  success: [
    { type: "triangle", freq: 659, ms: 90, gain: 0.16 },
    { type: "triangle", freq: 988, ms: 160, gain: 0.16, at: 80 },
  ],
  combo: [
    { type: "triangle", freq: 784, ms: 70, gain: 0.15 },
    { type: "triangle", freq: 1175, ms: 120, gain: 0.13, at: 55 },
    { type: "sine", freq: 2350, ms: 90, gain: 0.04, at: 55 },
  ],
  perfect: [
    { type: "triangle", freq: 1047, ms: 80, gain: 0.15 },
    { type: "triangle", freq: 1319, ms: 80, gain: 0.15, at: 60 },
    { type: "triangle", freq: 1568, ms: 200, gain: 0.15, at: 120 },
    { type: "sine", freq: 3136, ms: 160, gain: 0.04, at: 120 },
  ],
  star: [
    { type: "triangle", freq: 1319, ms: 140, gain: 0.16 },
    { type: "sine", freq: 2637, ms: 220, gain: 0.06, at: 20 },
  ],
  unlock: [
    { type: "triangle", freq: 523, ms: 90, gain: 0.15 },
    { type: "triangle", freq: 784, ms: 90, gain: 0.15, at: 80 },
    { type: "triangle", freq: 1047, ms: 260, gain: 0.15, at: 160 },
  ],
  fail: [
    { type: "triangle", freq: 330, to: 220, ms: 180, gain: 0.16 },
    { type: "triangle", freq: 262, to: 165, ms: 260, gain: 0.14, at: 150 },
  ],
  win: [
    { type: "triangle", freq: 523, ms: 110, gain: 0.15 },
    { type: "triangle", freq: 659, ms: 110, gain: 0.15, at: 100 },
    { type: "triangle", freq: 784, ms: 110, gain: 0.15, at: 200 },
    { type: "triangle", freq: 1047, ms: 380, gain: 0.16, at: 300 },
    { type: "sine", freq: 2093, ms: 300, gain: 0.05, at: 300 },
  ],
};

let shared: { ac: AudioContext; out: AudioNode; noise: AudioBuffer } | null = null;

function engine(): typeof shared {
  if (shared) return shared;
  const Ctor = globalThis.AudioContext;
  if (!Ctor) return null;
  try {
    const ac = new Ctor();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    const master = ac.createGain();
    master.gain.value = 0.9;
    comp.connect(master).connect(ac.destination);
    const noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    shared = { ac, out: comp, noise };
  } catch {
    return null;
  }
  return shared;
}

/** Caps simultaneous voices so rapid taps can't pile up hundreds of nodes. */
const MAX_LIVE = 24;
let live = 0;

export function createAudio(soundOn: () => boolean): AudioFacade {
  return {
    play(sfx: Sfx, opts: SfxOptions = {}) {
      if (!soundOn()) return;
      const voices = VOICES[sfx];
      if (!voices) return;
      const e = engine();
      if (!e) return;
      const { ac, out, noise } = e;
      if (ac.state === "suspended") void ac.resume().catch(() => undefined);
      if (live > MAX_LIVE) return;
      const pitch = Math.max(0.5, Math.min(3, opts.pitch ?? 1));
      const vol = Math.max(0, Math.min(1, opts.volume ?? 1));
      const now = ac.currentTime + 0.005;
      for (const v of voices) {
        const t0 = now + (v.at ?? 0) / 1000;
        const dur = v.ms / 1000;
        const peak = (v.gain ?? 0.18) * vol;
        const atk = Math.min(dur * 0.5, (v.attack ?? 4) / 1000);
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        let src: AudioScheduledSourceNode;
        let head: AudioNode;
        if (v.type === "noise") {
          const n = ac.createBufferSource();
          n.buffer = noise;
          const f = ac.createBiquadFilter();
          f.type = "bandpass";
          f.Q.value = 1.2;
          f.frequency.setValueAtTime(v.freq * pitch, t0);
          if (v.to) f.frequency.exponentialRampToValueAtTime(v.to * pitch, t0 + dur);
          n.connect(f);
          src = n;
          head = f;
        } else {
          const osc = ac.createOscillator();
          osc.type = v.type;
          osc.frequency.setValueAtTime(v.freq * pitch, t0);
          if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to * pitch, t0 + dur);
          src = osc;
          head = osc;
          if (v.filter) {
            const f = ac.createBiquadFilter();
            f.type = "lowpass";
            f.frequency.value = v.filter;
            osc.connect(f);
            head = f;
          }
        }
        head.connect(gain).connect(out);
        live++;
        src.onended = () => {
          live--;
          gain.disconnect();
        };
        src.start(t0);
        src.stop(t0 + dur + 0.03);
      }
    },
  };
}
