// qrvid protocol: pure TypeScript port of qrvid-core.js (no canvas, no GIF — decode only)
import pako from 'pako'

// CRC-16/CCITT-FALSE: poly=0x1021, init=0xFFFF, no bit reflection
export function crc16(data: Uint8Array): number {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc
}

function crc16Hex(data: Uint8Array): string {
  return crc16(data).toString(16).toUpperCase().padStart(4, '0')
}

// Base45 alphabet (RFC 9285)
const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
const BASE45_MAP: Record<string, number> = {}
for (let i = 0; i < BASE45_ALPHABET.length; i++) BASE45_MAP[BASE45_ALPHABET[i]] = i

export function base45Decode(str: string): Uint8Array {
  const s = str.toUpperCase()
  const result: number[] = []
  for (let i = 0; i < s.length; i += 3) {
    if (i + 2 < s.length) {
      const a = BASE45_MAP[s[i]], b = BASE45_MAP[s[i + 1]], c = BASE45_MAP[s[i + 2]]
      if (a === undefined || b === undefined || c === undefined) throw new Error('Invalid base45 char at ' + i)
      const n = a + b * 45 + c * 2025
      result.push((n >> 8) & 0xff, n & 0xff)
    } else if (i + 1 < s.length) {
      const a = BASE45_MAP[s[i]], b = BASE45_MAP[s[i + 1]]
      if (a === undefined || b === undefined) throw new Error('Invalid base45 char at ' + i)
      result.push(a + b * 45)
    }
  }
  return new Uint8Array(result)
}

export const FRAME_REGEX = /^QRVD:([0-9A-F]{8}):(\d+)\/(\d+):([0-9A-F]{4}):(.+)$/
export const BEACON_REGEX = /^QRVD:BEACON:([0-9A-F]{8})\/(\d+)(?:\/(\d+))?$/

export interface ParsedFrame {
  type: 'data'
  sessionId: string
  frameIndex: number
  totalFrames: number
  crc: string
  encodedData: string
}

export interface ParsedBeacon {
  type: 'beacon'
  sessionId: string
  totalFrames: number
  delayMs: number | null
}

export interface DecodedPayload {
  v: number
  data: string
  url: string | null
}

export function parseFrame(str: string): ParsedFrame | null {
  const m = str.trim().toUpperCase().match(FRAME_REGEX)
  if (!m) return null
  return {
    type: 'data',
    sessionId: m[1],
    frameIndex: parseInt(m[2], 10),
    totalFrames: parseInt(m[3], 10),
    crc: m[4],
    encodedData: m[5],
  }
}

export function parseBeacon(str: string): ParsedBeacon | null {
  const m = str.trim().toUpperCase().match(BEACON_REGEX)
  if (!m) return null
  return {
    type: 'beacon',
    sessionId: m[1],
    totalFrames: parseInt(m[2], 10),
    delayMs: m[3] != null ? parseInt(m[3], 10) : null,
  }
}

export function decode(frameStrings: string[]): DecodedPayload {
  if (!frameStrings.length) throw new Error('No frames provided')

  const parsed = frameStrings.map((s, i) => {
    const f = parseFrame(s)
    if (!f) throw new Error(`Frame ${i}: invalid format`)
    return f
  })

  const { sessionId, totalFrames } = parsed[0]
  if (parsed.some(f => f.sessionId !== sessionId)) throw new Error('Mixed session IDs')
  if (parsed.length !== totalFrames) throw new Error(`Expected ${totalFrames} frames, got ${parsed.length}`)

  parsed.sort((a, b) => a.frameIndex - b.frameIndex)

  const chunks = parsed.map(frame => {
    const bytes = base45Decode(frame.encodedData)
    const expected = crc16Hex(bytes)
    if (expected !== frame.crc) throw new Error(`CRC mismatch on frame ${frame.frameIndex}`)
    return bytes
  })

  const totalLen = chunks.reduce((s, c) => s + c.length, 0)
  const concatenated = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) { concatenated.set(chunk, offset); offset += chunk.length }

  const envelopeJson = pako.inflate(concatenated, { to: 'string' })
  const envelope = JSON.parse(envelopeJson) as { v: number; data: string; url?: string }
  return { data: envelope.data, url: envelope.url ?? null, v: envelope.v }
}
