// Procedural Web Audio API sound synthesizer & Haptics - 100% offline and asset-free
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let soundEnabled = true;
let currentVolume = 0.7;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(soundEnabled ? currentVolume : 0, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function triggerHaptic(pattern: number | number[] = 15) {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
}

export function setSoundVolume(volume: number) {
  currentVolume = Math.max(0, Math.min(1, volume));
  if (audioCtx && masterGain) {
    masterGain.gain.setValueAtTime(soundEnabled ? currentVolume : 0, audioCtx.currentTime);
  }
}

export function toggleSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  if (audioCtx && masterGain) {
    masterGain.gain.setValueAtTime(soundEnabled ? currentVolume : 0, audioCtx.currentTime);
  }
}

// Subtle lift from board (wood/felt friction)
export function playLiftSound() {
  triggerHaptic(12);
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(360, now);
  osc.frequency.exponentialRampToValueAtTime(580, now + 0.05);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(800, now);
  filter.Q.setValueAtTime(1.5, now);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

  osc.connect(filter).connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.07);
}

// Gentle wooden tap when deselecting or dropping back
export function playDeselectSound() {
  triggerHaptic(8);
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(380, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.04);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  osc.connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.06);
}

// Sliding wooden friction and landing thud
export function playMoveSound() {
  triggerHaptic(20);
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;

  // 1. Sliding swoosh
  const slideOsc = ctx.createOscillator();
  const slideGain = ctx.createGain();
  slideOsc.type = "triangle";
  slideOsc.frequency.setValueAtTime(340, now);
  slideOsc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

  slideGain.gain.setValueAtTime(0.001, now);
  slideGain.gain.linearRampToValueAtTime(0.15, now + 0.015);
  slideGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  slideOsc.connect(slideGain).connect(masterGain);
  slideOsc.start(now);
  slideOsc.stop(now + 0.09);

  // 2. Solid wood landing clack
  const clackOsc = ctx.createOscillator();
  const clackGain = ctx.createGain();
  clackOsc.type = "sine";
  clackOsc.frequency.setValueAtTime(220, now + 0.06);
  clackOsc.frequency.exponentialRampToValueAtTime(90, now + 0.12);

  clackGain.gain.setValueAtTime(0.001, now + 0.06);
  clackGain.gain.linearRampToValueAtTime(0.24, now + 0.07);
  clackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  clackOsc.connect(clackGain).connect(masterGain);
  clackOsc.start(now + 0.06);
  clackOsc.stop(now + 0.15);
}

// High-impact jump capture with resonant wood knock and combo pitch scaling
export function playCaptureSound(combo = 1) {
  triggerHaptic([35, 40, 45]);
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const pitchFactor = 1 + (combo - 1) * 0.22;

  // Heavy wood body impact
  const knockOsc = ctx.createOscillator();
  const knockGain = ctx.createGain();
  knockOsc.type = "sine";
  knockOsc.frequency.setValueAtTime(190 * pitchFactor, now);
  knockOsc.frequency.exponentialRampToValueAtTime(55 * pitchFactor, now + 0.14);

  knockGain.gain.setValueAtTime(0.001, now);
  knockGain.gain.linearRampToValueAtTime(0.38, now + 0.008);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  knockOsc.connect(knockGain).connect(masterGain);
  knockOsc.start(now);
  knockOsc.stop(now + 0.17);

  // Crisp wooden clatter overtone
  const snapOsc = ctx.createOscillator();
  const snapGain = ctx.createGain();
  snapOsc.type = "triangle";
  snapOsc.frequency.setValueAtTime(840 * pitchFactor, now);
  snapOsc.frequency.exponentialRampToValueAtTime(260 * pitchFactor, now + 0.1);

  snapGain.gain.setValueAtTime(0.001, now);
  snapGain.gain.linearRampToValueAtTime(0.28, now + 0.006);
  snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

  snapOsc.connect(snapGain).connect(masterGain);
  snapOsc.start(now);
  snapOsc.stop(now + 0.13);
}

// Gentle turn change bell
export function playTurnNotification() {
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(587.33, now); // D5
  osc.frequency.setValueAtTime(880.0, now + 0.06); // A5

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  osc.connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.2);
}

// Subtle wooden bump for invalid move attempt
export function playInvalidSound() {
  triggerHaptic([20, 30, 20]);
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = "triangle";
  osc2.type = "sawtooth";
  osc1.frequency.setValueAtTime(130, now);
  osc2.frequency.setValueAtTime(145, now);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(masterGain);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.1);
  osc2.stop(now + 0.1);
}

// Celebratory victory fanfare chords
export function playWinSound() {
  triggerHaptic([50, 60, 50, 100, 120]);
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const noteStart = now + idx * 0.09;

    osc.type = idx === 3 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(freq, noteStart);

    gain.gain.setValueAtTime(0.001, noteStart);
    gain.gain.linearRampToValueAtTime(0.24, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + (idx === 3 ? 0.65 : 0.35));

    osc.connect(gain).connect(masterGain!);
    osc.start(noteStart);
    osc.stop(noteStart + (idx === 3 ? 0.7 : 0.4));
  });
}

// Gentle somber cadence
export function playDefeatSound() {
  triggerHaptic([80, 100]);
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const notes = [440.0, 392.0, 329.63, 261.63];
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const noteStart = now + idx * 0.12;

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, noteStart);

    gain.gain.setValueAtTime(0.001, noteStart);
    gain.gain.linearRampToValueAtTime(0.15, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.45);

    osc.connect(gain).connect(masterGain!);
    osc.start(noteStart);
    osc.stop(noteStart + 0.5);
  });
}

// Crisp UI micro-click
export function playButtonClick() {
  triggerHaptic(10);
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.025);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

  osc.connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.035);
}

// Menu toggle swoosh
export function playMenuToggleSound(open: boolean) {
  triggerHaptic(15);
  if (!soundEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  if (open) {
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(560, now + 0.06);
  } else {
    osc.frequency.setValueAtTime(560, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.06);
  }

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

  osc.connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.08);
}
