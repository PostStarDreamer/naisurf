/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface AssetBaseline {
  assets: Array<{ path: string }>
}

function readVp8x(path: string): {
  width: number
  height: number
  hasAlpha: boolean
  bytes: number
} {
  const file = readFileSync(path)
  expect(file.toString('ascii', 0, 4), path).toBe('RIFF')
  expect(file.toString('ascii', 8, 12), path).toBe('WEBP')
  expect(file.toString('ascii', 12, 16), path).toBe('VP8X')
  const flags = file[20]
  return {
    width: 1 + file.readUIntLE(24, 3),
    height: 1 + file.readUIntLE(27, 3),
    hasAlpha: (flags & 0x10) !== 0,
    bytes: file.length
  }
}

describe('optimized WebP art assets', () => {
  const baseline = JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/game/asset-baseline.json'), 'utf8')
  ) as AssetBaseline

  it('keeps full display variants transparent and at least 720px', () => {
    let totalBytes = 0
    for (const { path } of baseline.assets) {
      const displayPath = resolve(
        process.cwd(),
        path.replace(/\.png$/i, '.webp')
      )
      const image = readVp8x(displayPath)
      expect(image.hasAlpha, displayPath).toBe(true)
      expect(Math.max(image.width, image.height), displayPath).toBeGreaterThanOrEqual(
        720
      )
      expect(image.bytes, displayPath).toBeLessThanOrEqual(40 * 1024)
      totalBytes += image.bytes
    }
    expect(totalBytes).toBeLessThan(512 * 1024)
  })

  it('keeps compact game variants transparent and below the gameplay budget', () => {
    let totalBytes = 0
    for (const { path } of baseline.assets) {
      const gamePath = resolve(
        process.cwd(),
        path.replace(/\.png$/i, '.game.webp')
      )
      const image = readVp8x(gamePath)
      expect(image.hasAlpha, gamePath).toBe(true)
      expect(Math.max(image.width, image.height), gamePath).toBeLessThanOrEqual(
        481
      )
      expect(image.bytes, gamePath).toBeLessThanOrEqual(20 * 1024)
      totalBytes += image.bytes
    }
    expect(totalBytes).toBeLessThan(256 * 1024)
  })
})
