import { CHARACTERS } from '../data'
import type { CharacterId, GameSettings, GameState, WorldObject } from '../types'
import { VIEW_DISTANCE } from './engine'

let WIDTH = 640
let HEIGHT = 360
let HORIZON = 164
let CANVAS_SCALE = 1

export interface RenderAssets {
  surfCharacters: Partial<Record<CharacterId, HTMLImageElement>>
  objects: Partial<Record<WorldObject['kind'], HTMLImageElement>>
  monsterSide?: HTMLImageElement
  monsterClosed?: HTMLImageElement
  monsterMid?: HTMLImageElement
  monsterOpen?: HTMLImageElement
  monsterBite?: HTMLImageElement
  monsterRecoil?: HTMLImageElement
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
  const [surfEntries, objectEntries, monsterSide, monsterClosed, monsterMid, monsterOpen, monsterBite, monsterRecoil, net] =
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
      loadImage(assetUrl('assets/monster-side.png')),
      loadImage(assetUrl('assets/monster-closed.png')),
      loadImage(assetUrl('assets/monster-mid.png')),
      loadImage(assetUrl('assets/monster-open.png')),
      loadImage(assetUrl('assets/monster-bite.png')),
      loadImage(assetUrl('assets/monster-recoil.png')),
      loadImage(assetUrl('assets/net.svg'))
    ])
  return {
    surfCharacters: Object.fromEntries(surfEntries),
    objects: Object.fromEntries(objectEntries) as Partial<
      Record<WorldObject['kind'], HTMLImageElement>
    >,
    monsterSide,
    monsterClosed,
    monsterMid,
    monsterOpen,
    monsterBite,
    monsterRecoil,
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

function drawBackground(ctx: CanvasRenderingContext2D, state: GameState): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, HORIZON + 38)
  gradient.addColorStop(0, '#ffa978')
  gradient.addColorStop(0.42, '#ffc791')
  gradient.addColorStop(0.75, '#ffe5b4')
  gradient.addColorStop(1, '#fff1ce')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HORIZON + 38)

  const sunSize = Math.min(WIDTH, HEIGHT) * 0.095
  const sunX = WIDTH * 0.79
  const sunY = HORIZON * 0.34
  ctx.fillStyle = 'rgba(255, 236, 154, .2)'
  for (let index = 1; index <= 3; index++) {
    ctx.beginPath()
    ctx.arc(sunX, sunY, sunSize * (1.25 + index * 0.2), 0, Math.PI * 2)
    ctx.fill()
  }
  const sunGradient = ctx.createLinearGradient(sunX, sunY - sunSize, sunX, sunY + sunSize)
  sunGradient.addColorStop(0, '#ffdc72')
  sunGradient.addColorStop(0.6, '#ffab72')
  sunGradient.addColorStop(1, '#ff8c73')
  ctx.fillStyle = sunGradient
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunSize, 0, Math.PI * 2)
  ctx.fill()

  const drift = state.distance * (0.72 + state.speed * 0.018)
  drawCloud(ctx, ((WIDTH * 0.1 - drift * 0.08) % (WIDTH + 210)) - 120, HORIZON * 0.35, 1.05)
  drawCloud(ctx, ((WIDTH * 0.52 - drift * 0.05) % (WIDTH + 260)) - 80, HORIZON * 0.7, 0.72)
  drawCloud(ctx, ((WIDTH * 0.9 - drift * 0.12) % (WIDTH + 230)) - 90, HORIZON * 0.18, 0.54)

  ctx.fillStyle = 'rgba(255, 250, 218, .42)'
  for (let index = 0; index < 7; index++) {
    const x = (sunX - 95 + ((state.distance * 0.12 + index * 31) % 190))
    ctx.fillRect(x, sunY + sunSize * 0.82 + (index % 3) * 5, 46 + (index % 2) * 24, 3)
  }

  ctx.save()
  ctx.translate(Math.sin(state.distance * 0.003) * 12, 0)
  drawIsland(ctx, WIDTH * 0.11, HORIZON + 2, 1)
  drawIsland(ctx, WIDTH * 0.58, HORIZON + 3, 0.64)
  drawLighthouse(ctx, WIDTH * 0.88, HORIZON + 2, 0.92)
  ctx.restore()

  ctx.strokeStyle = 'rgba(110, 81, 52, .55)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(WIDTH * 0.03, HORIZON * 0.54)
  ctx.quadraticCurveTo(WIDTH * 0.5, HORIZON * 0.39, WIDTH * 0.97, HORIZON * 0.57)
  ctx.stroke()
  const bannerShift = (state.distance * 0.8) % 38
  for (let x = -30 + bannerShift; x < WIDTH + 30; x += 38) {
    const flagY = HORIZON * 0.54 + Math.sin((x / WIDTH) * Math.PI) * -14
    pathPolygon(
      ctx,
      [
        [x, flagY],
        [x + 18, flagY + 1],
        [x + 9, flagY + 13]
      ],
      '#ee7659',
      '#774d39',
      1
    )
  }

  const sea = ctx.createLinearGradient(0, HORIZON, 0, HEIGHT)
  sea.addColorStop(0, '#8be1ca')
  sea.addColorStop(0.25, '#55c8b9')
  sea.addColorStop(0.62, '#2ba8a6')
  sea.addColorStop(1, '#187f91')
  ctx.fillStyle = sea
  ctx.fillRect(0, HORIZON, WIDTH, HEIGHT - HORIZON)

  ctx.fillStyle = 'rgba(255, 247, 215, .22)'
  for (let index = 0; index < 18; index++) {
    const t = index / 18
    const y = HORIZON + (HEIGHT - HORIZON) * t ** 1.38
    const width = 35 + t * 620
    const offset =
      Math.sin(state.distance * (0.12 + t * 0.08) + index * 1.7) * (7 + t * 36)
    ctx.globalAlpha = 0.11 + t * 0.23
    ctx.fillRect(WIDTH / 2 - width / 2 + offset, y, 20 + t * 34, 1.5 + t * 3)
  }
  ctx.globalAlpha = 1

  const reflection = ctx.createLinearGradient(sunX, HORIZON, sunX, HEIGHT)
  reflection.addColorStop(0, 'rgba(255, 228, 143, .34)')
  reflection.addColorStop(1, 'rgba(255, 246, 189, 0)')
  ctx.fillStyle = reflection
  ctx.beginPath()
  ctx.moveTo(sunX - sunSize * 0.72, HORIZON)
  ctx.lineTo(sunX + sunSize * 0.72, HORIZON)
  ctx.lineTo(sunX + sunSize * 1.6, HEIGHT)
  ctx.lineTo(sunX - sunSize * 1.6, HEIGHT)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(255, 250, 221, .64)'
  ctx.lineWidth = 1.5
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(WIDTH / 2 + side * WIDTH * 0.13, HORIZON)
    ctx.lineTo(WIDTH / 2 + side * WIDTH * 0.49, HEIGHT)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(255, 250, 220, .72)'
  for (let index = 0; index < 14; index++) {
    const phase = (state.distance * (1.9 + index * 0.035) + index * 53) % (WIDTH + 120)
    const y = HORIZON + 34 + ((index * 41) % Math.max(55, HEIGHT - HORIZON - 45))
    const x = (phase + index * 71) % (WIDTH + 100)
    ctx.fillRect(x - WIDTH * 0.62, y, 20 + (index % 3) * 9, 2.5)
    ctx.fillRect(x - WIDTH * 0.62 + 10, y + 5, 11, 1.7)
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
  ctx.fillStyle = 'rgba(255, 248, 221, .48)'
  ctx.fillRect(0, 12, 92, 17)
  ctx.fillRect(8, 5, 28, 17)
  ctx.fillRect(30, 0, 35, 24)
  ctx.fillRect(59, 7, 25, 17)
  ctx.fillStyle = 'rgba(255, 194, 145, .25)'
  ctx.fillRect(12, 26, 69, 5)
  ctx.fillStyle = 'rgba(255, 255, 241, .35)'
  ctx.fillRect(37, 5, 20, 6)
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
      [-115, 1],
      [-78, -29],
      [-36, -12],
      [0, -46],
      [40, -10],
      [80, -25],
      [124, 2]
    ],
    '#479f85',
    '#377c70',
    2
  )
  ctx.fillStyle = '#7fc69d'
  ctx.fillRect(-44, -25, 46, 7)
  ctx.fillRect(71, -17, 25, 5)
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
      [-52, 0],
      [-35, -21],
      [-4, -9],
      [25, -26],
      [58, 0]
    ],
    '#4a9c83',
    '#377c70',
    2
  )
  pathPolygon(
    ctx,
    [
      [-8, -2],
      [-4, -50],
      [8, -50],
      [13, -2]
    ],
    '#fff3cf',
    '#6e4d38',
    2
  )
  ctx.fillStyle = '#ee775c'
  ctx.fillRect(-6, -40, 16, 8)
  ctx.fillRect(-5, -22, 14, 7)
  ctx.fillStyle = '#ffdc73'
  ctx.fillRect(-5, -57, 15, 8)
  ctx.fillStyle = '#ee775c'
  pathPolygon(
    ctx,
    [
      [-9, -58],
      [2, -68],
      [14, -58]
    ],
    '#ee775c',
    '#6e4d38',
    2
  )
  ctx.globalAlpha = 0.22
  ctx.fillStyle = '#fff5b8'
  ctx.beginPath()
  ctx.moveTo(0, -54)
  ctx.lineTo(62, -74)
  ctx.lineTo(62, -36)
  ctx.closePath()
  ctx.fill()
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
  if (state.monster.state !== 'lurking' || !assets.monsterSide) return
  const projected = project(state.monster.x, state.monster.z)
  const scale = projected.scale * 1.08
  ctx.save()
  ctx.globalAlpha = 0.88
  drawImageFit(
    ctx,
    assets.monsterSide,
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
  const frames = [
    assets.monsterClosed,
    assets.monsterMid,
    assets.monsterOpen,
    assets.monsterBite
  ]
  const monsterImage =
    state.monster.state === 'recoiling' || state.monster.state === 'captured'
      ? assets.monsterRecoil
      : frames[state.monster.animationFrame] ?? assets.monsterClosed
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
