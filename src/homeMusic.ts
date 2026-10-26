export type HomeMusicStatus = 'loading' | 'playing' | 'blocked' | 'off'

const clampVolume = (value: number) => Math.max(0, Math.min(1, value))

export class HomeMusicPlayer {
  private readonly audio: HTMLAudioElement
  private listener: (status: HomeMusicStatus) => void
  private status: HomeMusicStatus = 'off'
  private desiredScene: 'home' | 'game' | 'idle' = 'idle'
  private targetVolume: number
  private userPaused = false
  private pageHidden = false
  private fadeTimer?: number

  constructor(
    source: string,
    volume: number,
    listener: (status: HomeMusicStatus) => void
  ) {
    this.listener = listener
    this.targetVolume = clampVolume(volume)
    this.audio = new Audio(source)
    this.audio.loop = true
    this.audio.preload = 'auto'
    this.audio.setAttribute('playsinline', '')
    this.audio.volume = this.targetVolume
    this.audio.id = 'naisurf-home-music'
    this.audio.dataset.homeMusic = 'true'
    this.audio.style.display = 'none'
    this.audio.setAttribute('aria-hidden', 'true')
    this.audio.addEventListener('playing', () => {
      if (this.desiredScene === 'home' && !this.userPaused && !this.pageHidden) {
        this.setStatus('playing')
      }
    })
    this.audio.addEventListener('error', () => this.setStatus('blocked'))
    document.body.appendChild(this.audio)
  }

  setStatusListener(listener: (status: HomeMusicStatus) => void): void {
    this.listener = listener
    listener(this.status)
  }

  getStatus(): HomeMusicStatus {
    return this.status
  }

  setVolume(volume: number): void {
    this.targetVolume = clampVolume(volume)
    if (this.desiredScene === 'home' && !this.userPaused) {
      this.audio.volume = this.targetVolume
    }
  }

  private setStatus(status: HomeMusicStatus): void {
    this.status = status
    this.audio.dataset.status = status
    this.listener(status)
  }

  private fadeTo(target: number, duration: number, after?: () => void): void {
    if (this.fadeTimer) window.clearInterval(this.fadeTimer)
    const startVolume = this.audio.volume
    const startedAt = performance.now()
    this.fadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / duration)
      this.audio.volume = clampVolume(
        startVolume + (target - startVolume) * progress
      )
      if (progress >= 1) {
        if (this.fadeTimer) window.clearInterval(this.fadeTimer)
        this.fadeTimer = undefined
        after?.()
      }
    }, 30)
  }

  async startHome(): Promise<HomeMusicStatus> {
    this.desiredScene = 'home'
    if (this.userPaused || this.pageHidden) return this.status
    if (!this.audio.paused) {
      this.fadeTo(this.targetVolume, 600)
      this.setStatus('playing')
      return 'playing'
    }
    this.audio.volume = 0
    this.setStatus('loading')
    try {
      await this.audio.play()
      if (this.desiredScene !== 'home' || this.userPaused || this.pageHidden) {
        this.audio.pause()
        return this.status
      }
      this.setStatus('playing')
      this.fadeTo(this.targetVolume, 600)
      return 'playing'
    } catch {
      this.setStatus('blocked')
      return 'blocked'
    }
  }

  enterGame(): void {
    this.desiredScene = 'game'
    this.fadeTo(0, 600, () => {
      if (this.desiredScene === 'game') this.audio.pause()
    })
  }

  toggle(): void {
    if (this.status === 'playing' || this.status === 'loading') {
      this.userPaused = true
      this.desiredScene = 'idle'
      this.fadeTo(0, 250, () => this.audio.pause())
      this.setStatus('off')
      return
    }
    this.userPaused = false
    void this.startHome()
  }

  setPageHidden(hidden: boolean): void {
    if (hidden === this.pageHidden) return
    this.pageHidden = hidden
    if (hidden) {
      this.audio.pause()
      return
    }
    if (this.desiredScene === 'home' && !this.userPaused) {
      void this.startHome()
    }
  }

  dispose(): void {
    if (this.fadeTimer) window.clearInterval(this.fadeTimer)
    this.audio.pause()
    this.desiredScene = 'idle'
    this.status = 'off'
    this.audio.dataset.status = 'off'
  }
}
