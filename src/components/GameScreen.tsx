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
  onExit: () => void
  onRestart: () => void
}

const EMPTY_ASSETS: RenderAssets = { characters: {} }

function clamp(value: number, min = -1, max = 1): number {
  return Math.max(min, Math.min(max, value))
}

export function GameScreen({
  config,
  settings,
  audio,
  onFinish,
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
  const pointerSteerRef = useRef(0)
  const touchControlsRef = useRef({ brake: false, boost: false })
  const reportedRef = useRef(false)
  const [hud, setHud] = useState<GameSnapshot>(() => snapshotGame(gameRef.current))
  const [assetsLoaded, setAssetsLoaded] = useState(false)
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

      const gamepad = navigator.getGamepads?.()[0]
      const axis = gamepad ? Math.abs(gamepad.axes[0] ?? 0) > 0.16 ? gamepad.axes[0] : 0 : 0
      const dpadLeft = gamepad?.buttons[14]?.pressed ? -1 : 0
      const dpadRight = gamepad?.buttons[15]?.pressed ? 1 : 0
      const keySteer =
        (keyboardRef.current.right ? 1 : 0) - (keyboardRef.current.left ? 1 : 0)
      const steer = clamp(
        keySteer + pointerSteerRef.current + axis + dpadLeft + dpadRight
      )

      updateGame(
        state,
        {
          steer,
          accelerate:
            keyboardRef.current.accelerate ||
            Boolean(gamepad?.buttons[7]?.pressed),
          brake:
            keyboardRef.current.brake ||
            touchControlsRef.current.brake ||
            Boolean(gamepad?.buttons[6]?.pressed),
          boost:
            keyboardRef.current.boost ||
            touchControlsRef.current.boost ||
            Boolean(gamepad?.buttons[0]?.pressed),
          pause: false
        },
        dt
      )
      if (state.events.length) {
        for (const event of state.events) void audio.sfx(event)
        state.events.length = 0
      }
      renderGame(context, state, assetsRef.current, settings)
      hudElapsed += dt

      if (hudElapsed > 0.07) {
        hudElapsed = 0
        setHud(snapshotGame(state))
      }

      if (state.result && !reportedRef.current) {
        reportedRef.current = true
        onFinish(state.result)
        void audio.sfx(state.result.reason === 'finished' ? 'capture' : 'gameover')
      }

      animationFrame = requestAnimationFrame(loop)
    }

    animationFrame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animationFrame)
  }, [audio, onFinish, settings])

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
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) {
        event.preventDefault()
      }
      if (key === 'arrowleft' || key === 'a') keyboardRef.current.left = true
      if (key === 'arrowright' || key === 'd') keyboardRef.current.right = true
      if (key === 'arrowup' || key === 'w') keyboardRef.current.accelerate = true
      if (key === 'arrowdown' || key === 's') keyboardRef.current.brake = true
      if (key === 'f' || key === 'shift') keyboardRef.current.boost = true
      if (key === ' ' || key === 'p') {
        if (!gameRef.current.ended) {
          gameRef.current.paused = !gameRef.current.paused
          setHud(snapshotGame(gameRef.current))
        }
      }
      if (key === 'escape') {
        if (gameRef.current.paused) onExit()
        else {
          gameRef.current.paused = true
          setHud(snapshotGame(gameRef.current))
        }
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'arrowleft' || key === 'a') keyboardRef.current.left = false
      if (key === 'arrowright' || key === 'd') keyboardRef.current.right = false
      if (key === 'arrowup' || key === 'w') keyboardRef.current.accelerate = false
      if (key === 'arrowdown' || key === 's') keyboardRef.current.brake = false
      if (key === 'f' || key === 'shift') keyboardRef.current.boost = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [onExit])

  const updatePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const normalized = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointerSteerRef.current = clamp(normalized * 1.4)
  }

  const togglePause = () => {
    if (gameRef.current.ended) return
    gameRef.current.paused = !gameRef.current.paused
    setHud(snapshotGame(gameRef.current))
  }

  const chasePercent = Math.max(0, Math.min(100, (hud.monsterGap / 78) * 100))
  const modeProgress =
    config.mode === 'timeTrial'
      ? Math.min(100, (hud.distance / hud.targetDistance) * 100)
      : 0

  return (
    <main className={`game-shell mode-${config.mode}`}>
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
          onPointerMove={updatePointer}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') pointerSteerRef.current = 0
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            updatePointer(event)
          }}
          onPointerUp={() => {
            pointerSteerRef.current = 0
          }}
          onPointerCancel={() => {
            pointerSteerRef.current = 0
          }}
        >
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            aria-label="naisurf 游戏画面"
          />
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
        </div>

        <div className="game-hud game-hud-right">
          <div className="boost-meter" aria-label={`冲刺能量 ${Math.round(hud.boostEnergy)}`}>
            <div className="boost-icon">ϟ</div>
            <div className="boost-track">
              <div style={{ width: `${hud.boostEnergy}%` }} />
            </div>
          </div>
          {hud.monsterActive && (
            <div
              className={`monster-meter ${
                hud.monsterState === 'chasing' ? 'danger' : 'nearby'
              }`}
            >
              <div className="monster-meter-label">
                <span>{hud.monsterState === 'chasing' ? '奶怪距离' : '附近有奶怪'}</span>
                {hud.monsterState === 'chasing' && (
                  <strong>{Math.ceil(hud.monsterGap)}m</strong>
                )}
              </div>
              <div className="monster-track">
                <div style={{ width: `${hud.monsterState === 'chasing' ? chasePercent : 100}%` }} />
              </div>
            </div>
          )}
          {hud.netState === 'armed' && (
            <div className="net-hint">
              <span>渔网就位</span>
              <small>贴网掠过，诱捕奶怪</small>
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
          <button
            aria-label="刹车"
            onPointerDown={() => {
              touchControlsRef.current.brake = true
            }}
            onPointerUp={() => {
              touchControlsRef.current.brake = false
            }}
            onPointerCancel={() => {
              touchControlsRef.current.brake = false
            }}
          >
            刹
          </button>
          <button
            className="boost-touch"
            aria-label="冲刺"
            onPointerDown={() => {
              touchControlsRef.current.boost = true
            }}
            onPointerUp={() => {
              touchControlsRef.current.boost = false
            }}
            onPointerCancel={() => {
              touchControlsRef.current.boost = false
            }}
          >
            ϟ
          </button>
        </div>

        {hud.paused && !gameRef.current.ended && (
          <div className="pause-layer">
            <div className="pause-card">
              <span className="tiny-label">WAVE BREAK</span>
              <h2>靠岸歇一会儿</h2>
              <p>
                {config.mode === 'endless' || config.mode === 'collector'
                  ? '左右滑浪，按 F 冲刺，别让奶怪咬到冲浪板。'
                  : '左右滑浪，按 F 冲刺，稳住节奏再出发。'}
              </p>
              <button className="primary-button" onClick={togglePause}>继续冲浪</button>
              <button className="text-button" onClick={onRestart}>重新开始</button>
              <button className="text-button muted" onClick={onExit}>返回岸边</button>
            </div>
          </div>
        )}
      </section>

      <div className="game-control-strip">
        <span><kbd>←</kbd><kbd>→</kbd> 转向</span>
        <span><kbd>↑</kbd> 加速 <kbd>↓</kbd> 刹车</span>
        <span><kbd>F</kbd> 冲刺</span>
        <span><kbd>空格</kbd> 暂停</span>
        <span className="desktop-only">鼠标横向 / 手柄可用</span>
        <span className="mobile-only">拖拽画面转向</span>
      </div>
    </main>
  )
}
