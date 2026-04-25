'use strict'

const jsQR = require('jsqr')
const core = require('../qrvid-core.js')

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  phase: 'idle',          // idle | collecting | complete | error
  sessionId: null,
  total: 0,
  delayMs: null,
  loopCount: 0,
  frames: new Map(),      // frameIndex → raw frame string
  result: null,           // { data, url, v }
  lastScanned: null,
}

function resetState() {
  state.phase = 'idle'
  state.sessionId = null
  state.total = 0
  state.delayMs = null
  state.loopCount = 0
  state.frames.clear()
  state.result = null
  state.lastScanned = null
}

// ── Frame handler ─────────────────────────────────────────────────────────────

function onQrScanned(raw) {
  if (raw === state.lastScanned) return   // dedupe rapid repeats
  state.lastScanned = raw

  const beacon = core.parseBeacon(raw)
  if (beacon) {
    if (state.sessionId && state.sessionId !== beacon.sessionId) {
      // New session started — reset
      resetState()
    }
    if (!state.sessionId) {
      state.sessionId = beacon.sessionId
      state.total = beacon.totalFrames
      state.delayMs = beacon.delayMs
      state.phase = 'collecting'
    } else {
      state.loopCount++
    }
    renderProgress()
    return
  }

  const frame = core.parseFrame(raw)
  if (!frame) return

  // If we see a data frame before any beacon, init from the frame
  if (!state.sessionId) {
    state.sessionId = frame.sessionId
    state.total = frame.totalFrames
    state.phase = 'collecting'
  }

  if (state.sessionId !== frame.sessionId) return  // stale frame from old session
  if (state.frames.has(frame.frameIndex)) return   // already have it

  state.frames.set(frame.frameIndex, raw)
  renderProgress()

  if (state.frames.size === state.total) {
    try {
      const allFrames = Array.from(state.frames.values())
      state.result = core.decode(allFrames)
      state.phase = 'complete'
      stopCamera()
      renderComplete()
    } catch (err) {
      state.phase = 'error'
      renderError(err.message)
    }
  }
}

// ── Camera ───────────────────────────────────────────────────────────────────

let videoEl, canvasEl, canvasCtx, rafId, stream

function initCamera(container) {
  videoEl = document.createElement('video')
  videoEl.setAttribute('playsinline', 'true')
  videoEl.setAttribute('autoplay', 'true')
  videoEl.muted = true
  videoEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'

  canvasEl = document.createElement('canvas')
  canvasEl.style.display = 'none'
  canvasCtx = canvasEl.getContext('2d')

  container.appendChild(videoEl)
  container.appendChild(canvasEl)
}

function startCamera(facingMode) {
  if (stream) stream.getTracks().forEach(t => t.stop())
  const constraints = { video: { facingMode: facingMode || 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } }
  return navigator.mediaDevices.getUserMedia(constraints)
    .then(s => {
      stream = s
      videoEl.srcObject = s
      return videoEl.play()
    })
    .then(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(scanTick)
    })
}

function stopCamera() {
  cancelAnimationFrame(rafId)
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
}

function scanTick() {
  if (videoEl.readyState >= videoEl.HAVE_ENOUGH_DATA) {
    canvasEl.width = videoEl.videoWidth
    canvasEl.height = videoEl.videoHeight
    canvasCtx.drawImage(videoEl, 0, 0)
    const imageData = canvasCtx.getImageData(0, 0, canvasEl.width, canvasEl.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code) onQrScanned(code.data)
  }
  if (state.phase !== 'complete') rafId = requestAnimationFrame(scanTick)
}

// ── UI ────────────────────────────────────────────────────────────────────────

function renderProgress() {
  const received = state.frames.size
  const total = state.total
  const pct = total > 0 ? Math.round(received / total * 100) : 0
  const left = total - received
  const fpsLabel = state.delayMs ? formatFps(state.delayMs) : ''
  const timeLabel = state.delayMs && left > 0 ? '~' + Math.ceil(left * state.delayMs / 1000) + 's' : ''
  const loopLabel = state.loopCount > 0 ? ' · Loop ' + (state.loopCount + 1) : ''

  el('overlay-hint').style.display = 'none'
  el('progress-box').style.display = 'flex'
  el('overlay-status').textContent = received + ' / ' + total + ' frames' + loopLabel
  el('overlay-bar-fill').style.width = pct + '%'
  el('overlay-sub').textContent = [timeLabel, fpsLabel].filter(Boolean).join(' · ')
}

function renderComplete() {
  const { data, url } = state.result

  el('overlay').hidden = true
  el('result-section').hidden = false
  el('result-data').textContent = data.length > 800 ? data.slice(0, 800) + '…' : data
  el('result-chars').textContent = data.length.toLocaleString() + ' chars'

  if (url) {
    const handoffUrl = buildHandoffUrl(state.result)
    el('result-url').textContent = url
    el('result-url-section').hidden = false
    el('open-btn').onclick = () => window.open(handoffUrl, '_blank')
  } else {
    el('result-url-section').hidden = true
  }

  el('copy-btn').onclick = () => {
    navigator.clipboard.writeText(data).then(() => {
      el('copy-btn').textContent = 'Copied!'
      setTimeout(() => { el('copy-btn').textContent = 'Copy data' }, 2000)
    })
  }
}

function renderError(msg) {
  el('overlay-status').textContent = 'Decode error'
  el('overlay-sub').textContent = msg
  el('overlay-bar-fill').style.width = '0%'
  el('overlay-bar-fill').style.background = '#f85149'
}

function formatFps(delayMs) {
  const fps = 1000 / delayMs
  return fps >= 1 ? fps.toFixed(fps < 2 ? 1 : 0) + ' fps' : (delayMs / 1000).toFixed(1) + 's/frame'
}

function utf8ToB64(str) {
  return btoa(Array.from(new TextEncoder().encode(str), b => String.fromCharCode(b)).join(''))
}

function buildHandoffUrl(payload) {
  const envelope = { v: payload.v, data: payload.data, url: payload.url }
  return payload.url + '#qrvid=' + utf8ToB64(JSON.stringify(envelope))
}

function el(id) { return document.getElementById(id) }

// ── Boot ──────────────────────────────────────────────────────────────────────

window.addEventListener('load', function () {
  const cameraWrap = el('camera-wrap')
  initCamera(cameraWrap)

  startCamera('environment').catch(() => startCamera('user')).catch(err => {
    el('overlay-hint').textContent = 'Camera error: ' + err.message
    el('overlay-hint').hidden = false
  })

  el('flip-btn').addEventListener('click', function () {
    const next = stream && stream.getVideoTracks()[0]?.getSettings().facingMode === 'environment' ? 'user' : 'environment'
    startCamera(next)
  })

  el('scan-again-btn').addEventListener('click', function () {
    resetState()
    el('result-section').hidden = true
    el('overlay-hint').style.display = ''
    el('progress-box').style.display = 'none'
    el('overlay-status').textContent = ''
    el('overlay-sub').textContent = ''
    el('overlay-bar-fill').style.width = '0%'
    el('overlay-bar-fill').style.background = ''
    startCamera('environment').catch(() => startCamera('user'))
  })
})
