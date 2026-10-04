// AudioFacade (IF-5): tiny synthesized WebAudio tones, so games ship no audio files.
// Plays nothing when sound effects are off. Music has a stored toggle but no tracks yet.
import type { AudioFacade, Sfx } from "@itg/game-sdk";

type Tone = { freq: number; to?: number; ms: number; type: OscillatorType };

const TONES: Record<Sfx, Tone[]> = {
  tap: [{ freq: 660, ms: 40, type: "sine" }],
  move: [{ freq: 440, to: 520, ms: 70, type: "triangle" }],
  pop: [{ freq: 900, to: 300, ms: 80, type: "sine" }],
  success: [
    { freq: 523, ms: 90, type: "triangle" },
    { freq: 784, ms: 140, type: "triangle" },
  ],
  fail: [{ freq: 220, to: 150, ms: 200, type: "sawtooth" }],
  win: [
    { freq: 523, ms: 100, type: "triangle" },
    { freq: 659, ms: 100, type: "triangle" },
    { freq: 784, ms: 220, type: "triangle" },
  ],
};

let shared: AudioContext | null = null;

function context(): AudioContext | null {
  if (shared) return shared;
  const Ctor = globalThis.AudioContext;
  if (!Ctor) return null;
  try {
    shared = new Ctor();
  } catch {
    return null;
  }
  return shared;
}

export function createAudio(soundOn: () => boolean): AudioFacade {
  return {
    play(sfx) {
      if (!soundOn()) return;
      const ac = context();
      if (!ac) return;
      if (ac.state === "suspended") void ac.resume().catch(() => undefined);
      let t = ac.currentTime;
      for (const tone of TONES[sfx]) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = tone.type;
        osc.frequency.setValueAtTime(tone.freq, t);
        if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, t + tone.ms / 1000);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + tone.ms / 1000);
        osc.connect(gain).connect(ac.destination);
        osc.start(t);
        osc.stop(t + tone.ms / 1000 + 0.02);
        t += tone.ms / 1000;
      }
    },
  };
}
