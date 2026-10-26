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
  const files = [
    'public/assets/showcase/egg.png',
    'public/assets/showcase/mouse.png',
    'public/assets/showcase/chicken.png',
    'public/assets/showcase/dog.png',
    'public/assets/showcase/frog.png',
    'public/assets/characters/egg-surf.png',
    'public/assets/characters/mouse-surf.png',
    'public/assets/characters/chicken-surf.png',
    'public/assets/characters/dog-surf.png',
    'public/assets/characters/frog-surf.png',
    'public/assets/monster-lure-three-quarter.png',
    'public/assets/monster-chase-closed-front.png',
    'public/assets/monster-chase-open-front.png',
    'public/assets/monster-capture-back-three-quarter.png',
    'public/assets/monster-hero-side.png',
    'public/assets/monster-recoil-three-quarter.png'
  ]

  it('keeps every required state as a clean binary-alpha PNG', () => {
    for (const relativePath of files) {
      const png = decodePng(resolve(process.cwd(), relativePath))
      expect(png.width, relativePath).toBeGreaterThan(50)
      expect(png.height, relativePath).toBeGreaterThan(50)

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
    }
}, 20000)
})
