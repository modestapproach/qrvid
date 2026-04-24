# qrvid Protocol v1

## Overview

qrvid encodes arbitrary data payloads into a sequence of QR codes and packages
them as an animated GIF. Any device with a camera can scan the GIF and
reconstruct the original data — no server, no network, no account required.

---

## GIF Structure

Every qrvid GIF contains **two types of frames** in a fixed order:

```
[Beacon frame] [Data frame 1] [Data frame 2] … [Data frame N] → loops back to beacon
```

Because the GIF loops forever, a scanner that starts mid-sequence will naturally
catch any missed frames on the next loop without any extra coordination.

---

## Beacon Frame

The **beacon frame** is the first frame of every loop. It is visually distinct:
a small QR code centered on a solid black background (≈55% of frame width).
This contrast is intentional and works on any screen — colour, greyscale,
e-ink, or thermal printer.

**Beacon string format:**
```
QRVD:BEACON:<SESSION>/<TOTAL>/<DELAY_MS>
```

Example: `QRVD:BEACON:A3F2B1C0/21/500`

| Field | Example | Description |
|---|---|---|
| `SESSION` | `A3F2B1C0` | 8 uppercase hex chars — same session ID as all data frames |
| `TOTAL` | `21` | Count of data frames only (beacon not included) |
| `DELAY_MS` | `500` | Intended milliseconds per frame as set by the encoder |

**Beacon parsing regex:**
```
/^QRVD:BEACON:([0-9A-F]{8})\/(\d+)(?:\/(\d+))?$/
```

The third field (`DELAY_MS`) is optional for backward compatibility — old decoders
that only parse `SESSION/TOTAL` simply ignore it.

The GIF file itself also encodes frame timing in its header (GIF89a delay field),
but a camera watching a screen cannot read GIF metadata — it only sees pixels.
The beacon is the only channel by which the encoder can communicate the intended
speed to the decoder.

The decoder uses the beacon to:
1. Initialise the session and learn frame count on first sight
2. Display speed info immediately: "designed for 2 fps"
3. Show time remaining: `framesLeft × delayMs` (e.g. "~9s remaining")
4. Detect when the GIF on screen has changed (different session ID)
5. Track loop count for UI: "Loop 2 — 3 frames remaining"

The beacon frame does **not** count toward `TOTAL`. `TOTAL` is the count of
data frames only.

---

## Data Frame String Format

Each QR code in the GIF encodes a single UTF-8 string:

```
QRVD:<SESSION>:<IDX>/<TOTAL>:<CRC>:<DATA>
```

All characters are from the **QR alphanumeric character set**
(`0–9`, `A–Z`, `space`, `$`, `%`, `*`, `+`, `-`, `.`, `/`, `:`), which
enables alphanumeric mode encoding — 1.5–2× more data capacity than byte mode.

### Fields

| Field | Example | Description |
|---|---|---|
| `QRVD` | `QRVD` | 4-char magic identifier (protocol name) |
| `SESSION` | `A3F2B1C0` | 8 uppercase hex chars — random 4-byte session ID tying all frames together |
| `IDX` | `3` | 1-based frame index |
| `TOTAL` | `21` | Total number of frames in this session |
| `CRC` | `29B1` | CRC-16/CCITT-FALSE of the raw chunk bytes before base45 encoding, 4 uppercase hex chars |
| `DATA` | `7WE+7YR…` | Base45-encoded compressed chunk bytes |

### Example (single frame)

```
QRVD:A3F2B1C0:1/1:BB1E:7WE+7YR.KEXL5FEH...
```

### Parsing regex

```
/^QRVD:([0-9A-F]{8}):(\d+)\/(\d+):([0-9A-F]{4}):(.+)$/
```

When reading QR codes from a physical scanner, normalize to uppercase before
matching (some scanners emit lowercase).

---

## Payload Envelope

Before chunking, the payload is wrapped in a JSON envelope and compressed:

```json
{ "v": 1, "data": "<string>", "url": "https://..." }
```

- **`v`** — Protocol version integer (currently `1`)
- **`data`** — The payload as a string. Pass objects through `JSON.stringify` before placing here.
- **`url`** — Optional. When present, the decoder opens `url#qrvid=<base64>` (see URL handoff below).

---

## Encode Pipeline

```
input payload (string | object)
  │
  ├─ if object → JSON.stringify(payload)
  │
  ▼
JSON.stringify({ v: 1, data, url? })           ← envelope
  │
  ▼
pako.deflate(envelopeJson)                      ← Uint8Array, compressed
  │
  ▼
split into chunks of N bytes                    ← N = CHUNK_SIZES[ecLevel]
  │
  ▼  for each chunk[i]:
  ├─ crc16(chunk[i]) → 4-char uppercase hex
  ├─ base45.encode(chunk[i]) → uppercase string
  └─ "QRVD:" + session + ":" + (i+1) + "/" + total + ":" + crc + ":" + b45
  │
  ▼
render each frame string to a QR code image (canvas)
  │
  ▼
assemble images into an animated GIF (loop=0, configurable delay)
```

---

## Decode Pipeline

```
frameStrings: string[]
  │
  ▼
parseFrame(str) each                            ← null → not a qrvid frame, skip
  │
  ▼
validate: all frames share same sessionId
validate: exactly totalFrames frames present
sort by frameIndex (1..N)
  │
  ▼  for each frame:
  ├─ base45.decode(encodedData) → Uint8Array
  └─ crc16(bytes) must match frame.crc         ← throws on mismatch
  │
  ▼
concatenate Uint8Arrays
  │
  ▼
pako.inflate(concatenated) → envelopeJson
  │
  ▼
JSON.parse(envelopeJson) → { v, data, url? }
```

---

## Chunk Sizes by EC Level

Derived from QR Version 20 alphanumeric capacity minus 28-char header overhead,
converted from base45 chars back to raw bytes (factor ≈ 2/3):

| EC Level | Bytes per frame |
|---|---|
| L | 553 |
| M | 432 (default) |
| Q | 302 |
| H | 228 |

A 50 KB payload compresses to roughly 5–15 KB (depending on content) and fits
in 12–35 frames at M level. At 500 ms/frame that's 6–18 seconds scan time.

---

## URL Hash-Fragment Handoff

When the encoded data includes a `url` field, the mobile decoder opens:

```
https://example.com/import#qrvid=<base64url(JSON.stringify(envelope))>
```

The hash value is `btoa(JSON.stringify(envelope))` — **intentionally
uncompressed** so the target site only needs `atob()` + `JSON.parse()`, with no
library required on the receiving end.

### Receiving site (JavaScript)

```js
const raw = atob(new URLSearchParams(location.hash.slice(1)).get('qrvid') ?? '')
const { v, data, url } = JSON.parse(raw)
// data is the original string payload
```

This enables **serverless deep links**: encode a full ChatGPT conversation,
scan the GIF, tap "Open in Browser", and the target site receives all the data
client-side — nothing hits a server.

---

## CRC Algorithm

**CRC-16/CCITT-FALSE**

- Polynomial: `0x1021`
- Initial value: `0xFFFF`
- Input reflection: none
- Output reflection: none
- Final XOR: none

Known test vector: `crc16(bytes('123456789')) === 0x29B1`

The CRC is computed on the **raw chunk bytes before base45 encoding**.
The decoder must base45-decode first, then validate the CRC.

---

## Base45 Alphabet (RFC 9285)

```
0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:
```

Encoding maps every 2 bytes → 3 characters (plus 1 byte → 2 characters for odd
remainders), using integer arithmetic in base 45.

All characters in the alphabet are valid QR alphanumeric characters, which is
why this encoding is used instead of base64.

---

## Session ID

A random 32-bit value (4 bytes), expressed as 8 uppercase hex characters.
Collision probability is 1 in 4 billion; since sessions are ephemeral (seconds),
collisions are not a practical concern.

When a scanner sees frames from two different session IDs, it should start fresh
with the most recently seen session.

---

## Reference Implementations

| Component | Location | Language |
|---|---|---|
| Protocol + encode + decode | `qrvid-core.js` | JavaScript (UMD) |
| Web GIF encoder | `qrvid-encode.html` + `qrvid-encode-bundle.js` | Browser JS |
| CLI GIF encoder | `cli/encode.js` | Node.js |
| Mobile decoder | `mobile/` | TypeScript / React Native (Expo) |
