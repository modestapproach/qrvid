'use strict'

const QRCode = require('qrcode')
const GifWriter = require('omggif').GifWriter
const core = require('../qrvid-core.js')

// Render a data QR code frame to a canvas, return RGBA ImageData
async function renderFrame(text, size, ecLevel) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: ecLevel,
    margin: 2,
    width: size,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return canvas.getContext('2d').getImageData(0, 0, size, size)
}

// Beacon frame: small QR centered on a black canvas — visually distinct in B&W
// Works on greyscale/e-ink/thermal screens — no color dependency
async function renderBeaconFrame(text, size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Fill entire frame black
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  // Render QR at 55% of frame size, centered
  const qrSize = Math.round(size * 0.55)
  const offset = Math.round((size - qrSize) / 2)
  const qrCanvas = document.createElement('canvas')
  qrCanvas.width = qrSize
  qrCanvas.height = qrSize
  await QRCode.toCanvas(qrCanvas, text, {
    errorCorrectionLevel: 'L',  // beacon has minimal data, L is fine
    margin: 3,
    width: qrSize,
    color: { dark: '#000000', light: '#ffffff' },
  })
  ctx.drawImage(qrCanvas, offset, offset, qrSize, qrSize)

  return ctx.getImageData(0, 0, size, size)
}

// Convert RGBA ImageData to palette-indexed pixels (2-color: white=0, black=1)
function rgbaToIndexed(imageData) {
  const pixels = new Uint8Array(imageData.width * imageData.height)
  const data = imageData.data
  for (let i = 0; i < pixels.length; i++) {
    // Average RGB to determine if pixel is dark; alpha channel ignored (always 255)
    pixels[i] = data[i * 4] < 128 ? 1 : 0  // 0=white, 1=black
  }
  return pixels
}

// Assemble indexed-color frames into an animated GIF, return Uint8Array
function assembleGif(frames, size, delay) {
  // omggif palette: array of packed 0xRRGGBB integers, length must be power of 2
  const palette = [0xffffff, 0x000000]  // index 0=white, index 1=black
  const bufSize = size * size * frames.length * 5 + 1024
  const buf = new Uint8Array(bufSize)
  const gif = new GifWriter(buf, size, size, { loop: 0, palette })

  const delayCentiseconds = Math.round(delay / 10)  // GIF delay is in 1/100s units

  for (const frame of frames) {
    gif.addFrame(0, 0, size, size, rgbaToIndexed(frame), { delay: delayCentiseconds })
  }

  return buf.slice(0, gif.end())
}

async function encodeToGif(payload, opts) {
  opts = opts || {}
  const ecLevel = opts.ecLevel || 'M'
  const frameDelay = opts.frameDelay || 500
  const frameSize = opts.frameSize || 300
  const url = opts.url || null

  const { beacon, dataFrames, total } = core.createFrameStrings(payload, { ecLevel, url, delayMs: frameDelay })

  // Beacon rendered first — black canvas with small centered QR
  const beaconImageData = await renderBeaconFrame(beacon, frameSize)

  // Data frames rendered full-bleed
  const dataImageData = await Promise.all(
    dataFrames.map(str => renderFrame(str, frameSize, ecLevel))
  )

  // GIF: beacon + data frames (loops back to beacon on replay)
  const allFrames = [beaconImageData, ...dataImageData]
  const gifBytes = assembleGif(allFrames, frameSize, frameDelay)
  return { gifBytes, frameCount: total, frameStrings: dataFrames }
}

// UTF-8-safe base64 (btoa fails on non-Latin1 characters)
function utf8ToB64(str) {
  return btoa(Array.from(new TextEncoder().encode(str), b => String.fromCharCode(b)).join(''))
}
function b64ToUtf8(b64) {
  return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
}

// Build the hash-fragment URL that a target site can consume
function buildHandoffUrl(url, payload) {
  const envelope = { v: 1, data: typeof payload === 'string' ? payload : JSON.stringify(payload) }
  envelope.url = url
  return url + '#qrvid=' + utf8ToB64(JSON.stringify(envelope))
}

// Wire up the page once DOM is ready
window.addEventListener('load', function () {
  const form = document.getElementById('encode-form')
  const dataInput = document.getElementById('data-input')
  const fileInput = document.getElementById('file-input')
  const urlInput = document.getElementById('url-input')
  const ecInputs = document.querySelectorAll('input[name="ec-level"]')
  const delayInput = document.getElementById('delay-input')
  const delayLabel = document.getElementById('delay-label')
  const sizeInput = document.getElementById('size-input')
  const sizeLabel = document.getElementById('size-label')
  const generateBtn = document.getElementById('generate-btn')
  const statusEl = document.getElementById('status')
  const previewSection = document.getElementById('preview-section')
  const previewImg = document.getElementById('preview-img')
  const downloadBtn = document.getElementById('download-btn')
  const frameCountEl = document.getElementById('frame-count')
  const scanTimeEl = document.getElementById('scan-time')
  const handoffSection = document.getElementById('handoff-section')
  const handoffEl = document.getElementById('handoff-url')

  let currentBlobUrl = null

  delayInput.addEventListener('input', function () {
    delayLabel.textContent = delayInput.value + ' ms'
  })

  sizeInput.addEventListener('input', function () {
    sizeLabel.textContent = sizeInput.value + ' px'
  })

  // If arriving via a scanner handoff, pre-fill from the hash fragment
  ;(function loadFromHash() {
    try {
      const hash = window.location.hash
      if (!hash.startsWith('#qrvid=')) return
      const envelope = JSON.parse(b64ToUtf8(hash.slice(7)))
      if (envelope.data) dataInput.value = envelope.data
      if (envelope.url) urlInput.value = envelope.url
      history.replaceState(null, '', location.pathname + location.search)
    } catch {}
  })()

  const demoBtn = document.getElementById('demo-btn')
  if (demoBtn) {
    demoBtn.addEventListener('click', function () {
      dataInput.value = [
        'qrvid is a manifesto encoded in light. You are reading it because someone pointed a camera at a screen, and the screen flashed an animated sequence of QR codes — black-and-white squares cycling about twice a second — and your phone pieced them back together into this very message. No app store. No download. No network call. No hidden round trip.',
        'There is no server behind this. There is no analytics, no telemetry, no expiring link, no account required, no permission asked. The data crossed from one device to another at the speed of light, through glass, with nothing in between but air. The only infrastructure required was a screen on one side and a camera on the other.',
        'This is the same physical principle as a smoke signal, a semaphore flag, a lighthouse beacon, or a telegraph wire. Information encoded in visible light, moving from one place to another without any network in between. qrvid is just that ancient idea running at a few frames per second on a modern smartphone screen.',
        'What can you do with it? Quite a lot, it turns out. You can give a friend a configured chatbot conversation by handing them your phone and letting them scan a looping GIF. You can put a complete restaurant menu on a printed paper QR sequence at a venue with no Wi-Fi. You can stream multi-language assembly instructions from an e-ink label that runs for years on a coin cell battery. You can move data from an air-gapped industrial control system to the outside world without ever touching a wire or pairing a radio. You can hand a stranger an entire pre-filled web form by showing them a billboard.',
        'You can put a self-contained HTML page — a calculator, a small game, a survey, a single-page React app — into a GIF and watch someone reconstruct it onto their phone in under a minute, then run it locally with no further connectivity required. You can encode a saved game state, a configuration profile, a regulatory disclosure, a transit schedule, a venue map, a complete medical intake form, or the full text of a short story.',
        'Imagine a museum that hands out qrvid GIFs as digital catalog entries. A professor whose final exam includes a single QR code printed at the top of the page that, when scanned, opens a configured calculator. A protest movement distributing a constitution amendment as flickering pixels on every screen. A neighborhood library where the wall plays a sequence of book recommendations that visitors collect by walking past. A doctor handing patients their full medical history as a sequence of light pulses that any phone can capture.',
        'The protocol is simple by design. Each frame begins with a small header — a session ID, a frame index, a total count, a CRC checksum — followed by the chunk\'s data, encoded in base45 so it fits efficiently into QR alphanumeric mode. The first frame in every loop is a beacon: a small QR centered on a solid black background, visually unmistakable, that announces the session ID, total frame count, and intended frame rate. The decoder uses the beacon to know when one loop has ended and another begun, and to estimate how much longer the scan will take.',
        'The GIF loops forever, which is the entire reliability story. If your phone misses frame three on the first pass, it catches it on the second pass. The decoder accumulates frames idempotently into a map keyed by frame index, and as soon as the map is full it decompresses, parses, and surfaces the result. Self-healing transmission with zero protocol machinery beyond the loop itself. There is no acknowledgment channel, no retry timeout, no flow control, no handshake. Just a sequence of pictures that, taken together, contain everything.',
        'The cultural implication is what makes this interesting. We have spent twenty years assuming that sharing information between two devices requires accounts, infrastructure, intermediaries, platforms — that the substrate of digital communication must be owned, monitored, mediated. qrvid is a quiet refusal of that assumption. It says: the screen is the broadcast medium. The camera is the receiver. The light between them is the protocol. Nothing else needs to exist. Anyone can read what is in front of them, and anyone can pass it on, and no one is keeping track.',
        'You arrived at the encoder page itself, pre-filled with this exact message and the encoder URL already in the target field. Click Generate GIF. You will get a brand-new GIF that says exactly what you just read. Show it to anyone, anywhere — at a kitchen table, in a slide deck, on a printed page taped to a lamppost, on a video wall in a city square, on a phone screen pointed at another phone. They will land here. They can re-encode it and pass it on. The message replicates through whoever cares to share it. There is no central registry of where it has been or who has seen it.',
        'This is what the open web was supposed to feel like.',
      ].join('\n\n')
      urlInput.value = 'https://modestapproach.github.io/qrvid/qrvid-encode.html'
      dataInput.focus()
    })
  }

  fileInput.addEventListener('change', function () {
    if (!fileInput.files.length) return
    const reader = new FileReader()
    reader.onload = function (e) { dataInput.value = e.target.result }
    reader.readAsText(fileInput.files[0])
  })

  dataInput.addEventListener('dragover', function (e) { e.preventDefault() })
  dataInput.addEventListener('drop', function (e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = function (ev) { dataInput.value = ev.target.result }
    reader.readAsText(file)
  })

  form.addEventListener('submit', async function (e) {
    e.preventDefault()
    const payload = dataInput.value.trim()
    if (!payload) { statusEl.textContent = 'Enter some data first.'; return }

    const ecLevel = [...ecInputs].find(r => r.checked)?.value || 'M'
    const frameDelay = parseInt(delayInput.value, 10)
    const frameSize = parseInt(sizeInput.value, 10)
    const url = urlInput.value.trim() || null

    generateBtn.disabled = true
    previewSection.hidden = true
    handoffSection.hidden = true
    statusEl.textContent = 'Generating…'

    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null }

    try {
      const { gifBytes, frameCount } = await encodeToGif(payload, { ecLevel, frameDelay, frameSize, url })

      const blob = new Blob([gifBytes], { type: 'image/gif' })
      currentBlobUrl = URL.createObjectURL(blob)

      previewImg.src = currentBlobUrl
      downloadBtn.href = currentBlobUrl
      downloadBtn.download = 'qrvid-' + Date.now() + '.gif'

      const fps = (1000 / frameDelay).toFixed(1)
      const estSeconds = ((frameCount * frameDelay) / 1000).toFixed(1)
      frameCountEl.textContent = frameCount + ' frame' + (frameCount === 1 ? '' : 's')
      scanTimeEl.textContent = 'Scan time ≈ ' + estSeconds + 's at ' + fps + ' fps'

      if (url) {
        handoffEl.textContent = buildHandoffUrl(url, payload)
        handoffSection.hidden = false
      }

      statusEl.textContent = ''
      previewSection.hidden = false
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message
      console.error(err)
    } finally {
      generateBtn.disabled = false
    }
  })
})
