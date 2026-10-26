import { useState } from 'react'
import {
  CHARACTERS,
  MODES,
  getCharacter,
  getDifficulty,
  getMode,
  getNextUnlock,
  getUnlockProgress
} from '../data'
import type {
  CharacterId,
  GameSettings,
  RunResult,
  SaveData
} from '../types'

export function Modal({
  children,
  onClose,
  wide = false,
  titleId
}: {
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
  titleId: string
}) {
  return (
    <div className="modal-layer" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-card ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        {children}
      </section>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description: string
}) {
  return (
    <button className="setting-row" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className={`switch ${checked ? 'on' : ''}`} aria-hidden="true">
        <span />
      </span>
    </button>
  )
}

export function ShopModal({
  save,
  onClose,
  onBuy,
  onSelect
}: {
  save: SaveData
  onClose: () => void
  onBuy: () => void
  onSelect: (character: CharacterId) => void
}) {
  const next = getNextUnlock(save)
  return (
    <Modal onClose={onClose} wide titleId="shop-title">
      <div className="modal-heading">
        <div>
          <span className="tiny-label">MILK SHOP</span>
          <h2 id="shop-title">浪友小卖部</h2>
          <p>奶币都靠冲浪赚。浪友要按顺序请回来，每个人都有自己的绝活和小毛病。</p>
        </div>
        <div className="balance-card">
          <span className="milk-dot" />
          <strong className="pixel-font">{save.milkCoins}</strong>
          <small>奶币</small>
        </div>
      </div>

      <div className="shop-grid">
        {CHARACTERS.map((character, index) => {
          const owned = save.unlocked.includes(character.id)
          const isNext = next?.id === character.id
          const selected = save.character === character.id
          const blocked = !owned && !isNext
          const progress = getUnlockProgress(save, character)
          return (
            <article
              className={`shop-item ${owned ? 'owned' : ''} ${isNext ? 'next' : ''}`}
              key={character.id}
            >
              <span className="shop-order pixel-font">0{index + 1}</span>
              <img src={`${import.meta.env.BASE_URL}${character.showcaseImage}`} alt={character.name} />
              <div>
                <h3>{character.name}</h3>
                <p>{character.ability}</p>
                <small>{character.tradeoff}</small>
                {!owned && (
                  <div className="unlock-progress" aria-label={`${character.name}解锁进度`}>
                    <span className={progress.coinsMet ? 'met' : ''}>
                      奶币 {Math.min(save.milkCoins, character.price)} / {character.price}
                    </span>
                    <span className={progress.runsMet ? 'met' : ''}>
                      冲浪 {Math.min(save.totalRuns, character.unlockRequirement.runs)} / {character.unlockRequirement.runs} 局
                    </span>
                    {character.unlockRequirement.captures > 0 && (
                      <span className={progress.capturesMet ? 'met' : ''}>
                        捕鲨 {Math.min(save.totalCaptures, character.unlockRequirement.captures)} / {character.unlockRequirement.captures} 条
                      </span>
                    )}
                  </div>
                )}
              </div>
              {owned ? (
                <button
                  className={selected ? 'small-button active' : 'small-button'}
                  onClick={() => onSelect(character.id)}
                  disabled={selected}
                >
                  {selected ? '冲浪中' : '选它'}
                </button>
              ) : isNext ? (
                <button
                  className="small-button buy"
                  onClick={onBuy}
                  disabled={!progress.canUnlock}
                >
                  {progress.canUnlock
                    ? `${character.price} 奶币解锁`
                    : !progress.coinsMet
                      ? `还差 ${character.price - save.milkCoins} 奶币`
                      : '任务未完成'}
                </button>
              ) : (
                <span className="locked-note">
                  {blocked ? '先解锁前一位浪友' : '待解锁'}
                </span>
              )}
            </article>
          )
        })}
      </div>
      <p className="shop-footnote">这里只花游戏里赚到的奶币。</p>
    </Modal>
  )
}

export function SettingsModal({
  settings,
  onChange,
  onClose,
  onResetRecords,
  onResetAll
}: {
  settings: GameSettings
  onChange: (settings: GameSettings) => void
  onClose: () => void
  onResetRecords: () => void
  onResetAll: () => void
}) {
  const [confirmRecords, setConfirmRecords] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)

  return (
    <Modal onClose={onClose} titleId="settings-title">
      <div className="modal-heading">
        <div>
          <span className="tiny-label">BEACH CONTROL</span>
          <h2 id="settings-title">把浪调顺一点</h2>
        </div>
      </div>

      <div className="setting-group">
        <label className="range-row">
          <span>
            <strong>海浪音乐</strong>
            <small>{Math.round(settings.musicVolume * 100)}%</small>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.musicVolume}
            onChange={(event) =>
              onChange({ ...settings, musicVolume: Number(event.target.value) })
            }
          />
        </label>
        <label className="range-row">
          <span>
            <strong>冲浪音效</strong>
            <small>{Math.round(settings.sfxVolume * 100)}%</small>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.sfxVolume}
            onChange={(event) =>
              onChange({ ...settings, sfxVolume: Number(event.target.value) })
            }
          />
        </label>
      </div>

      <div className="setting-group">
        <Toggle
          label="显示碰撞范围"
          description="把道具范围和障碍碰撞区标出来"
          checked={settings.highVisibility}
          onChange={(highVisibility) => onChange({ ...settings, highVisibility })}
        />
        <Toggle
          label="整体慢一点"
          description="整局慢一点，心里更有底"
          checked={settings.reducedSpeed}
          onChange={(reducedSpeed) => onChange({ ...settings, reducedSpeed })}
        />
        <Toggle
          label="少点晃动"
          description="少震一点，也少闪一点"
          checked={settings.reducedMotion}
          onChange={(reducedMotion) => onChange({ ...settings, reducedMotion })}
        />
      </div>

      <div className="setting-group danger-zone">
        <button
          className="danger-link"
          onClick={() => {
            if (confirmRecords) {
              onResetRecords()
              setConfirmRecords(false)
            } else {
              setConfirmRecords(true)
            }
          }}
        >
          {confirmRecords ? '再次点击确认清除所有成绩' : '清除最高成绩'}
        </button>
        <button
          className="danger-link"
          onClick={() => {
            if (confirmAll) {
              onResetAll()
              setConfirmAll(false)
            } else {
              setConfirmAll(true)
            }
          }}
        >
          {confirmAll ? '再次点击确认清除角色与奶币' : '清除全部进度'}
        </button>
      </div>

      <div className="control-guide">
        <strong>操作方式</strong>
        <p>电脑：A/D 转向，W 加速，S 刹车，F 冲刺，空格暂停，Esc 打开暂停菜单。</p>
        <p>手机：按住左半屏或右半屏转向，底部按钮控制加速、刹车和冲刺。</p>
        <p>电脑端只认键盘，鼠标移动不会让浪板乱跑。</p>
      </div>
    </Modal>
  )
}

export function TutorialModal({
  onClose,
  onStart
}: {
  onClose: () => void
  onStart: () => void
}) {
  return (
    <Modal onClose={onClose} wide titleId="tutorial-title">
      <div className="tutorial-heading">
        <span className="tiny-label">WELCOME TO THE MILK WAVE</span>
        <h2 id="tutorial-title">下水前，先记这四件事</h2>
      </div>
      <div className="tutorial-grid">
        <article>
          <span className="tutorial-number pixel-font">01</span>
          <div className="tutorial-icon">↔</div>
          <h3>先控方向与速度</h3>
          <p>电脑用 A/D 转向、W/S 加减速；手机按住左右半屏转向，再用底部按钮控速。</p>
        </article>
        <article>
          <span className="tutorial-number pixel-font">02</span>
          <div className="tutorial-icon">♥</div>
          <h3>记住五条命</h3>
          <p>撞障碍扣 1 命；撞到奶鲨或被它追上扣 2 命。没有接触就不会掉血。</p>
        </article>
        <article>
          <span className="tutorial-number pixel-font">03</span>
          <div className="tutorial-icon buff-icon">＋</div>
          <h3>分清道具</h3>
          <p>黄色“+”是增益，紫色“−”是黏奶泡；看到珊瑚红“!”就赶紧让开。</p>
        </article>
        <article>
          <span className="tutorial-number pixel-font">04</span>
          <div className="tutorial-icon net-icon">网</div>
          <h3>把奶鲨引进网</h3>
          <p>只有正在追你的奶鲨能落网。它离你不到 24 米时，贴着渔网冲过去。</p>
        </article>
      </div>
      <div className="tutorial-actions">
        <button className="primary-button" onClick={onStart}>记住了，去冲浪</button>
        <button className="text-button muted" onClick={onClose}>先在岸边看看</button>
      </div>
    </Modal>
  )
}

const RULE_OBJECTS = [
  {
    icon: 'assets/objects/rock.svg',
    category: '障碍',
    name: '礁石 / 浮标 / 对手',
    detail: '看到珊瑚红“!”就让开。撞一次扣 1 命，泡泡盾能替你挡一次。'
  },
  {
    icon: 'assets/objects/coin.svg',
    category: '中性',
    name: '奶滴',
    detail: '顺手捞起来就好。每枚奶滴会立刻变成 1 枚永久奶币。'
  },
  {
    icon: 'assets/objects/heart.svg',
    category: 'Buff',
    name: '爱心',
    detail: '残血时回 1 条命；满 5 条命再捡，会立刻换成 3 枚奶币。'
  },
  {
    icon: 'assets/objects/boost.svg',
    category: 'Buff',
    name: '闪电',
    detail: '补 30 点冲刺能量。电脑按住 F，手机按住底部闪电。'
  },
  {
    icon: 'assets/objects/shield.svg',
    category: 'Buff',
    name: '救生圈',
    detail: '获得 8 秒泡泡盾，只能挡一次障碍，挡不住奶鲨。'
  },
  {
    icon: 'assets/objects/slime.svg',
    category: 'Debuff',
    name: '黏奶泡',
    detail: '沾上后 3 秒里速度和转向都会变慢。再撞一次只刷新时间，不会叠加。'
  },
  {
    icon: 'assets/net.svg',
    category: '特殊',
    name: '渔网',
    detail: '只在奶鲨追击时出现。它离你不到 24 米，你又贴住网中心，这一网就成。'
  }
]

export function RulesQuickReference({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} wide titleId="rules-title">
      <div className="modal-heading">
        <div>
          <span className="tiny-label">WAVE RULES</span>
          <h2 id="rules-title">规则速查</h2>
          <p>所有模式都从 5 条命开始。只有真的撞上才会掉血。</p>
        </div>
      </div>
      <div className="rule-controls-grid">
        <article>
          <strong>电脑</strong>
          <p><kbd>A</kbd><kbd>D</kbd> 转向　<kbd>W</kbd> 加速　<kbd>S</kbd> 刹车</p>
          <p><kbd>F</kbd> 冲刺　<kbd>Space</kbd> 暂停　<kbd>Esc</kbd> 暂停菜单</p>
        </article>
        <article>
          <strong>手机</strong>
          <p>长按左半屏向左、右半屏向右，松手平滑回中。</p>
          <p>按住底部“加速 / 刹车 / 冲刺”按钮进行操作。</p>
        </article>
      </div>
      <div className="rule-list">
        {RULE_OBJECTS.map((item) => (
          <article key={item.name}>
            <img src={`${import.meta.env.BASE_URL}${item.icon}`} alt="" />
            <div>
              <span>{item.category}</span>
              <strong>{item.name}</strong>
              <p>{item.detail}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="monster-rule-card">
        <strong>奶鲨怎么追，怎么抓</strong>
        <p>奶鲨先在浪边慢慢游。没撞上时，你横向靠近到约 0.62 以内，它就会追；直接撞上或让它追到零距离，会扣 2 命，它也会停下。</p>
        <p>渔网只在追击时出现。它离你不到 24 米，你又贴近网中心，就能抓住当前这条奶鲨并拿到 10 枚奶币。下一段浪里还会遇到新的奶鲨。</p>
        <strong className="rule-subhead">复活与极限模式</strong>
        <p>奶滴、满血爱心和捕获奖励会立即存进奶币余额；距离奖励在结算时再加一次。普通模式每局最多复活 3 次，依次花 100、200、300 枚奶币，复活后回 3 条命并保护 1 秒。极限模式不能复活。</p>
      </div>
    </Modal>
  )
}

async function loadCardImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(undefined)
    image.src = src
  })
}

function drawShareCard(
  result: RunResult,
  newRecord: boolean
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)

  ctx.fillStyle = '#fff3cc'
  ctx.fillRect(0, 0, 1080, 1440)
  ctx.fillStyle = '#ffd85c'
  ctx.beginPath()
  ctx.arc(850, 240, 170, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#55cab6'
  ctx.fillRect(0, 930, 1080, 510)
  ctx.fillStyle = '#249b9d'
  ctx.beginPath()
  ctx.moveTo(0, 1010)
  for (let x = 0; x <= 1080; x += 100) {
    ctx.quadraticCurveTo(x + 50, 960, x + 100, 1010)
  }
  ctx.lineTo(1080, 1440)
  ctx.lineTo(0, 1440)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = '#443526'
  ctx.lineWidth = 12
  ctx.strokeRect(28, 28, 1024, 1384)
  ctx.fillStyle = '#443526'
  ctx.font = '700 30px "Microsoft YaHei", sans-serif'
  ctx.fillText('NAISURF / 奶浪冲浪祭', 76, 112)

  ctx.font = '700 92px "Microsoft YaHei", sans-serif'
  ctx.fillText(newRecord ? '新纪录！' : '冲浪归来', 76, 260)
  ctx.font = '700 42px "Microsoft YaHei", sans-serif'
  ctx.fillText(getMode(result.mode).name, 80, 336)
  ctx.font = '500 30px "Microsoft YaHei", sans-serif'
  ctx.fillText(`${getDifficulty(result.difficulty).name} · ${getCharacter(result.character).name}`, 80, 384)

  ctx.fillStyle = '#ff785d'
  ctx.fillRect(70, 460, 880, 210)
  ctx.fillStyle = '#fff8dc'
  ctx.font = '700 98px "Microsoft YaHei", sans-serif'
  ctx.fillText(result.recordLabel, 100, 598)

  ctx.fillStyle = '#443526'
  ctx.font = '600 30px "Microsoft YaHei", sans-serif'
  ctx.fillText(`奶滴 ${result.coins}`, 80, 748)
  ctx.fillText(`捕获奶鲨 ${result.captures}`, 370, 748)
  ctx.fillText(`奶币 +${result.earnedMilk}`, 750, 748)

  return loadCardImage(
    `${import.meta.env.BASE_URL}${getCharacter(result.character).showcaseImage}`
  ).then((image) => {
    if (image) ctx.drawImage(image, 620, 800, 300, 375)
    ctx.fillStyle = '#fff5ce'
    ctx.font = '700 28px "Microsoft YaHei", sans-serif'
    ctx.fillText('下一浪，试试把奶鲨留在网里。', 78, 1230)
    ctx.font = '500 22px "Microsoft YaHei", sans-serif'
    ctx.fillText('naisurf · PLAY OFFLINE, SURF ANYWHERE', 78, 1325)
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  })
}

export function ResultOverlay({
  result,
  newRecord,
  onRestart,
  onHome
}: {
  result: RunResult
  newRecord: boolean
  onRestart: () => void
  onHome: () => void
}) {
  const [sharing, setSharing] = useState(false)

  const share = async () => {
    setSharing(true)
    try {
      const blob = await drawShareCard(result, newRecord)
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'naisurf-score.png'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    } finally {
      setSharing(false)
    }
  }

  const reasonText =
    result.reason === 'finished'
      ? '你准时抵达了终点。'
      : result.reason === 'caught'
        ? '奶鲨这一下太狠，生命耗尽了。'
        : '冲浪板翻了，再试一次会更稳。'

  return (
    <div className="result-layer">
      <section className="result-card" aria-labelledby="result-title">
        {newRecord && <div className="record-ribbon">NEW RECORD</div>}
        <span className="tiny-label">{result.reason === 'finished' ? 'SHORE REACHED' : 'WAVE OVER'}</span>
        <h2 id="result-title">{newRecord ? '新纪录！' : '这一浪结束啦'}</h2>
        <p>{reasonText}</p>
        <div className="result-score">
          <small>{getMode(result.mode).scoreLabel}</small>
          <strong>{result.recordLabel}</strong>
        </div>
        <div className="result-grid">
          <div><span>奶滴</span><strong>{result.coins}</strong></div>
          <div><span>捕获奶鲨</span><strong>{result.captures}</strong></div>
          <div><span>即时奶币</span><strong>+{result.instantMilk}</strong></div>
          <div><span>距离结算</span><strong>+{result.settlementMilk}</strong></div>
          <div><span>本局合计</span><strong>+{result.earnedMilk}</strong></div>
        </div>
        {!result.shouldCountRecord && (
          <p className="result-note">隐藏奶浪已触发，本局不计入最高成绩。</p>
        )}
        <div className="result-actions">
          <button className="primary-button" onClick={onRestart}>再来一浪</button>
          <button className="secondary-button" onClick={share} disabled={sharing}>
            {sharing ? '正在制作…' : '下载成绩卡'}
          </button>
        </div>
        <button className="text-button muted" onClick={onHome}>回到岸边</button>
      </section>
    </div>
  )
}

export function ModeGuide({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null
  return (
    <Modal onClose={onClose} titleId="mode-guide-title">
      <div className="modal-heading">
        <div>
          <span className="tiny-label">MODE MANUAL</span>
          <h2 id="mode-guide-title">选一片浪，出发</h2>
        </div>
      </div>
      <div className="mode-guide-list">
        {MODES.map((mode) => (
          <article key={mode.id}>
            <span>{mode.icon}</span>
            <div>
              <h3>{mode.name}</h3>
              <p>{mode.description}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="rule-controls-grid">
        <article>
          <strong>电脑操作</strong>
          <p><kbd>A</kbd><kbd>D</kbd> 转向　<kbd>W</kbd> 加速　<kbd>S</kbd> 刹车</p>
          <p><kbd>F</kbd> 冲刺　<kbd>Space</kbd> 暂停　<kbd>Esc</kbd> 暂停菜单</p>
        </article>
        <article>
          <strong>手机操作</strong>
          <p>长按左半屏或右半屏转向，松手后平滑回中。</p>
          <p>按住底部加速、刹车或冲刺按钮，避免长按拖动造成跳变。</p>
        </article>
      </div>
      <div className="rule-list">
        {RULE_OBJECTS.map((item) => (
          <article key={`guide-${item.name}`}>
            <img src={`${import.meta.env.BASE_URL}${item.icon}`} alt="" />
            <div>
              <span>{item.category}</span>
              <strong>{item.name}</strong>
              <p>{item.detail}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="guide-note">
        <strong>奶鲨只会在无尽浪潮和极限模式出现。</strong>
        <p>它先在浪边潜伏。没撞上时，横向距离进入约 0.62 才会追；撞上或被追到零距离会扣 2 命，并让它停下。渔网只在追击时出现，抓住当前奶鲨能拿到 10 枚奶币。</p>
        <p>奶滴、满血爱心和捕获奖励会立即进入永久奶币余额。普通模式每局最多复活 3 次，费用依次是 100、200、300 枚奶币；极限模式不能复活。</p>
        <p>后续浪友需要同时满足奶币和累计任务。已解锁的角色不会因为任务调整重新上锁。</p>
        <p>电脑：A/D 转向、W 加速、S 刹车、F 冲刺。手机：按住左右半屏转向，底部按钮控制加速、刹车和冲刺。</p>
      </div>
    </Modal>
  )
}
