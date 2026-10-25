import { useEffect, useRef, useState } from 'react'
import { getDifficulty, getMode } from '../data'
import {
  createRunGame,
  forceMonsterChase,
  forceSpawnNet,
  forceTriggerNet,
  snapshotGame,
  updateGame
} from '../game/engine'
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  loadRenderAssets,
  renderGame,
  type RenderAssets
} from '../game/renderer'
import { RulesQuickReference } from './Overlays'
import type {
  GameConfig,
  GameSettings,
  GameSnapshot,
  RunResult
} from '../types'
import type { AudioEngine } from '../audio'

interface GameScreenProps {
  config: GameConfig
  settings: GameSettings
  audio: AudioEngine
  onFinish: (result: RunResult) => void
  onCaptureReward: (amount: number) => void
  onExit: () => void
  onRestart: () => void
}

const EMPTY_ASSETS: RenderAssets = { characters: {}, surfCharacters: {}, objects: {} }

function clamp(value: number, min = -1, max = 1): number {
  return Math.max(min, Math.min(max, value))
}

export function GameScreen({
  config,
  settings,
  audio,
  onFinish,
  onCaptureReward,
  onExit,
  onRestart
}: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef(createRunGame(config))
  const assetsRef = useRef<RenderAssets>(EMPTY_ASSETS)
  const keyboardRef = useRef({
    left: false,
    right: false,
    accelerate: false,
    brake: false,
    boost: false
  })
  const touchControlsRef = useRef({
    left: false,
    right: false,
    accelerate: false,
    brake: false,
    boost: false
  })
  const touchSteerRef = useRef(0)
  const reportedRef = useRef(false)
  const [hud, setHud] = useState<GameSnapshot>(() => snapshotGame(gameRef.current))
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const mode = getMode(config.mode)
  const difficulty = getDifficulty(config.difficulty)

  useEffect(() => {
    let disposed = false
    loadRenderAssets()
      .then((assets) => {
        if (disposed) return
        assetsRef.current = assets
        setAssetsLoaded(true)
      })
      .catch(() => {
        if (!disposed) setAssetsLoaded(true)
      })
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as typeof window & {
      __NAISURF_DEBUG__?: {
        state: ReturnType<typeof createRunGame>
        forceMonsterChase: () => void
        forceSpawnNet: () => void
        forceTriggerNet: () => void
      }
    }).__NAISURF_DEBUG__ = {
      state: gameRef.current,
      forceMonsterChase: () => forceMonsterChase(gameRef.current),
      forceSpawnNet: () => forceSpawnNet(gameRef.current),
      forceTriggerNet: () => forceTriggerNet(gameRef.current)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return
    let animationFrame = 0
    let last = performance.now()
    let hudElapsed = 0

    const loop = (now: number) => {
      const state = gameRef.current
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const keySteer =
        (keyboardRef.current.right ? 1 : 0) - (keyboardRef.current.left ? 1 : 0)
      const touchTarget =
        (touchControlsRef.current.right ? 1 : 0) -
        (touchControlsRef.current.left ? 1 : 0)
      touchSteerRef.current +=
        (touchTarget - touchSteerRef.current) * Math.min(1, dt * 12)
      const steer = clamp(keySteer || touchSteerRef.current)

      updateGame(
        state,
        {
          steer,
          accelerate:
            keyboardRef.current.accelerate ||
            touchControlsRef.current.accelerate,
          brake:
            keyboardRef.current.brake ||
            touchControlsRef.current.brake ||
            false,
          boost:
            keyboardRef.current.boost ||
            touchControlsRef.current.boost,
          pause: false
        },
        dt
      )
      if (state.events.length) {
        for (const event of state.events) {
          void audio.sfx(event)
          if (event === 'capture') onCaptureReward(10)
        }
        state.events.length = 0
      }
      audio.setChaseAmbience(
        state.monster.state === 'chasing',
        Math.max(0, 1 - state.monster.gap / 78)
      )
      renderGame(context, state, assetsRef.current, settings)
      hudElapsed += dt

      if (hudElapsed > 0.07) {
        hudElapsed = 0
        setHud(snapshotGame(state))
      }

      if (state.result && !reportedRef.current) {
        reportedRef.current = true
        audio.setChaseAmbience(false)
        onFinish(state.result)
        void audio.sfx(state.result.reason === 'finished' ? 'capture' : 'gameover')
      }

      animationFrame = requestAnimationFrame(loop)
    }

    animationFrame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animationFrame)
  }, [audio, onCaptureReward, onFinish, settings])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = canvas?.parentElement
    if (!canvas || !container) return
    const resize = () => {
      const rect = container.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      if (rect.width / rect.height >= 1) {
        canvas.width = GAME_WIDTH
        canvas.height = GAME_HEIGHT
      } else {
        canvas.width = 360
        canvas.height = Math.min(760, Math.round(360 * (rect.height / rect.width)))
      }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (rulesOpen) {
        if (key === 'escape') setRulesOpen(false)
        return
      }
      if (['w', 'a', 's', 'd', 'f', ' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
        event.preventDefault()
      }
      if (key === 'a') keyboardRef.current.left = true
      if (key === 'd') keyboardRef.current.right = true
      if (key === 'w') keyboardRef.current.accelerate = true
      if (key === 's') keyboardRef.current.brake = true
      if (key === 'f') keyboardRef.current.boost = true
      if (key === ' ') {
        if (!gameRef.current.ended) {
          gameRef.current.paused = !gameRef.current.paused
          releaseTouchInput()
          if (gameRef.current.paused) audio.setChaseAmbience(false)
          setHud(snapshotGame(gameRef.current))
        }
      }
      if (key === 'escape') {
        if (!gameRef.current.ended) {
          gameRef.current.paused = !gameRef.current.paused
          releaseTouchInput()
          if (gameRef.current.paused) audio.setChaseAmbience(false)
          setHud(snapshotGame(gameRef.current))
        }
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'a') keyboardRef.current.left = false
      if (key === 'd') keyboardRef.current.right = false
      if (key === 'w') keyboardRef.current.accelerate = false
      if (key === 's') keyboardRef.current.brake = false
      if (key === 'f') keyboardRef.current.boost = false
    }
    const onBlur = () => releaseInput()
    const onVisibility = () => {
      if (document.hidden) releaseInput()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      audio.setChaseAmbience(false)
    }
  }, [audio, rulesOpen])

  function releaseTouchInput() {
    touchControlsRef.current.left = false
    touchControlsRef.current.right = false
    touchControlsRef.current.accelerate = false
    touchControlsRef.current.brake = false
    touchControlsRef.current.boost = false
    touchSteerRef.current = 0
  }

  function releaseInput() {
    keyboardRef.current.left = false
    keyboardRef.current.right = false
    keyboardRef.current.accelerate = false
    keyboardRef.current.brake = false
    keyboardRef.current.boost = false
    releaseTouchInput()
  }

  const togglePause = () => {
    if (gameRef.current.ended) return
    gameRef.current.paused = !gameRef.current.paused
    releaseInput()
    if (gameRef.current.paused) audio.setChaseAmbience(false)
    setHud(snapshotGame(gameRef.current))
  }

  const holdTouch = (key: 'left' | 'right' | 'accelerate' | 'brake' | 'boost') => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Synthetic test events do not own a native pointer; real touches do.
      }
      touchControlsRef.current[key] = true
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      touchControlsRef.current[key] = false
    },
    onPointerCancel: () => {
      touchControlsRef.current[key] = false
    },
    onLostPointerCapture: () => {
      touchControlsRef.current[key] = false
    }
  })

  const chasePercent = Math.max(0, Math.min(100, (hud.monsterGap / 78) * 100))
  const modeProgress =
    config.mode === 'timeTrial'
      ? Math.min(100, (hud.distance / hud.targetDistance) * 100)
      : 0

  return (
    <main
      className={`game-shell mode-${config.mode}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="game-topline">
        <button className="pixel-icon-button" onClick={togglePause} aria-label="暂停">
          <span>{hud.paused ? '▶' : 'Ⅱ'}</span>
        </button>
        <div className="game-mode-label">
          <span className="pixel-font">{mode.name}</span>
          <small>{difficulty.name} · {mode.kicker}</small>
        </div>
        <div className="game-score-pill">
          <small>{mode.scoreLabel}</small>
          <strong className="pixel-font">
            {config.mode === 'timeTrial'
              ? `${hud.elapsed.toFixed(1)}s`
              : config.mode === 'zigzag'
                ? `${hud.bestStreak}`
                : config.mode === 'collector'
                  ? `${hud.coins}`
                  : `${Math.round(hud.distance)}m`}
          </strong>
        </div>
      </div>

      <section className="game-canvas-frame">
        <div
          className="game-canvas-hitbox"
        >
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            aria-label="naisurf 游戏画面"
          />
          <div className="touch-steer-zones">
            <button className="touch-steer-zone left" {...holdTouch('left')} aria-label="按住向左">
              <span>‹</span>
            </button>
            <button className="touch-steer-zone right" {...holdTouch('right')} aria-label="按住向右">
              <span>›</span>
            </button>
          </div>
          {!assetsLoaded && (
            <div className="asset-loading">
              <span className="pixel-font">loading waves…</span>
            </div>
          )}
        </div>

        <div className="game-hud game-hud-left">
          <div className="hud-chip hearts" aria-label={`剩余 ${hud.lives} 条生命`}>
            {Array.from({ length: hud.maxLives }).map((_, index) => (
              <span key={index} className={index < hud.lives ? 'heart full' : 'heart'}>
                ♥
              </span>
            ))}
          </div>
          <div className="hud-chip milk-chip">
            <span className="milk-dot" />
            <strong className="pixel-font">{hud.coins}</strong>
          </div>
          {hud.shield > 0 && (
            <div className="hud-chip shield-chip">
              泡泡盾 <strong>{Math.ceil(hud.shield)}s</strong>
            </div>
          )}
          {hud.debuffRemaining > 0 && (
            <div className="hud-chip debuff-chip">
              减速 <strong>{hud.debuffRemaining.toFixed(1)}s</strong>
            </div>
          )}
        </div>

        <div className="game-hud game-hud-right">
          <div className="boost-meter" aria-label={`冲刺能量 ${Math.round(hud.boostEnergy)}`}>
            <div className="boost-icon">ϟ</div>
            <div className="boost-track">
              <div style={{ width: `${hud.boostEnergy}%` }} />
            </div>
          </div>
          <div className={`speed-state ${hud.motionState}`}>
            <strong>
              {hud.motionState === 'braking'
                ? '刹车'
                : hud.motionState === 'accelerating'
                  ? '加速'
                  : hud.motionState === 'boosting'
                    ? '冲刺'
                    : '巡航'}
            </strong>
            <span>{hud.speedRatio.toFixed(2)}×</span>
            <div className="speed-track">
              <div style={{ width: `${Math.min(100, (hud.speedRatio / 1.8) * 100)}%` }} />
            </div>
          </div>
          {hud.monsterActive && (
            <div
              className={`monster-meter ${
                hud.monsterState === 'chasing'
                  ? 'danger'
                  : hud.monsterState === 'recoiling'
                    ? 'recoiling'
                    : 'nearby'
              }`}
            >
              <div className="monster-meter-label">
                <span>
                  {hud.monsterState === 'chasing'
                    ? '奶怪距离'
                    : hud.monsterState === 'recoiling'
                      ? '奶怪已停止追击'
                      : '附近有奶怪'}
                </span>
                {hud.monsterState === 'chasing' && (
                  <strong>{Math.ceil(hud.monsterGap)}m</strong>
                )}
              </div>
              <div className="monster-track">
                <div
                  style={{
                    width: `${
                      hud.monsterState === 'chasing'
                        ? chasePercent
                        : hud.monsterState === 'recoiling'
                          ? 0
                          : 100
                    }%`
                  }}
                />
              </div>
            </div>
          )}
          {hud.netState === 'armed' && (
            <div className="net-hint">
              <span>渔网就位</span>
              <small>
                {hud.netCaptureReady ? '奶怪已进入捕获距离' : '贴网掠过，诱捕奶怪'}
              </small>
            </div>
          )}
        </div>

        {config.mode === 'timeTrial' && (
          <div className="course-progress">
            <div style={{ width: `${modeProgress}%` }} />
            <span>{Math.round(hud.distance)} / {hud.targetDistance}m</span>
          </div>
        )}

        {config.mode === 'zigzag' && (
          <div className="zigzag-streak">
            <span>连门</span>
            <strong className="pixel-font">{hud.streak}</strong>
            <small>最佳 {hud.bestStreak}</small>
          </div>
        )}

        {hud.secretEventActive && (
          <div className="secret-banner">奶怪暴走！本局不计纪录</div>
        )}

        <div className="touch-controls">
          <button className="speed-touch accelerate-touch" {...holdTouch('accelerate')} aria-label="按住加速">
            加速
          </button>
          <button className="speed-touch brake-touch" {...holdTouch('brake')} aria-label="按住刹车">
            刹车
          </button>
          <button className="boost-touch" {...holdTouch('boost')} aria-label="按住冲刺">
            ϟ
          </button>
        </div>

        {hud.paused && !gameRef.current.ended && (
          <div className="pause-layer">
            <div className="pause-card">
              <span className="tiny-label">WAVE BREAK</span>
              <h2>靠岸歇一会儿</h2>
              <p>
                电脑用 A/D 转向、W/S 加减速；手机按住左右半屏转向并使用底部按钮。
                {config.mode === 'endless' || config.mode === 'collector'
                  ? ' 别让奶怪咬到冲浪板。'
                  : ' 稳住节奏再出发。'}
              </p>
              <button className="primary-button" onClick={togglePause}>继续冲浪</button>
              <button className="secondary-button" onClick={() => setRulesOpen(true)}>规则速查</button>
              <button className="text-button" onClick={onRestart}>重新开始</button>
              <button className="text-button muted" onClick={onExit}>返回岸边</button>
            </div>
          </div>
        )}
      </section>

      <div className="game-control-strip">
        <span><kbd>A</kbd><kbd>D</kbd> 转向</span>
        <span><kbd>W</kbd> 加速 <kbd>S</kbd> 刹车</span>
        <span><kbd>F</kbd> 冲刺</span>
        <span><kbd>空格</kbd> 暂停</span>
        <span className="desktop-only"><kbd>Esc</kbd> 暂停菜单</span>
        <span className="mobile-only">按住左右半屏转向 · 底部控制速度</span>
      </div>
      {rulesOpen && <RulesQuickReference onClose={() => setRulesOpen(false)} />}
    </main>
  )
}
