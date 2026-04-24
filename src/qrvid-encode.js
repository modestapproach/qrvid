'use strict'

const QRCode = require('qrcode')
const GifWriter = require('omggif').GifWriter
const core = require('../qrvid-core.js')

// Render a QR code frame string to a canvas, return RGBA ImageData
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

  const frameStrings = core.createFrameStrings(payload, { ecLevel, url })
  const imageData = await Promise.all(
    frameStrings.map(str => renderFrame(str, frameSize, ecLevel))
  )
  const gifBytes = assembleGif(imageData, frameSize, frameDelay)
  return { gifBytes, frameCount: frameStrings.length, frameStrings }
}

// Build the hash-fragment URL that a target site can consume
function buildHandoffUrl(url, payload) {
  const envelope = { v: 1, data: typeof payload === 'string' ? payload : JSON.stringify(payload) }
  envelope.url = url
  const fragment = btoa(JSON.stringify(envelope))
  return url + '#qrvid=' + fragment
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
