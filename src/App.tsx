import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine } from './audio'
import { GameScreen } from './components/GameScreen'
import {
  ModeGuide,
  ResultOverlay,
  SettingsModal,
  ShopModal,
  TutorialModal
} from './components/Overlays'
import {
  CHARACTERS,
  CURRENT_GUIDE_VERSION,
  DIFFICULTIES,
  MODES,
  formatScore,
  getCharacter,
  getDifficulty,
  getMode,
  getNextUnlock,
  recordKey
} from './data'
import {
  applyRunResult,
  creditCaptureReward,
  loadSave,
  persistSave,
  resetAll,
  resetRecords,
  tryUnlockNext
} from './storage'
import type {
  CharacterId,
  Difficulty,
  GameConfig,
  GameMode,
  GameSettings,
  RunResult,
  SaveData,
  Screen
} from './types'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-label="naisurf">
      <span className="brand-wave">≈</span>
      <span className="brand-word pixel-font">naisurf</span>
      <span className="brand-dot" />
    </span>
  )
}

function MilkIcon() {
  return <span className="milk-dot" aria-hidden="true" />
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2Z" />
      <path d="m19.2 13.6 1.4 1.1-1.8 3.1-1.8-.7a7.7 7.7 0 0 1-1.5.9l-.3 1.9h-3.6l-.3-1.9a7.7 7.7 0 0 1-1.5-.9l-1.8.7-1.8-3.1 1.4-1.1a8 8 0 0 1 0-1.8L5.2 10.7l1.8-3.1 1.8.7a7.7 7.7 0 0 1 1.5-.9L10.6 5h3.6l.3 1.9a7.7 7.7 0 0 1 1.5.9l1.8-.7 1.8 3.1-1.4 1.1a8 8 0 0 1 0 1.8Z" />
    </svg>
  )
}

function ModeIcon({ mode }: { mode: GameMode }) {
  if (mode === 'endless') {
    return (
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <path d="M10 12c-5 0-7 3-7 6s2 6 7 6h16c5 0 7-3 7-6s-2-6-7-6" />
      </svg>
    )
  }
  if (mode === 'timeTrial') {
    return (
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="20" r="11" />
        <path d="M18 20V13m0 2 5 3M14 5h8" />
      </svg>
    )
  }
  if (mode === 'zigzag') {
    return (
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <path d="M4 22 12 10l6 16 7-16 7 12M8 28h20" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <path d="M18 4 8 20h8l-2 12 12-18h-8l3-10Z" />
      <path d="M7 28h22" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  )
}

interface CompletedRun extends RunResult {
  newRecord: boolean
  absoluteBest: number
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [save, setSave] = useState<SaveData>(() => loadSave())
  const [mode, setMode] = useState<GameMode>('endless')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [shopOpen, setShopOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [pendingStart, setPendingStart] = useState(false)
  const [runId, setRunId] = useState(0)
  const [result, setResult] = useState<CompletedRun | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const audioRef = useRef<AudioEngine | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save

  if (!audioRef.current) {
    audioRef.current = new AudioEngine(save.settings)
  }
  const audio = audioRef.current
  const selectedMode = getMode(mode)
  const selectedDifficulty = getDifficulty(difficulty)
  const selectedCharacter = getCharacter(save.character)
  const nextUnlock = getNextUnlock(save)
  const highest = save.records[recordKey(mode, difficulty)] ?? 0
  const totalUnlocked = save.unlocked.length

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  useEffect(() => {
    persistSave(save)
    audio.updateSettings(save.settings)
  }, [audio, save])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [screen])

  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => window.removeEventListener('beforeinstallprompt', onInstall)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      audio.stopMusic()
    }
  }, [audio])

  const startRun = useCallback(() => {
    void audio.startMusic()
    if (!save.tutorialSeen || (save.guideVersion ?? 0) < CURRENT_GUIDE_VERSION) {
      setPendingStart(true)
      setTutorialOpen(true)
      return
    }
    setResult(null)
    setRunId((value) => value + 1)
    setScreen('game')
  }, [audio, save.guideVersion, save.tutorialSeen])

  const beginAfterTutorial = () => {
    setSave((current) => ({
      ...current,
      tutorialSeen: true,
      guideVersion: CURRENT_GUIDE_VERSION
    }))
    setTutorialOpen(false)
    setPendingStart(false)
    setResult(null)
    setRunId((value) => value + 1)
    setScreen('game')
    void audio.startMusic()
  }

  const closeTutorial = () => {
    setTutorialOpen(false)
    setPendingStart(false)
  }

  const handleFinish = useCallback(
    (runResult: RunResult) => {
      setSave((current) => {
        const applied = applyRunResult(current, runResult)
        const key = recordKey(runResult.mode, runResult.difficulty)
        setResult({
          ...runResult,
          newRecord: applied.newRecord,
          absoluteBest: applied.save.records[key] ?? runResult.recordValue
        })
        return applied.save
      })
    },
    []
  )

  const handleCaptureReward = useCallback(
    (amount: number) => {
      setSave((current) => creditCaptureReward(current, amount))
      showToast(`奶鲨进网！奶币 +${amount}`)
    },
    [showToast]
  )

  const spendMilk = useCallback((amount: number): boolean => {
    const current = saveRef.current
    if (amount <= 0 || current.milkCoins < amount) return false
    const next = { ...current, milkCoins: current.milkCoins - amount }
    saveRef.current = next
    persistSave(next)
    setSave(next)
    return true
  }, [])

  const selectCharacter = (character: CharacterId) => {
    if (!save.unlocked.includes(character)) {
      setShopOpen(true)
      return
    }
    setSave((current) => ({ ...current, character }))
    void audio.sfx('click')
  }

  const buyNext = () => {
    const result = tryUnlockNext(save)
    if (!result.unlocked) {
      showToast('奶币还不够，再冲一浪吧。')
      return
    }
    setSave(result.save)
    showToast(`${getCharacter(result.unlocked).name} 加入冲浪队！`)
    void audio.sfx('heart')
  }

  const changeSettings = (settings: GameSettings) => {
    setSave((current) => ({ ...current, settings }))
    audio.updateSettings(settings)
  }

  const handleResetRecords = () => {
    setSave((current) => resetRecords(current))
    showToast('最高成绩已清空。')
  }

  const handleResetAll = () => {
    const fresh = resetAll()
    setSave(fresh)
    setSettingsOpen(false)
    showToast('所有进度已重新开始。')
  }

  const installPwa = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') showToast('naisurf 已加入主屏幕。')
    setInstallPrompt(null)
  }

  const restart = () => {
    setResult(null)
    setRunId((value) => value + 1)
  }

  const gameConfig: GameConfig = useMemo(
    () => ({
      mode,
      difficulty,
      character: save.character,
      seed: Date.now() & 0x7fffffff,
      reducedSpeed: save.settings.reducedSpeed
    }),
    [difficulty, mode, save.character, save.settings.reducedSpeed, runId]
  )

  if (screen === 'game') {
    return (
      <>
        <GameScreen
          key={runId}
          config={gameConfig}
          settings={save.settings}
          audio={audio}
          milkCoins={save.milkCoins}
          onFinish={handleFinish}
          onCaptureReward={handleCaptureReward}
          onSpendMilk={spendMilk}
          onExit={() => {
            setScreen('home')
            setResult(null)
          }}
          onRestart={restart}
        />
        {result && (
          <ResultOverlay
            result={result}
            newRecord={result.newRecord}
            onRestart={restart}
            onHome={() => {
              setScreen('home')
              setResult(null)
            }}
          />
        )}
        {toast && <div className="toast">{toast}</div>}
      </>
    )
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <button
          className="brand-button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="回到顶部"
        >
          <BrandMark />
        </button>
        <div className="header-actions">
          <button className="coin-counter" onClick={() => setShopOpen(true)}>
            <MilkIcon />
            <span className="pixel-font">{save.milkCoins}</span>
            <small>奶币</small>
          </button>
          <button className="nav-text" onClick={() => setGuideOpen(true)}>玩法</button>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="设置">
            <SettingsIcon />
          </button>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-badge">
              <span className="pulse-dot" />
              支持离线游玩
            </div>
            <h1>
              冲过奶浪，
              <br />
              <span>别被奶鲨追上。</span>
            </h1>
            <p>
              五位软乎乎的浪友，一片越冲越快的奶油海。
              躲礁石、捞奶滴、按住冲刺，再找机会把追来的奶鲨送进渔网。
            </p>
            <div className="hero-actions">
              <button className="primary-button hero-play" onClick={startRun}>
                <span>开始冲浪</span>
                <ArrowIcon />
              </button>
              <button className="ghost-button" onClick={startRun}>
                <span className="play-triangle">▶</span>
                直接开浪
              </button>
            </div>
            <div className="hero-meta">
              <span><strong>{totalUnlocked}</strong> / 5 浪友</span>
              <span><strong>{save.totalCaptures}</strong> 条奶鲨被捕</span>
              <span>无需登录</span>
            </div>
          </div>

          <div className="hero-stage" aria-label="角色展示">
            <div className="sun-disc" />
            <div className="cloud-bank bank-one" />
            <div className="cloud-bank bank-two" />
            <img
              className="hero-monster"
              src={`${import.meta.env.BASE_URL}assets/monster.png`}
              alt="黄色奶鲨"
            />
            <div className="character-spotlight">
              <div className="spotlight-ring" />
              <img
                className="hero-character"
                src={`${import.meta.env.BASE_URL}${selectedCharacter.showcaseImage}`}
                alt={selectedCharacter.name}
              />
              <div className="surfboard" />
            </div>
            <div className="hero-wave wave-back" />
            <div className="hero-wave wave-front" />
            <div className="monster-note">
              <span>奶鲨出没</span>
              <small>贴太近，它就会追</small>
            </div>
            <div className="character-label">
              <span className="pixel-font">{selectedCharacter.name}</span>
              <small>{selectedCharacter.ability.replace('：', ' · ')}</small>
            </div>
          </div>
        </section>

        <section className="arcade-section" id="arcade">
          <div className="section-heading">
            <div>
              <span className="tiny-label">ARCADE BOARD</span>
              <h2>选一片浪，出发</h2>
            </div>
            <button className="text-link" onClick={() => setGuideOpen(true)}>
              查看完整玩法 <span>↗</span>
            </button>
          </div>

          <div className="mode-grid">
            {MODES.map((item) => {
              const best = save.records[recordKey(item.id, difficulty)] ?? 0
              return (
                <button
                  key={item.id}
                  className={`mode-card ${mode === item.id ? 'selected' : ''}`}
                  onClick={() => {
                    setMode(item.id)
                    void audio.sfx('click')
                  }}
                >
                  <span className="mode-icon"><ModeIcon mode={item.id} /></span>
                  <span className="mode-index pixel-font">0{MODES.indexOf(item) + 1}</span>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <span className="mode-record">
                    {item.scoreLabel} <strong>{formatScore(item.id, best)}</strong>
                  </span>
                  <span className="mode-check">●</span>
                </button>
              )
            })}
          </div>

          <div className="launch-panel">
            <div className="launch-copy">
              <div className="launch-mode">
                <span className="mode-icon small"><ModeIcon mode={mode} /></span>
                <div>
                  <span className="pixel-font">{selectedMode.name}</span>
                  <small>{selectedMode.kicker}</small>
                </div>
              </div>
              <div className="difficulty-picker" aria-label="选择难度">
                {DIFFICULTIES.map((item) => (
                  <button
                    key={item.id}
                    className={difficulty === item.id ? 'active' : ''}
                    onClick={() => setDifficulty(item.id)}
                    title={item.description}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="launch-runner">
              <img
                src={`${import.meta.env.BASE_URL}${selectedCharacter.showcaseImage}`}
                alt={selectedCharacter.name}
              />
              <div>
                <small>当前浪友</small>
                <strong>{selectedCharacter.name}</strong>
                <span>{selectedCharacter.tradeoff}</span>
              </div>
            </div>
            <button className="primary-button launch-button" onClick={startRun}>
              <span>开浪</span>
              <ArrowIcon />
            </button>
          </div>
        </section>

        <section className="crew-section">
          <div className="section-heading">
            <div>
              <span className="tiny-label">MILK CREW</span>
              <h2>挑一位浪友</h2>
            </div>
            <button className="text-link" onClick={() => setShopOpen(true)}>
              浪友小卖部 <span>↗</span>
            </button>
          </div>

          <div className="character-grid">
            {CHARACTERS.map((character) => {
              const unlocked = save.unlocked.includes(character.id)
              const selected = save.character === character.id
              return (
                <button
                  key={character.id}
                  className={`character-card ${selected ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`}
                  onClick={() => selectCharacter(character.id)}
                  style={{ '--character-accent': character.accent } as React.CSSProperties}
                >
                  <span className="character-number pixel-font">
                    {String(CHARACTERS.indexOf(character) + 1).padStart(2, '0')}
                  </span>
                  <div className="character-image-wrap">
                    <img
                      src={`${import.meta.env.BASE_URL}${character.showcaseImage}`}
                      alt={character.name}
                    />
                    {!unlocked && <span className="lock-badge">锁定</span>}
                  </div>
                  <div className="character-info">
                    <h3>{character.name}</h3>
                    <small>{character.title}</small>
                    <p>{character.ability}</p>
                    <span>{character.tradeoff}</span>
                  </div>
                  {unlocked ? (
                    <span className="equip-state">{selected ? '正在冲浪' : '选择'}</span>
                  ) : (
                    <span className="unlock-price"><MilkIcon /> {character.price}</span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        <section className="monster-section">
          <div className="monster-art">
            <img
              src={`${import.meta.env.BASE_URL}assets/monster.png`}
              alt="黄色奶鲨的像素形象"
            />
            <div className="monster-stamp">FAST<br />CHOMP</div>
          </div>
          <div className="monster-copy">
            <span className="tiny-label">CRUISE BUDDY / 001</span>
            <h2>一张嘴，<br />就是催你快跑。</h2>
            <p>
              奶鲨黄澄澄的，绿色眼睛看起来还挺友好。它会先在浪边慢慢游，
              等你靠得太近才追上来，一边追一边张嘴咬合。别慌，渔网能把它留住。
            </p>
            <div className="monster-facts">
              <div><strong>潜伏</strong><span>别贴太近</span></div>
              <div><strong>追击</strong><span>冲刺能拉开</span></div>
              <div><strong>捕获</strong><span>一网只困一只</span></div>
            </div>
            <button className="secondary-button" onClick={startRun}>
              <span className="play-triangle">▶</span> 去浪里见它
            </button>
          </div>
        </section>

        <section className="tips-strip">
          <div className="tip-title">
            <span className="pixel-font">QUICK TIPS</span>
            <strong>第一次冲浪？</strong>
          </div>
          <div className="tip-item"><span>01</span><p><strong>看准浪门</strong>穿门别偏，发夹弯的连击才接得住。</p></div>
          <div className="tip-item"><span>02</span><p><strong>冲刺别乱按</strong>奶鲨逼近时再按 F 或底部闪电，留一点能量更稳。</p></div>
          <div className="tip-item"><span>03</span><p><strong>认准颜色</strong>珊瑚红“!”要躲，黄色“+”能用，紫色“−”会让浪板变沉。</p></div>
        </section>
      </main>

      <footer className="site-footer">
        <BrandMark />
        <p>原创像素冲浪小游戏 · 手机、电脑都能玩，断网也能下水</p>
        <div>
          {installPrompt && <button onClick={installPwa}>安装到设备</button>}
          <button onClick={() => setGuideOpen(true)}>玩法说明</button>
          <span>v1.2</span>
        </div>
      </footer>

      {shopOpen && (
        <ShopModal
          save={save}
          onClose={() => setShopOpen(false)}
          onBuy={buyNext}
          onSelect={selectCharacter}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          settings={save.settings}
          onChange={changeSettings}
          onClose={() => setSettingsOpen(false)}
          onResetRecords={handleResetRecords}
          onResetAll={handleResetAll}
        />
      )}
      {tutorialOpen && (
        <TutorialModal onStart={beginAfterTutorial} onClose={closeTutorial} />
      )}
      <ModeGuide open={guideOpen} onClose={() => setGuideOpen(false)} />

      {toast && <div className="toast">{toast}</div>}
      {pendingStart && !tutorialOpen && (
        <button className="resume-start" onClick={startRun}>继续开始</button>
      )}
      {nextUnlock && save.milkCoins >= nextUnlock.price && (
        <button className="unlock-nudge" onClick={() => setShopOpen(true)}>
          <MilkIcon />
          奶币够了，可以解锁 {nextUnlock.name}
          <span>→</span>
        </button>
      )}
    </div>
  )
}
