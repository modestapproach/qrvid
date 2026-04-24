#!/usr/bin/env node
'use strict'

const { createCanvas } = require('canvas')
const QRCode = require('qrcode')
const GifWriter = require('omggif').GifWriter
const core = require('../qrvid-core.js')
const fs = require('fs')
const path = require('path')

const USAGE = `
Usage: node cli/encode.js [file] [options]

Options:
  --stdin           Read data from stdin instead of a file
  -o, --output      Output GIF path (default: qrvid-out.gif)
  --url <url>       Embed a target URL for hash-fragment handoff
  --ec-level <L|M|Q|H>  Error correction level (default: M)
  --delay <ms>      Frame delay in milliseconds (default: 500)
  --size <px>       QR frame size in pixels (default: 300)
  -h, --help        Show this help

Examples:
  echo '{"hello":"world"}' | node cli/encode.js --stdin -o out.gif
  node cli/encode.js data.json --url https://example.com/import -o out.gif
`

// Parse minimal argv without a dependency
function parseArgs(argv) {
  const args = { _file: null, stdin: false, output: 'qrvid-out.gif', url: null, ecLevel: 'M', delay: 500, size: 300 }
  let i = 2
  while (i < argv.length) {
    const a = argv[i]
    switch (a) {
      case '--stdin':      args.stdin = true; break
      case '-o': case '--output': args.output = argv[++i]; break
      case '--url':        args.url = argv[++i]; break
      case '--ec-level':   args.ecLevel = argv[++i].toUpperCase(); break
      case '--delay':      args.delay = parseInt(argv[++i], 10); break
      case '--size':       args.size = parseInt(argv[++i], 10); break
      case '-h': case '--help': process.stdout.write(USAGE); process.exit(0); break
      default:
        if (!a.startsWith('-')) args._file = a
        else { process.stderr.write('Unknown option: ' + a + '\n'); process.exit(1) }
    }
    i++
  }
  return args
}

async function readStdin() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf-8')
}

async function renderFrame(text, size, ecLevel) {
  const canvas = createCanvas(size, size)
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: ecLevel,
    margin: 2,
    width: size,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return canvas.getContext('2d').getImageData(0, 0, size, size)
}

// Beacon: small QR centered on solid black canvas — B&W, works on any screen
async function renderBeaconFrame(text, size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  const qrSize = Math.round(size * 0.55)
  const offset = Math.round((size - qrSize) / 2)
  const qrCanvas = createCanvas(qrSize, qrSize)
  await QRCode.toCanvas(qrCanvas, text, {
    errorCorrectionLevel: 'L',
    margin: 3,
    width: qrSize,
    color: { dark: '#000000', light: '#ffffff' },
  })
  ctx.drawImage(qrCanvas, offset, offset, qrSize, qrSize)
  return ctx.getImageData(0, 0, size, size)
}

function rgbaToIndexed(imageData) {
  const pixels = new Uint8Array(imageData.width * imageData.height)
  const data = imageData.data
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = data[i * 4] < 128 ? 1 : 0
  }
  return pixels
}

function assembleGif(frames, size, delay) {
  // omggif palette: array of packed 0xRRGGBB integers, length must be power of 2
  const palette = [0xffffff, 0x000000]  // index 0=white, index 1=black
  const bufSize = size * size * frames.length * 5 + 1024
  const buf = new Uint8Array(bufSize)
  const gif = new GifWriter(buf, size, size, { loop: 0, palette })
  const delayCentiseconds = Math.round(delay / 10)
  for (const frame of frames) {
    gif.addFrame(0, 0, size, size, rgbaToIndexed(frame), { delay: delayCentiseconds })
  }
  return buf.slice(0, gif.end())
}

async function main() {
  const args = parseArgs(process.argv)

  if (!args.stdin && !args._file) {
    process.stderr.write('Error: provide a file or --stdin\n' + USAGE)
    process.exit(1)
  }

  let data
  if (args.stdin) {
    data = await readStdin()
  } else {
    data = fs.readFileSync(path.resolve(args._file), 'utf-8')
  }

  const { beacon, dataFrames, total } = core.createFrameStrings(data, { ecLevel: args.ecLevel, url: args.url })
  process.stderr.write('Encoding ' + total + ' data frame(s) + 1 beacon…\n')

  const beaconImageData = await renderBeaconFrame(beacon, args.size)
  const dataImageData = await Promise.all(
    dataFrames.map(str => renderFrame(str, args.size, args.ecLevel))
  )

  const gifBytes = assembleGif([beaconImageData, ...dataImageData], args.size, args.delay)
  const outPath = path.resolve(args.output)
  fs.writeFileSync(outPath, gifBytes)

  process.stderr.write(
    'Written ' + gifBytes.length + ' bytes → ' + outPath + '\n' +
    'Frames: 1 beacon + ' + total + ' data × ' + args.delay + 'ms = ' +
    ((total + 1) * args.delay / 1000).toFixed(1) + 's per loop\n'
  )
}

main().catch(function (err) {
  process.stderr.write('Error: ' + err.message + '\n')
  process.exit(1)
})
