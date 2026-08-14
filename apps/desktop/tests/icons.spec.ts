import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveDesktopIconPng } from '../src/icon.ts'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('desktop icons', () => {
  it('resolves a 1024px branded PNG from src or lib', () => {
    const png = readFileSync(resolveDesktopIconPng())
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
    expect(png.readUInt32BE(16)).toBe(1024)
    expect(png.readUInt32BE(20)).toBe(1024)
  })

  it('ships icns and ico for electron-builder', () => {
    const icns = readFileSync(new URL('../build/icon.icns', import.meta.url))
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
    const ico = readFileSync(new URL('../build/icon.ico', import.meta.url))
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
  })
})
