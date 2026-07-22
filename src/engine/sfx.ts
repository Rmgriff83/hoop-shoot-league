/**
 * Procedural Web Audio sfx — zero audio files (asteroid2.0 pattern). Every hit
 * takes an intensity 0..1 (from physics impact speed) so hard clangs ring and
 * grazes tick. Call unlockAudio() from the first user gesture (iOS requirement).
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

function ac(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)
  }
  return ctx
}

export function unlockAudio(): void {
  const c = ac()
  if (c && c.state === 'suspended') void c.resume()
}

export function setMuted(m: boolean): void {
  muted = m
}

function envGain(c: AudioContext, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), c.currentTime + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + attack + decay)
  g.connect(master!)
  return g
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/** Metallic rim clang — two detuned partials + a bright noise tick. */
export function playRimClang(intensity: number): void {
  const c = ac()
  if (!c) return
  const amp = 0.25 + 0.6 * Math.min(intensity, 1)
  for (const [freq, mul] of [
    [2350, 1],
    [3170, 0.55],
    [1420, 0.4],
  ] as const) {
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = freq * (0.98 + Math.random() * 0.04)
    const g = envGain(c, amp * mul * 0.2, 0.002, 0.16 + 0.12 * intensity)
    o.connect(g)
    o.start()
    o.stop(c.currentTime + 0.4)
  }
  const n = c.createBufferSource()
  n.buffer = noiseBuffer(c, 0.06)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 3000
  bp.Q.value = 2
  const ng = envGain(c, amp * 0.15, 0.001, 0.05)
  n.connect(bp).connect(ng)
  n.start()
}

/** Backboard thud — low knock + woody noise. */
export function playBoardThud(intensity: number): void {
  const c = ac()
  if (!c) return
  const amp = 0.3 + 0.55 * Math.min(intensity, 1)
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(220, c.currentTime)
  o.frequency.exponentialRampToValueAtTime(90, c.currentTime + 0.09)
  const g = envGain(c, amp * 0.5, 0.002, 0.12)
  o.connect(g)
  o.start()
  o.stop(c.currentTime + 0.25)
  const n = c.createBufferSource()
  n.buffer = noiseBuffer(c, 0.05)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  const ng = envGain(c, amp * 0.25, 0.001, 0.06)
  n.connect(lp).connect(ng)
  n.start()
}

/** Floor bounce — classic hollow thump. */
export function playBounce(intensity: number): void {
  const c = ac()
  if (!c) return
  const amp = 0.2 + 0.5 * Math.min(intensity, 1)
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(140, c.currentTime)
  o.frequency.exponentialRampToValueAtTime(55, c.currentTime + 0.12)
  const g = envGain(c, amp * 0.6, 0.003, 0.16)
  o.connect(g)
  o.start()
  o.stop(c.currentTime + 0.3)
}

/** Swish — soft filtered-noise whoosh with a falling sweep. */
export function playSwish(): void {
  const c = ac()
  if (!c) return
  const n = c.createBufferSource()
  n.buffer = noiseBuffer(c, 0.35)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(2600, c.currentTime)
  bp.frequency.exponentialRampToValueAtTime(700, c.currentTime + 0.28)
  const g = envGain(c, 0.5, 0.02, 0.3)
  n.connect(bp).connect(g)
  n.start()
}

/** Net rustle for non-swish makes — quieter, shorter than the full swish. */
export function playNet(): void {
  const c = ac()
  if (!c) return
  const n = c.createBufferSource()
  n.buffer = noiseBuffer(c, 0.18)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.5
  bp.frequency.setValueAtTime(1800, c.currentTime)
  bp.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.15)
  const g = envGain(c, 0.28, 0.01, 0.16)
  n.connect(bp).connect(g)
  n.start()
}

/** Cheerful two-note score pop (higher pair for swishes). */
export function playScorePop(swish: boolean): void {
  const c = ac()
  if (!c) return
  const notes = swish ? [880, 1318.5] : [659.25, 880]
  notes.forEach((freq, i) => {
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = freq
    const g = envGain(c, 0.12, 0.005, 0.14)
    g.gain.setValueAtTime(0.0001, c.currentTime + i * 0.07)
    o.connect(g)
    o.start(c.currentTime + i * 0.07)
    o.stop(c.currentTime + i * 0.07 + 0.2)
  })
}

/** Shot-clock buzzer. */
export function playBuzzer(): void {
  const c = ac()
  if (!c) return
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.value = 210
  const o2 = c.createOscillator()
  o2.type = 'sawtooth'
  o2.frequency.value = 213
  const g = envGain(c, 0.3, 0.01, 0.5)
  o.connect(g)
  o2.connect(g)
  o.start()
  o2.start()
  o.stop(c.currentTime + 0.55)
  o2.stop(c.currentTime + 0.55)
}
