import type { GameSettings } from './types'

type SfxName =
  | 'collect'
  | 'heart'
  | 'boost'
  | 'hit'
  | 'capture'
  | 'gameover'
  | 'click'
  | 'monsterWake'
  | 'monsterHit'
  | 'monsterStop'
  | 'netSnap'
  | 'debuff'
  | 'accelerate'
  | 'brake'
  | 'revive'

export class AudioEngine {
  private context?: AudioContext
  private musicGain?: GainNode
  private sfxGain?: GainNode
  private musicTimer?: number
  private chaseOscillator?: OscillatorNode
  private chaseGain?: GainNode
  private step = 0
  private settings: Pick<GameSettings, 'musicVolume' | 'sfxVolume'>

  constructor(settings: Pick<GameSettings, 'musicVolume' | 'sfxVolume'>) {
    this.settings = settings
  }

  async unlock(): Promise<void> {
    if (!this.context) {
      const Context =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      this.context = new Context()
      this.musicGain = this.context.createGain()
      this.sfxGain = this.context.createGain()
      this.musicGain.connect(this.context.destination)
      this.sfxGain.connect(this.context.destination)
      this.applyVolumes()
    }
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
  }

  updateSettings(settings: Pick<GameSettings, 'musicVolume' | 'sfxVolume'>): void {
    this.settings = settings
    this.applyVolumes()
  }

  private applyVolumes(): void {
    if (!this.context) return
    const now = this.context.currentTime
    this.musicGain?.gain.setTargetAtTime(this.settings.musicVolume, now, 0.03)
    this.sfxGain?.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.02)
  }

  async startMusic(): Promise<void> {
    await this.unlock()
    if (this.musicTimer) return
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 180)
    this.scheduleMusic()
  }

  stopMusic(): void {
    if (this.musicTimer) window.clearInterval(this.musicTimer)
    this.musicTimer = undefined
  }

  setChaseAmbience(active: boolean, intensity = 0): void {
    if (!this.context) return
    if (active && !this.chaseOscillator) {
      this.chaseOscillator = this.context.createOscillator()
      this.chaseGain = this.context.createGain()
      this.chaseOscillator.type = 'triangle'
      this.chaseOscillator.frequency.value = 54
      this.chaseGain.gain.value = 0
      this.chaseOscillator.connect(this.chaseGain)
      this.chaseGain.connect(this.sfxGain!)
      this.chaseOscillator.start()
    }
    if (!this.chaseOscillator || !this.chaseGain) return
    const now = this.context.currentTime
    const volume = active ? 0.025 + Math.max(0, Math.min(1, intensity)) * 0.055 : 0
    this.chaseGain.gain.setTargetAtTime(volume, now, active ? 0.12 : 0.25)
    if (this.chaseOscillator) {
      this.chaseOscillator.frequency.setTargetAtTime(48 + intensity * 24, now, 0.2)
    }
  }

  private scheduleMusic(): void {
    if (!this.context || !this.musicGain || this.settings.musicVolume <= 0) return
    const melody = [0, 4, 7, 9, 7, 4, 2, 7, 0, 4, 11, 9, 7, 2, 4, 2]
    const bass = [0, 0, 5, 5, 2, 2, 7, 7]
    const now = this.context.currentTime + 0.02
    const pitch = melody[this.step % melody.length]
    const root = 196
    this.playTone(root * 2 ** (pitch / 12), now, 0.12, 'square', 0.035)
    if (this.step % 2 === 0) {
      this.playTone(
        root * 2 ** (bass[Math.floor(this.step / 2) % bass.length] / 12),
        now,
        0.2,
        'triangle',
        0.026
      )
    }
    this.step += 1
  }

  private playTone(
    frequency: number,
    time: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    if (!this.context || !this.musicGain) return
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, time)
    envelope.gain.setValueAtTime(0, time)
    envelope.gain.linearRampToValueAtTime(volume, time + 0.01)
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    oscillator.connect(envelope)
    envelope.connect(this.musicGain)
    oscillator.start(time)
    oscillator.stop(time + duration + 0.02)
  }

  async sfx(name: SfxName): Promise<void> {
    await this.unlock()
    if (!this.context || !this.sfxGain) return
    const now = this.context.currentTime
    const patterns: Record<SfxName, Array<[number, number, OscillatorType]>> = {
      collect: [
        [740, 0.08, 'square'],
        [1040, 0.1, 'square']
      ],
      heart: [
        [520, 0.1, 'triangle'],
        [780, 0.12, 'triangle'],
        [1040, 0.16, 'triangle']
      ],
      boost: [[170, 0.18, 'sawtooth']],
      hit: [
        [110, 0.14, 'square'],
        [82, 0.18, 'sawtooth']
      ],
      capture: [
        [320, 0.08, 'square'],
        [520, 0.1, 'square'],
        [880, 0.18, 'triangle']
      ],
      gameover: [
        [360, 0.15, 'triangle'],
        [260, 0.18, 'triangle'],
        [170, 0.3, 'sawtooth']
      ],
      click: [[620, 0.04, 'square']],
      monsterWake: [
        [92, 0.16, 'sawtooth'],
        [68, 0.22, 'triangle'],
        [116, 0.14, 'square']
      ],
      monsterHit: [
        [82, 0.2, 'sawtooth'],
        [48, 0.32, 'triangle']
      ],
      monsterStop: [
        [180, 0.12, 'triangle'],
        [110, 0.24, 'sawtooth']
      ],
      netSnap: [
        [260, 0.08, 'square'],
        [410, 0.1, 'square'],
        [680, 0.14, 'triangle']
      ],
      debuff: [
        [220, 0.1, 'triangle'],
        [140, 0.18, 'sawtooth']
      ],
      accelerate: [
        [220, 0.1, 'triangle'],
        [330, 0.14, 'triangle']
      ],
      brake: [[130, 0.16, 'triangle']],
      revive: [
        [260, 0.1, 'triangle'],
        [390, 0.12, 'triangle'],
        [620, 0.16, 'square'],
        [820, 0.22, 'triangle']
      ]
    }

    patterns[name].forEach(([frequency, duration, type], index) => {
      const oscillator = this.context!.createOscillator()
      const envelope = this.context!.createGain()
      const start = now + index * 0.055
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, start)
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.linearRampToValueAtTime(0.12, start + 0.01)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(envelope)
      envelope.connect(this.sfxGain!)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
    })
  }
}
