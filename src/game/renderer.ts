import { CHARACTERS } from '../data'
import type { CharacterId, GameSettings, GameState, WorldObject } from '../types'
import { VIEW_DISTANCE } from './engine'
import { OCEAN_WAVE_CYCLES, getWaveFlowPhase } from './visual'

let WIDTH = 640
let HEIGHT = 360
let HORIZON = 164
let CANVAS_SCALE = 1

export interface RenderAssets {
  surfCharacters: Partial<Record<CharacterId, HTMLImageElement>>
  objects: Partial<Record<WorldObject['kind'], HTMLImageElement>>
  monsterLure?: HTMLImageElement
  monsterCapture?: HTMLImageElement
  monsterRecoil?: HTMLImageElement
  monsterChaseClosed?: HTMLImageElement
  monsterChaseOpen?: HTMLImageElement
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
  const [surfEntries, objectEntries, monsterLure, monsterCapture, monsterRecoil, monsterChaseClosed, monsterChaseOpen, net] =
    await Promise.all([
      Promise.all(
        CHARACTERS.map(async (character) => {
          const image = await loadImage(assetUrl(character.surfImage))
          return [character.id, image] as const
        })
      ),
      Promise.all(
        (
          [
            ['rock', 'assets/objects/rock.svg'],
            ['buoy', 'assets/objects/buoy.svg'],
            ['surfer', 'assets/objects/rival.svg'],
            ['coin', 'assets/objects/coin.svg'],
            ['heart', 'assets/objects/heart.svg'],
            ['boost', 'assets/objects/boost.svg'],
            ['shield', 'assets/objects/shield.svg'],
            ['slime', 'assets/objects/slime.svg']
          ] as const
        ).map(async ([kind, path]) => {
          const image = await loadImage(assetUrl(path))
          return [kind, image] as const
        })
      ),
      loadImage(assetUrl('assets/monster-lure-three-quarter.png')),
      loadImage(assetUrl('assets/monster-capture-back-three-quarter.png')),
      loadImage(assetUrl('assets/monster-recoil-three-quarter.png')),
      loadImage(assetUrl('assets/monster-chase-closed-front.png')),
      loadImage(assetUrl('assets/monster-chase-open-front.png')),
      loadImage(assetUrl('assets/net.svg'))
    ])
  return {
    surfCharacters: Object.fromEntries(surfEntries),
    objects: Object.fromEntries(objectEntries) as Partial<
      Record<WorldObject['kind'], HTMLImageElement>
    >,
    monsterLure,
    monsterCapture,
    monsterRecoil,
    monsterChaseClosed,
    monsterChaseOpen,
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

function drawImageFit(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  centerX: number,
  bottom: number,
  maxWidth: number,
  maxHeight: number
): void {
  const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
  const width = image.naturalWidth * ratio
  const height = image.naturalHeight * ratio
  ctx.drawImage(image, centerX - width / 2, bottom - height, width, height)
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  reducedMotion: boolean
): void {
  const motionElapsed = reducedMotion ? 0 : state.elapsed
  const gradient = ctx.createLinearGradient(0, 0, 0, HORIZON + 38)
  gradient.addColorStop(0, '#d8aaa4')
  gradient.addColorStop(0.45, '#e9b7a7')
  gradient.addColorStop(0.78, '#f4c68d')
  gradient.addColorStop(1, '#ffdca1')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HORIZON + 38)

  const sunSize = Math.min(WIDTH * 0.18, HEIGHT * 0.24)
  const sunX = WIDTH * 0.77
  const sunY = HORIZON * (WIDTH / HEIGHT > 1 ? 0.42 : 0.6)
  ctx.fillStyle = 'rgba(255, 215, 146, .17)'
  for (let index = 3; index >= 1; index--) {
    ctx.beginPath()
    ctx.arc(sunX, sunY, sunSize * (1.05 + index * 0.26), 0, Math.PI * 2)
    ctx.fill()
  }
  const sunGradient = ctx.createLinearGradient(sunX, sunY - sunSize, sunX, sunY + sunSize)
  sunGradient.addColorStop(0, '#ffe2aa')
  sunGradient.addColorStop(0.62, '#f4c68d')
  sunGradient.addColorStop(1, '#d8aaa4')
  ctx.fillStyle = sunGradient
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunSize, 0, Math.PI * 2)
  ctx.fill()

  const drift = motionElapsed * 1.8
  drawCloud(ctx, ((WIDTH * 0.1 - drift * 0.08) % (WIDTH + 210)) - 120, HORIZON * 0.35, 1.05)
  drawCloud(ctx, ((WIDTH * 0.52 - drift * 0.05) % (WIDTH + 260)) - 80, HORIZON * 0.7, 0.72)
  drawCloud(ctx, ((WIDTH * 0.9 - drift * 0.12) % (WIDTH + 230)) - 90, HORIZON * 0.18, 0.54)

  ctx.fillStyle = 'rgba(255, 239, 201, .38)'
  for (let index = 0; index < 8; index++) {
    const x = (sunX - 95 + ((motionElapsed * 6 + index * 31) % 190))
    ctx.fillRect(x, sunY + sunSize * 0.82 + (index % 3) * 5, 46 + (index % 2) * 24, 3)
  }

  ctx.save()
  ctx.translate(Math.sin(motionElapsed * 0.06) * 2.5, 0)
  drawIsland(ctx, WIDTH * 0.12, HORIZON + 1, 1.08)
  drawIsland(ctx, WIDTH * 0.48, HORIZON + 2, 0.7)
  drawLighthouse(ctx, WIDTH * 0.88, HORIZON + 1, 0.9)
  ctx.restore()

  drawFestivalFlags(ctx, motionElapsed)

  const sea = ctx.createLinearGradient(0, HORIZON, 0, HEIGHT)
  sea.addColorStop(0, '#759598')
  sea.addColorStop(0.22, '#5b7f86')
  sea.addColorStop(0.68, '#466f78')
  sea.addColorStop(1, '#31555f')
  ctx.fillStyle = sea
  ctx.fillRect(0, HORIZON, WIDTH, HEIGHT - HORIZON)

  drawWaveBands(ctx, motionElapsed)

  const reflection = ctx.createLinearGradient(sunX, HORIZON, sunX, HEIGHT)
  reflection.addColorStop(0, 'rgba(255, 214, 154, .48)')
  reflection.addColorStop(0.55, 'rgba(244, 198, 141, .18)')
  reflection.addColorStop(1, 'rgba(216, 170, 164, 0)')
  ctx.fillStyle = reflection
  ctx.beginPath()
  ctx.moveTo(sunX - sunSize * 0.72, HORIZON)
  ctx.lineTo(sunX + sunSize * 0.72, HORIZON)
  ctx.lineTo(sunX + sunSize * 1.6, HEIGHT)
  ctx.lineTo(sunX - sunSize * 1.6, HEIGHT)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(211, 226, 215, .68)'
  ctx.lineWidth = 1.25
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(WIDTH / 2 + side * WIDTH * 0.13, HORIZON)
    ctx.lineTo(WIDTH / 2 + side * WIDTH * 0.49, HEIGHT)
    ctx.stroke()
  }

  drawOceanGlints(ctx, motionElapsed, sunX)
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
  ctx.fillStyle = 'rgba(255, 237, 207, .34)'
  ctx.fillRect(0, 13, 88, 13)
  ctx.fillRect(10, 7, 25, 14)
  ctx.fillRect(29, 2, 33, 20)
  ctx.fillRect(56, 8, 24, 14)
  ctx.fillStyle = 'rgba(255, 249, 224, .58)'
  ctx.fillRect(36, 4, 18, 5)
  ctx.fillRect(16, 9, 13, 4)
  ctx.fillStyle = 'rgba(216, 170, 164, .18)'
  ctx.fillRect(12, 25, 65, 3)
  ctx.restore()
}

function drawIsland(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  pathPolygon(
    ctx,
    [
      [-128, 2],
      [-91, -26],
      [-61, -14],
      [-27, -48],
      [-5, -31],
      [20, -16],
      [49, -39],
      [76, -17],
      [102, -24],
      [132, 2]
    ],
    '#526164',
    '#39494c',
    1.5
  )
  ctx.fillStyle = 'rgba(176, 178, 155, .36)'
  ctx.fillRect(-87, -14, 23, 4)
  ctx.fillRect(-17, -30, 14, 4)
  ctx.fillRect(46, -23, 20, 4)
  ctx.fillStyle = 'rgba(30, 55, 61, .24)'
  ctx.fillRect(-121, -1, 246, 5)
  ctx.restore()
}

function drawLighthouse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  pathPolygon(
    ctx,
    [
      [-48, 0],
      [-36, -16],
      [-15, -9],
      [3, -22],
      [22, -11],
      [49, 0]
    ],
    '#526164',
    '#39494c',
    1.5
  )
  pathPolygon(
    ctx,
    [
      [-9, -3],
      [-5, -55],
      [7, -55],
      [12, -3]
    ],
    '#8f604a',
    '#543f37',
    1.5
  )
  ctx.fillStyle = '#d8aaa4'
  ctx.fillRect(-7, -46, 15, 8)
  ctx.fillRect(-6, -27, 13, 7)
  ctx.fillStyle = '#ffd792'
  ctx.fillRect(-5, -63, 14, 9)
  ctx.fillStyle = '#543f37'
  ctx.fillRect(-2, -42, 5, 7)
  pathPolygon(
    ctx,
    [
      [-10, -63],
      [2, -74],
      [15, -63]
    ],
    '#714a3d',
    '#543f37',
    1.5
  )
  ctx.globalAlpha = 0.13
  ctx.fillStyle = '#ffd792'
  ctx.beginPath()
  ctx.moveTo(0, -59)
  ctx.lineTo(64, -73)
  ctx.lineTo(64, -44)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawFestivalFlags(
  ctx: CanvasRenderingContext2D,
  elapsed: number
): void {
  const segments = WIDTH < 520 ? 9 : 14
  const step = WIDTH / segments
  const baseline = HORIZON * 0.5
  const sag = HORIZON * 0.17
  const points: Array<[number, number]> = []
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments
    points.push([
      progress * WIDTH,
      baseline + Math.sin(progress * Math.PI) * sag
    ])
  }

  ctx.save()
  ctx.strokeStyle = 'rgba(72, 53, 48, .72)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index][0], points[index][1])
  }
  ctx.stroke()

  for (let index = 0; index < segments; index += 1) {
    const [x, y] = points[index]
    const flap = Math.sin(elapsed * 2.8 + index * 1.37)
    const width = step * (0.42 + (index % 3) * 0.035)
    const height = Math.max(10, HORIZON * 0.09)
    pathPolygon(
      ctx,
      [
        [x + 1, y + 1],
        [x + width, y + flap * 1.8],
        [x + width * 0.53, y + height + flap * 2.4]
      ],
      '#c76e6c',
      '#75443f',
      1
    )
  }
  ctx.restore()
}

function drawWaveBands(
  ctx: CanvasRenderingContext2D,
  elapsed: number
): void {
  const seaHeight = HEIGHT - HORIZON
  const layers = [
    { alpha: 0.12, color: '#b3c4b8', width: 0.75 },
    { alpha: 0.17, color: '#8fb0ae', width: 1.05 },
    { alpha: 0.23, color: '#d3ded0', width: 1.35 }
  ]
  ctx.save()
  ctx.lineCap = 'round'
  for (let layer = 0; layer < layers.length; layer += 1) {
    const spec = layers[layer]
    ctx.strokeStyle = spec.color
    const lineCount = WIDTH < 520 ? 4 : 6
    for (let index = 0; index < lineCount; index += 1) {
      const progress =
        (getWaveFlowPhase(elapsed, layer) +
          index / lineCount +
          layer * (OCEAN_WAVE_CYCLES[layer] ?? 0)) %
        1
      const t = progress ** 1.28
      const y = HORIZON + 7 + seaHeight * t
      const amplitude = 1 + t * (4.5 + layer * 1.1)
      const phase = index * 1.17 + layer * 1.9
      const segments = WIDTH < 520 ? 9 : 13
      ctx.globalAlpha = spec.alpha * (0.55 + t * 0.45)
      ctx.lineWidth = spec.width * (0.7 + t * 1.15)
      ctx.beginPath()
      for (let segment = 0; segment <= segments; segment += 1) {
        const x = (segment / segments) * WIDTH
        const normalized = x / WIDTH
        const crest =
          y +
          Math.sin(normalized * Math.PI * (1.8 + layer * 0.28) + phase) *
            amplitude +
          Math.sin(normalized * Math.PI * 4.2 - phase * 0.7) *
            amplitude *
            0.18
        if (segment === 0) ctx.moveTo(x, crest)
        else ctx.lineTo(x, crest)
      }
      ctx.stroke()

      if (t > 0.24) {
        const foamX =
          WIDTH * (0.2 + ((index * 0.31 + layer * 0.17) % 0.58))
        const foamY =
          y +
          Math.sin((foamX / WIDTH) * Math.PI * (1.8 + layer * 0.28) + phase) *
            amplitude
        const foamWidth = 7 + t * 24
        ctx.globalAlpha = spec.alpha * (0.55 + t * 0.35)
        ctx.lineWidth = Math.max(1, spec.width * (0.65 + t * 0.8))
        ctx.beginPath()
        ctx.moveTo(foamX - foamWidth * 0.5, foamY + 1)
        ctx.quadraticCurveTo(
          foamX,
          foamY - 2 - t * 2,
          foamX + foamWidth * 0.5,
          foamY + 1
        )
        ctx.stroke()
      }
    }
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

function drawOceanGlints(
  ctx: CanvasRenderingContext2D,
  elapsed: number,
  sunX: number
): void {
  ctx.save()
  ctx.fillStyle = 'rgba(255, 225, 172, .68)'
  const spread = WIDTH * 0.13
  for (let index = 0; index < 22; index += 1) {
    const t = index / 22
    const y = HORIZON + 8 + t * (HEIGHT - HORIZON) * 0.88
    const drift =
      Math.sin(elapsed * (0.8 + t) + index * 1.7) * (6 + t * 25)
    const x =
      sunX +
      Math.sin(index * 2.4) * spread * (0.22 + t * 0.78) +
      drift -
      WIDTH * 0.07
    ctx.globalAlpha = 0.16 + (1 - t) * 0.38
    ctx.fillRect(x, y, 8 + t * 28, 1 + t * 2)
  }
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

const OBJECT_ART_SIZE: Partial<Record<WorldObject['kind'], [number, number]>> = {
  rock: [58, 54],
  buoy: [40, 64],
  surfer: [54, 76],
  coin: [32, 40],
  heart: [32, 32],
  boost: [32, 36],
  shield: [38, 38],
  slime: [40, 40]
}

function drawCategoryBadge(
  ctx: CanvasRenderingContext2D,
  kind: WorldObject['kind'],
  x: number,
  y: number,
  scale: number
): void {
  const isItem = kind === 'coin' || kind === 'heart' || kind === 'boost' || kind === 'shield'
  const isCoin = kind === 'coin'
  const isDebuff = kind === 'slime'
  const isHazard = !isItem && !isDebuff && kind !== 'gate'
  if (!isHazard && !isItem && !isDebuff) return
  const size = Math.max(7, 9 * scale)
  const badgeY = y - (OBJECT_ART_SIZE[kind]?.[1] ?? 34) * scale - size * 0.7
  ctx.save()
  ctx.translate(Math.round(x), Math.round(badgeY))
  ctx.fillStyle = isDebuff ? '#7b4fb3' : isItem ? '#fff0a8' : '#ef604f'
  ctx.strokeStyle = '#3b3027'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(0, 0, size, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = isDebuff || isHazard ? '#fff8df' : '#493b30'
  ctx.font = `bold ${Math.max(6, Math.round(size * 1.25))}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(isDebuff ? '−' : isCoin ? '◆' : isItem ? '+' : '!', 0, 1)
  ctx.restore()
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  object: WorldObject,
  settings: GameSettings,
  assets: RenderAssets
): void {
  const projected = project(object.x, object.z)
  if (object.kind === 'gate') {
    drawGate(ctx, object, projected.x, projected.y, projected.scale)
  } else {
    const image = assets.objects[object.kind]
    const artSize = OBJECT_ART_SIZE[object.kind] ?? [36, 44]
    const bob =
      object.kind === 'slime' || object.kind === 'coin' || object.kind === 'heart'
        ? Math.sin(state.elapsed * 5 + object.wobble) * 2 * projected.scale
        : 0
    if (image) {
      const width = artSize[0] * projected.scale
      const height = artSize[1] * projected.scale
      ctx.drawImage(
        image,
        Math.round(projected.x - width / 2),
        Math.round(projected.y - height + bob),
        Math.round(width),
        Math.round(height)
      )
    } else if (
      object.kind === 'coin' ||
      object.kind === 'heart' ||
      object.kind === 'boost' ||
      object.kind === 'shield' ||
      object.kind === 'slime'
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
    drawCategoryBadge(ctx, object.kind, projected.x, projected.y, projected.scale)
    if (settings.highVisibility && object.z < 32) {
      const collisionWidth = object.width * (WIDTH * 0.43)
      ctx.strokeStyle =
        object.kind === 'coin' ||
        object.kind === 'heart' ||
        object.kind === 'boost' ||
        object.kind === 'shield'
          ? 'rgba(255, 247, 196, .75)'
          : object.kind === 'slime'
            ? 'rgba(196, 144, 255, .75)'
            : 'rgba(255, 107, 87, .8)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(
        projected.x - collisionWidth / 2,
        projected.y - 24 * projected.scale,
        collisionWidth,
        28 * projected.scale
      )
    }
  }
}

function drawNet(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: RenderAssets
): void {
  if (
    state.net.state !== 'armed' &&
    state.net.state !== 'snapped' &&
    state.net.state !== 'spent'
  ) {
    return
  }
  const projected = project(state.net.x, state.net.z)
  if (projected.y < HORIZON || projected.y > HEIGHT + 30) return
  const scale = projected.scale * (state.net.state === 'spent' ? 1.06 : 1)
  ctx.save()
  ctx.globalAlpha = state.net.state === 'spent' ? 0.5 : 1
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
    if (state.monster.state === 'chasing' && state.monster.gap < 24) {
      ctx.strokeStyle = '#fff1a8'
      ctx.lineWidth = Math.max(2, 3 * scale)
      ctx.beginPath()
      ctx.arc(projected.x, projected.y - 28 * scale, 35 * scale, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else if (state.net.state === 'snapped') {
    ctx.fillStyle = '#fff6cb'
    ctx.strokeStyle = '#3f3327'
    ctx.lineWidth = 2
    ctx.font = `bold ${Math.max(8, Math.round(10 * scale))}px monospace`
    ctx.textAlign = 'center'
    ctx.strokeText('捕获！+10 奶币', projected.x, projected.y - 66 * scale)
    ctx.fillText('捕获！+10 奶币', projected.x, projected.y - 66 * scale)
  }
  ctx.restore()
}

function drawLurkingMonster(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: RenderAssets
): void {
  if (state.monster.state !== 'lurking' || !assets.monsterLure) return
  const projected = project(state.monster.x, state.monster.z)
  const scale = projected.scale * 1.08
  ctx.save()
  ctx.globalAlpha = 0.88
  drawImageFit(
    ctx,
    assets.monsterLure,
    projected.x,
    projected.y + 5 * scale,
    120 * scale,
    92 * scale
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
    ctx.fillText('别贴太近', projected.x, bubbleY - 2)
  }
}

function drawChasingMonster(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  assets: RenderAssets
): void {
  const visible =
    state.monster.state === 'chasing' ||
    state.monster.state === 'recoiling' ||
    (state.monster.state === 'captured' && state.monster.age < 0.9)
  if (!visible) return
  const closeness =
    state.monster.state === 'recoiling'
      ? Math.max(0.3, 0.92 - state.monster.age * 0.45)
      : state.monster.state === 'captured'
        ? 0.62
        : Math.max(0.08, Math.min(1, 1 - state.monster.gap / 82))
  const size = (76 + closeness * 138) * Math.max(0.82, CANVAS_SCALE)
  const x = WIDTH / 2 + state.monster.x * WIDTH * 0.2 + Math.sin(state.elapsed * 4) * 8
  const y = HEIGHT - size * 0.32 + (1 - closeness) * 34
  ctx.save()
  ctx.globalAlpha = 0.38 + closeness * 0.62
  const frames = [assets.monsterChaseClosed, assets.monsterChaseOpen]
  const monsterImage =
    state.monster.state === 'captured'
      ? assets.monsterCapture
      : state.monster.state === 'recoiling'
      ? assets.monsterRecoil
      : frames[state.monster.animationFrame % frames.length] ??
        assets.monsterChaseClosed
  if (monsterImage) {
    drawImageFit(ctx, monsterImage, x, y, size, size)
  }
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
  const baseSize = state.secretEventActive ? 88 : 68
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
    assets.surfCharacters[state.secretEventActive ? 'frog' : state.config.character]
  if (image) {
    drawImageFit(ctx, image, 0, -2, size * 0.82, size * 0.92)
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
  if (state.debuffTimer > 0) {
    ctx.fillStyle = 'rgba(120, 72, 166, .35)'
    for (let index = 0; index < 4; index++) {
      ctx.beginPath()
      ctx.arc(-14 + index * 9, -8 - Math.sin(state.elapsed * 5 + index) * 8, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawMotionFeedback(ctx: CanvasRenderingContext2D, state: GameState): void {
  const player = project(state.playerX, 0)
  const y = Math.min(HEIGHT - 16, player.y + 4)
  if (state.motionState === 'accelerating') {
    ctx.strokeStyle = 'rgba(225, 255, 235, .7)'
    ctx.lineWidth = 2
    for (let index = 0; index < 4; index++) {
      const offset = 20 + index * 13
      ctx.beginPath()
      ctx.moveTo(player.x + offset, y - 8)
      ctx.lineTo(player.x + offset + 12, y - 8)
      ctx.stroke()
    }
  } else if (state.motionState === 'braking') {
    ctx.fillStyle = 'rgba(255, 248, 218, .82)'
    for (let index = 0; index < 7; index++) {
      const angle = Math.PI + (index / 6) * Math.PI
      ctx.fillRect(
        player.x + Math.cos(angle) * (24 + index * 2),
        y - 4 + Math.sin(angle) * 10,
        5,
        3
      )
    }
  }
  if (state.damageNoticeTimer > 0 && state.lastDamage) {
    ctx.fillStyle = state.lastDamage === 'monster' ? '#ff605e' : '#ffd55d'
    ctx.strokeStyle = '#3a3027'
    ctx.lineWidth = 3
    ctx.font = 'bold 17px monospace'
    ctx.textAlign = 'center'
    const text = state.lastDamage === 'monster' ? '−2 奶鲨撞击' : '−1 障碍碰撞'
    ctx.strokeText(text, player.x, y - 88 - (1 - state.damageNoticeTimer) * 10)
    ctx.fillText(text, player.x, y - 88 - (1 - state.damageNoticeTimer) * 10)
  }
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
  HORIZON = HEIGHT * (landscape ? 0.37 : 0.31)
  CANVAS_SCALE = Math.max(0.88, Math.min(1.12, WIDTH / 640))
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.imageSmoothingEnabled = false

  if (!settings.reducedMotion) {
    const shakeX = state.shake > 0 ? Math.sin(state.elapsed * 67) * state.shake * 5 : 0
    const shakeY = state.shake > 0 ? Math.cos(state.elapsed * 53) * state.shake * 3 : 0
    ctx.save()
    ctx.translate(shakeX, shakeY)
  }

  drawBackground(ctx, state, settings.reducedMotion)
  const sorted = [...state.objects].sort((a, b) => b.z - a.z)
  for (const object of sorted) drawObject(ctx, state, object, settings, assets)
  drawLurkingMonster(ctx, state, assets)
  drawChasingMonster(ctx, state, assets)
  drawNet(ctx, state, assets)
  drawPlayer(ctx, state, assets)
  drawMotionFeedback(ctx, state)
  drawOverlayEffects(ctx, state, settings)

  if (!settings.reducedMotion) ctx.restore()
}

export { WIDTH as GAME_WIDTH, HEIGHT as GAME_HEIGHT }
