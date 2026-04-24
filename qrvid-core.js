;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pako'))
  } else {
    root.QRVid = factory(root.pako)
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (pako) {
  'use strict'

  // CRC-16/CCITT-FALSE: poly=0x1021, init=0xFFFF, no bit reflection
  function crc16(data) {
    let crc = 0xffff
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 8
      for (let j = 0; j < 8; j++) {
        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
      }
    }
    return crc
  }

  function crc16Hex(data) {
    return crc16(data).toString(16).toUpperCase().padStart(4, '0')
  }

  function generateSessionId() {
    const bytes = new Uint8Array(4)
    // globalThis.crypto.getRandomValues works in browsers and Node.js 19+
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  }

  // Base45 alphabet (RFC 9285)
  const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
  const BASE45_MAP = {}
  for (let i = 0; i < BASE45_ALPHABET.length; i++) BASE45_MAP[BASE45_ALPHABET[i]] = i

  function base45Encode(data) {
    let result = ''
    for (let i = 0; i < data.length; i += 2) {
      if (i + 1 < data.length) {
        const n = (data[i] << 8) | data[i + 1]
        const c = n % 45
        const b = Math.floor(n / 45) % 45
        const a = Math.floor(n / 2025)
        result += BASE45_ALPHABET[c] + BASE45_ALPHABET[b] + BASE45_ALPHABET[a]
      } else {
        const n = data[i]
        const b = n % 45
        const a = Math.floor(n / 45)
        result += BASE45_ALPHABET[b] + BASE45_ALPHABET[a]
      }
    }
    return result
  }

  function base45Decode(str) {
    const s = str.toUpperCase()
    const result = []
    for (let i = 0; i < s.length; i += 3) {
      if (i + 2 < s.length) {
        const a = BASE45_MAP[s[i]]
        const b = BASE45_MAP[s[i + 1]]
        const c = BASE45_MAP[s[i + 2]]
        if (a === undefined || b === undefined || c === undefined) throw new Error('Invalid base45 char at ' + i)
        const n = a + b * 45 + c * 2025
        result.push((n >> 8) & 0xff, n & 0xff)
      } else if (i + 1 < s.length) {
        const a = BASE45_MAP[s[i]]
        const b = BASE45_MAP[s[i + 1]]
        if (a === undefined || b === undefined) throw new Error('Invalid base45 char at ' + i)
        result.push(a + b * 45)
      } else {
        throw new Error('Odd-length base45 remainder at ' + i)
      }
    }
    return new Uint8Array(result)
  }

  // Bytes per chunk by QR EC level (QR version 20, alphanumeric mode, minus 28-char header overhead)
  const CHUNK_SIZES = { L: 553, M: 432, Q: 302, H: 228 }

  const FRAME_REGEX = /^QRVD:([0-9A-F]{8}):(\d+)\/(\d+):([0-9A-F]{4}):(.+)$/

  function buildFrameString(sessionId, idx, total, crc, encodedData) {
    return 'QRVD:' + sessionId + ':' + idx + '/' + total + ':' + crc + ':' + encodedData
  }

  function parseFrame(str) {
    const m = str.trim().toUpperCase().match(FRAME_REGEX)
    if (!m) return null
    return {
      sessionId: m[1],
      frameIndex: parseInt(m[2], 10),
      totalFrames: parseInt(m[3], 10),
      crc: m[4],
      encodedData: m[5],
    }
  }

  function compress(str) {
    return pako.deflate(str)
  }

  function decompress(data) {
    return pako.inflate(data, { to: 'string' })
  }

  function splitIntoChunks(data, size) {
    const chunks = []
    for (let i = 0; i < data.length; i += size) chunks.push(data.slice(i, i + size))
    if (chunks.length === 0) chunks.push(new Uint8Array(0))
    return chunks
  }

  function createFrameStrings(payload, opts) {
    opts = opts || {}
    const ecLevel = opts.ecLevel || 'M'
    const url = opts.url || null
    const chunkSize = opts.chunkSize || CHUNK_SIZES[ecLevel] || CHUNK_SIZES.M

    const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const envelope = { v: 1, data: dataStr }
    if (url) envelope.url = url

    const compressed = compress(JSON.stringify(envelope))
    const chunks = splitIntoChunks(compressed, chunkSize)
    const sessionId = generateSessionId()
    const total = chunks.length

    return chunks.map(function (chunk, i) {
      const crc = crc16Hex(chunk)
      const encoded = base45Encode(chunk)
      return buildFrameString(sessionId, i + 1, total, crc, encoded)
    })
  }

  function decode(frameStrings) {
    if (!frameStrings || frameStrings.length === 0) throw new Error('No frames provided')

    const parsed = frameStrings.map(function (s, i) {
      const f = parseFrame(s)
      if (!f) throw new Error('Frame ' + i + ': invalid format')
      return f
    })

    const sessionId = parsed[0].sessionId
    const totalFrames = parsed[0].totalFrames

    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].sessionId !== sessionId) throw new Error('Mixed session IDs')
    }
    if (parsed.length !== totalFrames) {
      throw new Error('Expected ' + totalFrames + ' frames, got ' + parsed.length)
    }

    parsed.sort(function (a, b) { return a.frameIndex - b.frameIndex })

    const chunks = parsed.map(function (frame) {
      const bytes = base45Decode(frame.encodedData)
      const expected = crc16Hex(bytes)
      if (expected !== frame.crc) {
        throw new Error('CRC mismatch on frame ' + frame.frameIndex + ': expected ' + expected + ', got ' + frame.crc)
      }
      return bytes
    })

    let totalLen = 0
    for (let i = 0; i < chunks.length; i++) totalLen += chunks[i].length
    const concatenated = new Uint8Array(totalLen)
    let offset = 0
    for (let i = 0; i < chunks.length; i++) { concatenated.set(chunks[i], offset); offset += chunks[i].length }

    const envelopeJson = decompress(concatenated)
    const envelope = JSON.parse(envelopeJson)
    return { data: envelope.data, url: envelope.url || null, v: envelope.v }
  }

  return {
    crc16: crc16,
    crc16Hex: crc16Hex,
    base45Encode: base45Encode,
    base45Decode: base45Decode,
    generateSessionId: generateSessionId,
    buildFrameString: buildFrameString,
    parseFrame: parseFrame,
    compress: compress,
    decompress: decompress,
    createFrameStrings: createFrameStrings,
    decode: decode,
    CHUNK_SIZES: CHUNK_SIZES,
    FRAME_REGEX: FRAME_REGEX,
  }
})
