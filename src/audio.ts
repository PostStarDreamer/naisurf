import type { GameSettings, MotionState } from './types'

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
  private masterGain?: GainNode
  private musicGain?: GainNode
  private gameGain?: GainNode
  private sfxGain?: GainNode
  private musicTimer?: number
  private chaseOscillator?: OscillatorNode
  private chaseGain?: GainNode
  private noiseBuffer?: AudioBuffer
  private pageMuted = false
  private step = 0
  private nextMusicAt = 0
  private pace = 1
  private chaseIntensity = 0
  private motionState: MotionState = 'cruise'
  private settings: Pick<GameSettings, 'musicVolume' | 'sfxVolume'>

  constructor(settings: Pick<GameSettings, 'musicVolume' | 'sfxVolume'>) {
    this.settings = settings
  }

  private createContext(): void {
    if (!this.context) {
      const Context =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      this.context = new Context()
      this.masterGain = this.context.createGain()
      this.musicGain = this.context.createGain()
      this.gameGain = this.context.createGain()
      this.sfxGain = this.context.createGain()
      this.gameGain.gain.value = 0
      this.musicGain.connect(this.masterGain)
      this.gameGain.connect(this.musicGain)
      this.sfxGain.connect(this.masterGain)
      this.masterGain.connect(this.context.destination)
      this.applyVolumes()
    }
  }

  async unlock(): Promise<void> {
    this.createContext()
    const context = this.context
    if (!context) throw new Error('音频上下文不可用')
    if (context.state === 'suspended') {
      await context.resume()
    }
  }

  updateSettings(settings: Pick<GameSettings, 'musicVolume' | 'sfxVolume'>): void {
    this.settings = settings
    this.applyVolumes()
  }

  setPageMuted(muted: boolean): void {
    this.pageMuted = muted
    this.applyVolumes()
  }

  private applyVolumes(): void {
    if (!this.context) return
    const now = this.context.currentTime
    this.masterGain?.gain.setTargetAtTime(this.pageMuted ? 0 : 1, now, 0.02)
    this.musicGain?.gain.setTargetAtTime(this.settings.musicVolume, now, 0.03)
    this.sfxGain?.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.02)
  }

  async startGameMusic(): Promise<void> {
    await this.unlock()
    this.startMusicScheduler()
    this.fadeGameMusic(1)
  }

  private fadeGameMusic(target: number): void {
    if (!this.context || !this.gameGain) return
    const now = this.context.currentTime
    const end = now + 0.6
    this.gameGain.gain.cancelScheduledValues(now)
    this.gameGain.gain.setValueAtTime(this.gameGain.gain.value, now)
    this.gameGain.gain.linearRampToValueAtTime(target, end)
  }

  private startMusicScheduler(): void {
    if (!this.context || this.musicTimer) return
    this.nextMusicAt = this.context.currentTime + 0.05
    this.musicTimer = window.setInterval(() => this.scheduleGameMusic(), 90)
    this.scheduleGameMusic()
  }

  stopMusic(): void {
    if (this.musicTimer) window.clearInterval(this.musicTimer)
    this.musicTimer = undefined
    this.fadeGameMusic(0)
  }

  dispose(): void {
    this.stopMusic()
    this.chaseOscillator?.stop()
    this.chaseOscillator = undefined
    this.chaseGain = undefined
    void this.context?.close()
    this.context = undefined
  }

  setGameDynamics(
    paceMultiplier: number,
    chaseIntensity: number,
    motionState: MotionState
  ): void {
    this.pace = Math.max(1, paceMultiplier)
    this.chaseIntensity = Math.max(0, Math.min(1, chaseIntensity))
    this.motionState = motionState
  }

  setChaseAmbience(active: boolean, intensity = 0): void {
    if (!this.context || !this.gameGain) return
    if (active && !this.chaseOscillator) {
      this.chaseOscillator = this.context.createOscillator()
      this.chaseGain = this.context.createGain()
      const filter = this.context.createBiquadFilter()
      this.chaseOscillator.type = 'triangle'
      this.chaseOscillator.frequency.value = 54
      this.chaseGain.gain.value = 0
      filter.type = 'lowpass'
      filter.frequency.value = 180
      this.chaseOscillator.connect(filter)
      filter.connect(this.chaseGain)
      this.chaseGain.connect(this.gameGain)
      this.chaseOscillator.start()
    }
    if (!this.chaseOscillator || !this.chaseGain) return
    const now = this.context.currentTime
    const volume = active ? 0.025 + Math.max(0, Math.min(1, intensity)) * 0.075 : 0
    this.chaseGain.gain.setTargetAtTime(volume, now, active ? 0.12 : 0.25)
    this.chaseOscillator.frequency.setTargetAtTime(48 + intensity * 28, now, 0.2)
  }

  private scheduleGameMusic(): void {
    if (!this.context || !this.gameGain || this.settings.musicVolume <= 0) return
    const tempo = 80 + Math.min(42, (this.pace - 1) * 25) + this.chaseIntensity * 8
    const stepDuration = 60 / tempo / 2
    const horizon = this.context.currentTime + 0.22
    while (this.nextMusicAt < horizon) {
      this.scheduleMusicStep(this.step, this.nextMusicAt, stepDuration)
      this.step += 1
      this.nextMusicAt += stepDuration
    }
  }

  private scheduleMusicStep(step: number, time: number, stepDuration: number): void {
    if (!this.gameGain) return
    const melody = [0, 7, 9, 12, 9, 7, 4, 7, 0, 7, 11, 12, 14, 11, 7, 4]
    const bass = [0, 0, 5, 5, 2, 2, 7, 7]
    const phrase = 196
    const note = melody[step % melody.length]
    const motionGain = this.motionState === 'braking' ? 0.72 : 1
    this.playTone(
      phrase * 2 ** (note / 12),
      time,
      stepDuration * 1.7,
      'triangle',
      0.031 * motionGain,
      this.gameGain
    )

    if (step % 2 === 0) {
      this.playTone(
        phrase * 2 ** (bass[Math.floor(step / 2) % bass.length] / 12) * 0.5,
        time,
        stepDuration * 2.6,
        'sine',
        0.034,
        this.gameGain
      )
    }
    if (step % 8 === 0) {
      this.playTone(
        phrase * 2 ** ((note + 4) / 12) * 2,
        time,
        stepDuration * 7,
        'sine',
        0.014,
        this.gameGain
      )
    }
    if (step % 4 === 0) {
      this.playNoise(time, 0.09, 0.018, 950)
    }
    if (this.chaseIntensity > 0.08 && step % 2 === 1) {
      this.playTone(
        62 + this.chaseIntensity * 23,
        time,
        stepDuration * 0.85,
        'sine',
        0.022 + this.chaseIntensity * 0.025,
        this.gameGain
      )
    }
  }

  private getNoiseBuffer(): AudioBuffer | undefined {
    if (!this.context) return undefined
    if (this.noiseBuffer) return this.noiseBuffer
    const buffer = this.context.createBuffer(
      1,
      Math.floor(this.context.sampleRate * 0.5),
      this.context.sampleRate
    )
    const data = buffer.getChannelData(0)
    let value = 0.35
    for (let index = 0; index < data.length; index += 1) {
      value = value * 0.94 + (Math.random() * 2 - 1) * 0.06
      data[index] = value
    }
    this.noiseBuffer = buffer
    return buffer
  }

  private playNoise(
    time: number,
    duration: number,
    volume: number,
    cutoff: number
  ): void {
    if (!this.context || !this.gameGain) return
    const buffer = this.getNoiseBuffer()
    if (!buffer) return
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const envelope = this.context.createGain()
    source.buffer = buffer
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(cutoff, time)
    envelope.gain.setValueAtTime(0.0001, time)
    envelope.gain.linearRampToValueAtTime(volume, time + 0.02)
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.gameGain)
    source.start(time)
    source.stop(time + duration + 0.03)
  }

  private playTone(
    frequency: number,
    time: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    destination: AudioNode
  ): void {
    if (!this.context) return
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, time)
    envelope.gain.setValueAtTime(0, time)
    envelope.gain.linearRampToValueAtTime(volume, time + 0.015)
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    oscillator.connect(envelope)
    envelope.connect(destination)
    oscillator.start(time)
    oscillator.stop(time + duration + 0.03)
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
      boost: [
        [150, 0.2, 'sawtooth'],
        [260, 0.18, 'triangle']
      ],
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
      if (name === 'boost') {
        oscillator.frequency.exponentialRampToValueAtTime(
          frequency * 1.8,
          start + duration
        )
      }
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.linearRampToValueAtTime(0.12, start + 0.01)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(envelope)
      envelope.connect(this.sfxGain!)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
    })

    if (name === 'boost' || name === 'brake') {
      const source = this.context.createBufferSource()
      const filter = this.context.createBiquadFilter()
      const envelope = this.context.createGain()
      const buffer = this.getNoiseBuffer()
      if (!buffer) return
      source.buffer = buffer
      filter.type = 'bandpass'
      filter.frequency.value = name === 'brake' ? 650 : 1200
      envelope.gain.setValueAtTime(0.0001, now)
      envelope.gain.linearRampToValueAtTime(0.07, now + 0.015)
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)
      source.connect(filter)
      filter.connect(envelope)
      envelope.connect(this.sfxGain)
      source.start(now)
      source.stop(now + 0.25)
    }
  }
}
