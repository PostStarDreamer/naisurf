import { useState } from 'react'
import {
  CHARACTERS,
  MODES,
  getCharacter,
  getDifficulty,
  getMode,
  getNextUnlock
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
          <p>每条奶浪都能赚到奶币。角色按顺序解锁，能力带一点小代价。</p>
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
          return (
            <article
              className={`shop-item ${owned ? 'owned' : ''} ${isNext ? 'next' : ''}`}
              key={character.id}
            >
              <span className="shop-order pixel-font">0{index + 1}</span>
              <img src={`${import.meta.env.BASE_URL}${character.image}`} alt={character.name} />
              <div>
                <h3>{character.name}</h3>
                <p>{character.ability}</p>
                <small>{character.tradeoff}</small>
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
                  disabled={save.milkCoins < character.price}
                >
                  {character.price} 奶币解锁
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
      <p className="shop-footnote">仅使用游玩获得的奶币，不含付费购买。</p>
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
          <h2 id="settings-title">冲浪设置</h2>
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
          label="高可见度"
          description="标出道具吸附范围和障碍碰撞区"
          checked={settings.highVisibility}
          onChange={(highVisibility) => onChange({ ...settings, highVisibility })}
        />
        <Toggle
          label="降低速度"
          description="整体速度约降低 15%，所有模式可用"
          checked={settings.reducedSpeed}
          onChange={(reducedSpeed) => onChange({ ...settings, reducedSpeed })}
        />
        <Toggle
          label="减少动态"
          description="关闭屏幕震动和部分闪动"
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
        <p>键盘：方向键/WASD 转向与速度，F 或 Shift 冲刺，空格暂停。</p>
        <p>触屏：在画面上拖动转向，底部按钮刹车与冲刺。</p>
        <p>手柄：左摇杆/十字键转向，扳机加减速，A 键冲刺。</p>
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
        <h2 id="tutorial-title">三件冲浪要紧事</h2>
      </div>
      <div className="tutorial-grid">
        <article>
          <span className="tutorial-number pixel-font">01</span>
          <div className="tutorial-icon">↔</div>
          <h3>先控方向</h3>
          <p>左右拖拽或按方向键，从障碍物空档穿过去。奶滴会自动吸近。</p>
        </article>
        <article>
          <span className="tutorial-number pixel-font">02</span>
          <div className="tutorial-icon">ϟ</div>
          <h3>冲刺拉开距离</h3>
          <p>F、Shift 或触屏闪电按钮消耗能量，既能逃走，也能冲过危险区。</p>
        </article>
        <article>
          <span className="tutorial-number pixel-font">03</span>
          <div className="tutorial-icon net-icon">╳</div>
          <h3>把奶怪引进网</h3>
          <p>奶怪靠近时，贴着海面渔网从另一侧掠过，就能永远困住这一只。</p>
        </article>
      </div>
      <div className="tutorial-actions">
        <button className="primary-button" onClick={onStart}>明白了，开始冲浪</button>
        <button className="text-button muted" onClick={onClose}>先看看岸边</button>
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
  ctx.fillText(`捕获奶怪 ${result.captures}`, 370, 748)
  ctx.fillText(`奶币 +${result.earnedMilk}`, 750, 748)

  return loadCardImage(
    `${import.meta.env.BASE_URL}${getCharacter(result.character).image}`
  ).then((image) => {
    if (image) ctx.drawImage(image, 620, 800, 300, 375)
    ctx.fillStyle = '#fff5ce'
    ctx.font = '700 28px "Microsoft YaHei", sans-serif'
    ctx.fillText('下一次，把奶怪也留在网里。', 78, 1230)
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
        ? '奶怪追了上来，但你留下了很漂亮的浪花。'
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
          <div><span>捕获奶怪</span><strong>{result.captures}</strong></div>
          <div><span>获得奶币</span><strong>+{result.earnedMilk}</strong></div>
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
          <h2 id="mode-guide-title">四种浪法</h2>
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
      <div className="guide-note">
        <strong>奶怪只出现在无尽浪潮和奶滴收集。</strong>
        <p>它先在海面一侧潜伏，只有你从旁边经过才会醒来。渔网每隔一段浪程浮出一次，把追击中的奶怪带近并从另一侧擦过，就能捕获当前这一只。</p>
      </div>
    </Modal>
  )
}
