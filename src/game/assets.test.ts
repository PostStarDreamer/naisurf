/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

interface DecodedPng {
  width: number
  height: number
  rgba: Uint8Array
}

interface AssetBaseline {
  maskSize: number
  assets: Array<{
    path: string
    original: {
      width: number
      height: number
      coverage: number
      mask: string
    }
    output: {
      width: number
      height: number
      coverage: number
    }
  }>
}

const PNG_SIGNATURE = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10
])

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left
  if (upDistance <= upperLeftDistance) return up
  return upperLeft
}

function decodePng(path: string): DecodedPng {
  const file = readFileSync(path)
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${path} is not a PNG`)
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const dataChunks: Buffer[] = []

  while (offset < file.length) {
    const length = file.readUInt32BE(offset)
    const type = file.toString('ascii', offset + 4, offset + 8)
    const data = file.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      dataChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += length + 12
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`${path} must be an 8-bit non-interlaced RGBA PNG`)
  }

  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const raw = inflateSync(Buffer.concat(dataChunks))
  const rgba = new Uint8Array(width * height * bytesPerPixel)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const source = y * (stride + 1) + 1
    const target = y * stride
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source + x]
      const left = x >= bytesPerPixel ? rgba[target + x - bytesPerPixel] : 0
      const up = y > 0 ? rgba[target + x - stride] : 0
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? rgba[target + x - stride - bytesPerPixel]
          : 0
      const prediction =
        filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? Math.floor((left + up) / 2)
              : filter === 4
                ? paeth(left, up, upperLeft)
                : 0
      rgba[target + x] = (value + prediction) & 0xff
    }
  }

  return { width, height, rgba }
}

describe('direct attachment art assets', () => {
  const baseline = JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/game/asset-baseline.json'), 'utf8')
  ) as AssetBaseline
  const files = baseline.assets.map((asset) => asset.path)

  function cropAndSampleMask(
    png: DecodedPng,
    size: number
  ): { bits: Uint8Array; bbox: [number, number, number, number] } {
    let left = png.width
    let top = png.height
    let right = -1
    let bottom = -1
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        if (png.rgba[(y * png.width + x) * 4 + 3] === 0) continue
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
    const bits = new Uint8Array(size * size)
    if (right < left || bottom < top) {
      return { bits, bbox: [0, 0, 0, 0] }
    }
    const bbox: [number, number, number, number] = [
      left,
      top,
      right - left + 1,
      bottom - top + 1
    ]
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let opaque = 0
        for (let sy = 0; sy < 4; sy += 1) {
          for (let sx = 0; sx < 4; sx += 1) {
            const sourceX =
              left + Math.floor(((x + (sx + 0.5) / 4) / size) * bbox[2])
            const sourceY =
              top + Math.floor(((y + (sy + 0.5) / 4) / size) * bbox[3])
            const alpha =
              png.rgba[(sourceY * png.width + sourceX) * 4 + 3]
            if (alpha > 0) opaque += 1
          }
        }
        bits[y * size + x] = opaque >= 8 ? 1 : 0
      }
    }
    return { bits, bbox }
  }

  function decodeMask(hex: string): Uint8Array {
    const bytes = Buffer.from(hex, 'hex')
    const bits = new Uint8Array(bytes.length * 8)
    for (let index = 0; index < bits.length; index += 1) {
      bits[index] = (bytes[index >> 3] >> (7 - (index & 7))) & 1
    }
    return bits
  }

  it('keeps every required state as a clean 720p binary-alpha PNG', () => {
    expect(files).toHaveLength(16)
    for (const record of baseline.assets) {
      const relativePath = record.path
      const png = decodePng(resolve(process.cwd(), relativePath))
      expect(Math.max(png.width, png.height), relativePath).toBeGreaterThanOrEqual(720)
      let transparent = 0
      let opaque = 0
      for (let index = 3; index < png.rgba.length; index += 4) {
        const alpha = png.rgba[index]
        expect(alpha === 0 || alpha === 255, relativePath).toBe(true)
        if (alpha === 0) transparent += 1
        else opaque += 1
      }
      expect(transparent, relativePath).toBeGreaterThan(png.width)
      expect(opaque, relativePath).toBeGreaterThan(png.width)
      expect(png.rgba[3], relativePath).toBe(0)
      expect(png.rgba[png.rgba.length - 1], relativePath).toBe(0)

      const sampled = cropAndSampleMask(png, baseline.maskSize)
      const expected = decodeMask(record.original.mask)
      let intersection = 0
      let union = 0
      for (let index = 0; index < sampled.bits.length; index += 1) {
        intersection += sampled.bits[index] & expected[index]
        union += sampled.bits[index] | expected[index]
      }
      expect(intersection / union, `${relativePath} silhouette IoU`).toBeGreaterThanOrEqual(
        0.985
      )
    }
  }, 120000)

  it('leaves no light contamination on the outer silhouette', () => {
    for (const relativePath of files) {
      const png = decodePng(resolve(process.cwd(), relativePath))
      let contaminated = 0
      for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
          const offset = (y * png.width + x) * 4
          if (png.rgba[offset + 3] === 0) continue
          let touchesTransparency = false
          for (let dy = -1; dy <= 1 && !touchesTransparency; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = x + dx
              const ny = y + dy
              if (
                nx < 0 ||
                ny < 0 ||
                nx >= png.width ||
                ny >= png.height ||
                png.rgba[(ny * png.width + nx) * 4 + 3] === 0
              ) {
                touchesTransparency = true
                break
              }
            }
          }
          if (!touchesTransparency) continue
          const red = png.rgba[offset]
          const green = png.rgba[offset + 1]
          const blue = png.rgba[offset + 2]
          if (
            Math.min(red, green, blue) >= 160 &&
            Math.max(red, green, blue) - Math.min(red, green, blue) <= 60
          ) {
            contaminated += 1
          }
        }
      }
      expect(contaminated, `${relativePath} light edge pixels`).toBe(0)
    }
  }, 120000)
})
