import { CHARACTERS } from '../data'
import type { CharacterId, GameSettings, GameState, WorldObject } from '../types'
import { VIEW_DISTANCE } from './engine'

let WIDTH = 640
let HEIGHT = 360
let HORIZON = 164
let CANVAS_SCALE = 1

export interface RenderAssets {
  characters: Partial<Record<CharacterId, HTMLImageElement>>
  monster?: HTMLImageElement
  net?: HTMLImageElement
}

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`.replace(/([^:]\/)\/+/g, '$1')
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`无法加载素材: ${url}`))
    image.src = url
  })
}

export async function loadRenderAssets(): Promise<RenderAssets> {
  const characterEntries = await Promise.all(
    CHARACTERS.map(async (character) => {
      const image = await loadImage(assetUrl(character.image))
      return [character.id, image] as const
    })
  )
  const [monster, net] = await Promise.all([
    loadImage(assetUrl('assets/monster.svg')),
    loadImage(assetUrl('assets/net.svg'))
  ])
  return {
    characters: Object.fromEntries(characterEntries),
    monster,
    net
  }
}

function project(x: number, z: number): { x: number; y: number; scale: number; t: number } {
  const t = Math.max(0, Math.min(1, 1 - z / VIEW_DISTANCE))
  const eased = t ** 1.45
  return {
    x: WIDTH / 2 + x * (WIDTH * 0.21 + eased * WIDTH * 0.23),
    y: HORIZON + eased * (HEIGHT - HORIZON - 8),
    scale: (0.13 + eased * 1.15) * CANVAS_SCALE,
    t
  }
}

function pathPolygon(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  fill: string,
  stroke?: string,
  lineWidth = 2
): void {
  if (!points.length) return
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let index = 1; index < points.length; index++) {
    ctx.lineTo(points[index][0], points[index][1])
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, state: GameState): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, HORIZON + 30)
  gradient.addColorStop(0, '#ffd0a4')
  gradient.addColorStop(0.55, '#ffedc7')
  gradient.addColorStop(1, '#a8e5cf')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HORIZON + 20)

  ctx.fillStyle = '#ff9e72'
  const sunSize = Math.min(WIDTH, HEIGHT) * 0.105
  ctx.beginPath()
  ctx.arc(WIDTH * 0.82, HEIGHT * 0.19, sunSize, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 248, 208, .24)'
  ctx.beginPath()
  ctx.arc(WIDTH * 0.82, HEIGHT * 0.19, sunSize * 1.45, 0, Math.PI * 2)
  ctx.fill()

  const drift = (state.distance * 1.8) % (WIDTH + 180)
  drawCloud(ctx, ((WIDTH * 0.1 - drift * 0.12) % (WIDTH + 180)) - 100, HEIGHT * 0.13, 1)
  drawCloud(ctx, ((WIDTH * 0.44 - drift * 0.08) % (WIDTH + 260)) - 50, HEIGHT * 0.25, 0.72)
  drawCloud(ctx, ((WIDTH * 0.84 - drift * 0.16) % (WIDTH + 210)) - 80, HEIGHT * 0.09, 0.52)

  const sea = ctx.createLinearGradient(0, HORIZON, 0, HEIGHT)
  sea.addColorStop(0, '#7dd8c4')
  sea.addColorStop(0.45, '#3cb8ad')
  sea.addColorStop(1, '#228f9a')
  ctx.fillStyle = sea
  ctx.fillRect(0, HORIZON, WIDTH, HEIGHT - HORIZON)

  ctx.fillStyle = '#fff1c5'
  for (let index = 0; index < 16; index++) {
    const t = index / 16
    const y = HORIZON + (HEIGHT - HORIZON) * t ** 1.35
    const width = 40 + t * 510
    const offset = Math.sin(state.distance * 0.15 + index) * (8 + t * 28)
    ctx.globalAlpha = 0.13 + t * 0.2
    ctx.fillRect(WIDTH / 2 - width / 2 + offset, y, 18 + t * 28, 2 + t * 3)
  }
  ctx.globalAlpha = 1

  const horizonDrift = (state.distance * 2.1) % 100
  pathPolygon(
    ctx,
    [
      [0, HORIZON + 2],
      [65 + horizonDrift * 0.2, HORIZON - 22],
      [128, HORIZON + 4],
      [155, HORIZON - 6],
      [0, 170]
    ],
    '#48a889'
  )
  pathPolygon(
    ctx,
    [
      [WIDTH - 170, HORIZON + 4],
      [WIDTH - 110, HORIZON - 23],
      [WIDTH - 35, HORIZON + 2],
      [WIDTH - 6, HORIZON - 4],
      [WIDTH - 160, HORIZON + 6]
    ],
    '#48a889'
  )

  ctx.strokeStyle = 'rgba(255, 249, 213, .7)'
  ctx.lineWidth = 2
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(WIDTH / 2 + side * WIDTH * 0.147, HORIZON)
    ctx.lineTo(WIDTH / 2 + side * WIDTH * 0.49, HEIGHT)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(255, 248, 217, .7)'
  for (let index = 0; index < 8; index++) {
    const phase = (state.distance * 2.4 + index * 47) % (WIDTH + 80)
    const y = HORIZON + 46 + ((index * 37) % Math.max(70, HEIGHT - HORIZON - 60))
    const x = (phase + index * 93) % (WIDTH + 80)
    ctx.fillRect(x - WIDTH / 2, y, 25, 3)
    ctx.fillRect(x - WIDTH / 2 + 12, y + 5, 13, 2)
  }
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillStyle = 'rgba(255, 249, 226, .72)'
  ctx.fillRect(0, 10, 76, 15)
  ctx.fillRect(8, 4, 21, 14)
  ctx.fillRect(28, 0, 27, 20)
  ctx.fillRect(52, 7, 18, 12)
  ctx.fillStyle = 'rgba(255, 166, 119, .2)'
  ctx.fillRect(12, 22, 58, 4)
  ctx.restore()
}

function drawCoin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  time: number
): void {
  const bob = Math.sin(time * 5 + x) * 2 * scale
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y - bob))
  ctx.scale(scale, scale)
  ctx.fillStyle = 'rgba(255, 246, 194, .38)'
  ctx.beginPath()
  ctx.arc(0, 0, 13, 0, Math.PI * 2)
  ctx.fill()
  pathPolygon(
    ctx,
    [
      [0, -10],
      [7, -3],
      [5, 8],
      [0, 12],
      [-5, 8],
      [-7, -3]
    ],
    '#fff4c7',
    '#7c5b35',
    1.5
  )
  ctx.fillStyle = '#fffdf0'
  ctx.fillRect(-3, -5, 2, 4)
  ctx.restore()
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  object: WorldObject,
  x: number,
  y: number,
  scale: number,
  time: number,
  highVisibility: boolean
): void {
  const size = 12 * scale
  const bob = Math.sin(time * 6 + object.wobble) * 2 * scale
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y - 14 * scale - bob))
  ctx.scale(scale, scale)
  if (highVisibility) {
    ctx.strokeStyle = '#fff8de'
    ctx.lineWidth = 2
    ctx.strokeRect(-11, -14, 22, 24)
  }
  if (object.kind === 'coin') {
    ctx.restore()
    drawCoin(ctx, x, y - 14 * scale - bob, scale, time)
    return
  }
  if (object.kind === 'heart') {
    ctx.fillStyle = '#ff6f68'
    ctx.strokeStyle = '#6d3441'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 9)
    ctx.bezierCurveTo(-17, -3, -11, -15, 0, -7)
    ctx.bezierCurveTo(11, -15, 17, -3, 0, 9)
    ctx.fill()
    ctx.stroke()
  } else if (object.kind === 'boost') {
    pathPolygon(
      ctx,
      [
        [2, -15],
        [-8, 1],
        [0, 1],
        [-3, 15],
        [10, -3],
        [2, -3]
      ],
      '#ffe26a',
      '#74572e',
      2
    )
  } else if (object.kind === 'shield') {
    ctx.fillStyle = '#f5c751'
    ctx.strokeStyle = '#493829'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(-9, -7, 5, 0, Math.PI * 2)
    ctx.arc(9, -7, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ff7c62'
    ctx.beginPath()
    ctx.arc(0, 0, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff2cf'
    ctx.beginPath()
    ctx.arc(0, 0, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#493829'
    ctx.fillRect(-4, -4, 2, 2)
    ctx.fillRect(2, -4, 2, 2)
  }
  ctx.restore()
  if (highVisibility && size > 4) {
    ctx.strokeStyle = 'rgba(255, 244, 205, .55)'
    ctx.strokeRect(x - size, y - size * 2, size * 2, size * 2)
  }
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  object: WorldObject,
  x: number,
  y: number,
  scale: number,
  time: number,
  highVisibility: boolean
): void {
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.scale(scale, scale)
  if (highVisibility) {
    ctx.strokeStyle = 'rgba(255, 240, 193, .72)'
    ctx.lineWidth = 2
    ctx.strokeRect(-24, -32, 48, 36)
  }
  if (object.kind === 'rock') {
    pathPolygon(
      ctx,
      [
        [-24, 0],
        [-18, -19],
        [-7, -30],
        [12, -27],
        [22, -13],
        [25, 0]
      ],
      '#725341',
      '#3f332c',
      2.5
    )
    ctx.fillStyle = '#a77a58'
    ctx.fillRect(-10, -22, 12, 5)
    ctx.fillStyle = '#4e9e77'
    ctx.fillRect(-2, -30, 8, 5)
  } else if (object.kind === 'buoy') {
    ctx.fillStyle = '#ff755b'
    ctx.strokeStyle = '#5a3e33'
    ctx.lineWidth = 2
    ctx.fillRect(-9, -26, 18, 26)
    ctx.strokeRect(-9, -26, 18, 26)
    ctx.fillStyle = '#fff1d0'
    ctx.fillRect(-9, -17, 18, 6)
    ctx.fillStyle = '#5a3e33'
    ctx.fillRect(-5, -33, 10, 7)
  } else {
    const bob = Math.sin(time * 4 + object.wobble) * 2
    ctx.translate(0, bob)
    pathPolygon(
      ctx,
      [
        [-14, 0],
        [-11, -23],
        [-4, -33],
        [8, -31],
        [13, -16],
        [16, 0]
      ],
      '#f7c14c',
      '#4a392d',
      2
    )
    ctx.fillStyle = '#173e3e'
    ctx.fillRect(-6, -23, 3, 4)
    ctx.fillRect(4, -23, 3, 4)
    ctx.fillStyle = '#ff7960'
    ctx.fillRect(-14, 0, 30, 3)
  }
  ctx.restore()
}

function drawGate(
  ctx: CanvasRenderingContext2D,
  object: WorldObject,
  x: number,
  y: number,
  scale: number
): void {
  const width = 54 * scale
  const height = 66 * scale
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.strokeStyle = '#fff1bd'
  ctx.fillStyle = '#ff8a68'
  ctx.lineWidth = Math.max(2, 5 * scale)
  ctx.fillRect(-width, -height, 8 * scale, height)
  ctx.fillRect(width - 8 * scale, -height, 8 * scale, height)
  ctx.strokeRect(-width, -height, width * 2, 5 * scale)
  ctx.fillStyle = 'rgba(255, 245, 194, .4)'
  ctx.fillRect(-width + 8 * scale, -height + 8 * scale, width * 2 - 16 * scale, 3 * scale)
  ctx.restore()
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  object: WorldObject,
  settings: GameSettings
): void {
  const projected = project(object.x, object.z)
  if (object.kind === 'gate') {
    drawGate(ctx, object, projected.x, projected.y, projected.scale)
  } else if (
    object.kind === 'coin' ||
    object.kind === 'heart' ||
    object.kind === 'boost' ||
    object.kind === 'shield'
  ) {
    drawItem(
      ctx,
      object,
      projected.x,
      projected.y,
      projected.scale,
      state.elapsed,
      settings.highVisibility
    )
  } else {
    drawObstacle(
      ctx,
      object,
      projected.x,
      projected.y,
      projected.scale,
      state.elapsed,
      settings.highVisibility
    )
  }
}

function drawNet(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: RenderAssets
): void {
  if (state.net.state !== 'armed' && state.net.state !== 'spent') return
  const projected = project(state.net.x, state.net.z)
  if (projected.y < HORIZON || projected.y > HEIGHT + 30) return
  const scale = projected.scale * (state.net.state === 'spent' ? 1.06 : 1)
  ctx.save()
  ctx.globalAlpha = state.net.state === 'spent' ? 0.65 : 1
  if (assets.net) {
    ctx.drawImage(
      assets.net,
      Math.round(projected.x - 44 * scale),
      Math.round(projected.y - 70 * scale),
      Math.round(88 * scale),
      Math.round(66 * scale)
    )
  }
  if (state.net.state === 'armed') {
    ctx.fillStyle = 'rgba(255, 244, 186, .22)'
    ctx.fillRect(projected.x - 34 * scale, projected.y - 6 * scale, 68 * scale, 3 * scale)
  }
  ctx.restore()
}

function drawLurkingMonster(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: RenderAssets
): void {
  if (state.monster.state !== 'lurking' || !assets.monster) return
  const projected = project(state.monster.x, state.monster.z)
  const scale = projected.scale * 1.08
  ctx.save()
  ctx.globalAlpha = 0.88
  ctx.drawImage(
    assets.monster,
    Math.round(projected.x - 45 * scale),
    Math.round(projected.y - 88 * scale),
    Math.round(90 * scale),
    Math.round(90 * scale)
  )
  ctx.restore()

  if (state.monster.z < 38) {
    const bubbleY = projected.y - 91 * scale
    ctx.fillStyle = '#fff8dc'
    ctx.strokeStyle = '#563e2e'
    ctx.lineWidth = 2
    ctx.fillRect(projected.x - 28, bubbleY - 15, 56, 18)
    ctx.strokeRect(projected.x - 28, bubbleY - 15, 56, 18)
    ctx.fillStyle = '#4a3627'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('靠过来…', projected.x, bubbleY - 2)
  }
}

function drawChasingMonster(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: RenderAssets
): void {
  if (state.monster.state !== 'chasing' || !assets.monster) return
  const closeness = Math.max(0.08, Math.min(1, 1 - state.monster.gap / 82))
  const size = (76 + closeness * 138) * Math.max(0.82, CANVAS_SCALE)
  const x = WIDTH / 2 + state.monster.x * WIDTH * 0.2 + Math.sin(state.elapsed * 4) * 8
  const y = HEIGHT - size * 0.32 + (1 - closeness) * 34
  ctx.save()
  ctx.globalAlpha = 0.38 + closeness * 0.62
  ctx.drawImage(assets.monster, x - size / 2, y - size, size, size)
  ctx.restore()

  if (closeness > 0.6) {
    const vignette = ctx.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2,
      WIDTH * 0.25,
      WIDTH / 2,
      HEIGHT / 2,
      WIDTH * 0.65
    )
    vignette.addColorStop(0, 'rgba(255,255,255,0)')
    vignette.addColorStop(1, `rgba(255, 220, 165, ${(closeness - 0.6) * 0.5})`)
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: RenderAssets
): void {
  const projected = project(state.playerX, 0)
  const y = Math.min(HEIGHT - 12, projected.y + 8)
  const baseSize = state.secretEventActive ? 82 : 57
  const size = baseSize * Math.max(0.88, CANVAS_SCALE)
  const lean = Math.max(-0.18, Math.min(0.18, state.playerVelocity * 0.12))
  ctx.save()
  ctx.translate(projected.x, y)
  ctx.rotate(lean)
  ctx.fillStyle = 'rgba(20, 75, 81, .24)'
  ctx.beginPath()
  ctx.ellipse(0, 4, size * 0.38, size * 0.11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ff8064'
  ctx.strokeStyle = '#533828'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-size * 0.42, -2)
  ctx.quadraticCurveTo(0, -12, size * 0.44, -1)
  ctx.quadraticCurveTo(0, 8, -size * 0.42, -2)
  ctx.fill()
  ctx.stroke()

  const image =
    assets.characters[state.secretEventActive ? 'frog' : state.config.character]
  if (image) {
    ctx.drawImage(image, -size * 0.35, -size * 0.92, size * 0.7, size * 0.88)
  }
  if (state.shield > 0) {
    ctx.strokeStyle = 'rgba(255, 248, 202, .9)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, -size * 0.33, size * 0.48, 0, Math.PI * 2)
    ctx.stroke()
  }
  if (state.boosting) {
    ctx.fillStyle = 'rgba(255, 238, 151, .7)'
    for (let index = 0; index < 4; index++) {
      ctx.fillRect(-24 - index * 10, -18 + index * 11, 18, 3)
    }
  }
  ctx.restore()
}

function drawOverlayEffects(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  settings: GameSettings
): void {
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 248, 214, ${state.flash * 0.36})`
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }
  if (state.invulnerability > 0 && Math.floor(state.elapsed * 12) % 2 === 0) {
    ctx.strokeStyle = 'rgba(255, 247, 218, .55)'
    ctx.lineWidth = 4
    ctx.strokeRect(8, 8, WIDTH - 16, HEIGHT - 16)
  }
  if (state.secretEventActive) {
    ctx.fillStyle = 'rgba(30, 73, 71, .2)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.fillStyle = '#fff3bb'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('隐藏奶浪：本局不计纪录', WIDTH / 2, 32)
  }
  if (settings.highVisibility) {
    ctx.strokeStyle = 'rgba(255, 247, 218, .45)'
    ctx.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4)
  }
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: RenderAssets,
  settings: GameSettings
): void {
  WIDTH = ctx.canvas.width
  HEIGHT = ctx.canvas.height
  const landscape = WIDTH / HEIGHT > 1
  HORIZON = HEIGHT * (landscape ? 0.455 : 0.32)
  CANVAS_SCALE = Math.max(0.88, Math.min(1.12, WIDTH / 640))
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.imageSmoothingEnabled = false

  if (!settings.reducedMotion) {
    const shakeX = state.shake > 0 ? Math.sin(state.elapsed * 67) * state.shake * 5 : 0
    const shakeY = state.shake > 0 ? Math.cos(state.elapsed * 53) * state.shake * 3 : 0
    ctx.save()
    ctx.translate(shakeX, shakeY)
  }

  drawBackground(ctx, state)
  const sorted = [...state.objects].sort((a, b) => b.z - a.z)
  for (const object of sorted) drawObject(ctx, state, object, settings)
  drawNet(ctx, state, assets)
  drawLurkingMonster(ctx, state, assets)
  drawChasingMonster(ctx, state, assets)
  drawPlayer(ctx, state, assets)
  drawOverlayEffects(ctx, state, settings)

  if (!settings.reducedMotion) ctx.restore()
}

export { WIDTH as GAME_WIDTH, HEIGHT as GAME_HEIGHT }
