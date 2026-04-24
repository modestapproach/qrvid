# qrvid

**Encode anything into an animated QR GIF. Scan it with a phone. No internet required.**

qrvid turns arbitrary data — a web page, a conversation, a file, a whole app — into a looping animated GIF made of QR codes. Point a camera at the screen. The phone assembles the data silently in the background, one frame at a time, until the download is complete.

No server. No account. No network. No link that expires.

---

## The Problem

The internet solved distribution. But distribution still requires infrastructure: a server to host the content, a network to deliver it, a URL that stays alive. When any of those break, the content disappears.

More specifically:

- **You want someone to load your website** but they're offline. You can give them a URL they can't visit yet.
- **You want to share a complex document** — a filled-out form, a configured chatbot conversation, a product specification — without creating an account or using a cloud service.
- **You have a display with no network connection** — a billboard, a price tag, a packaging label, an e-ink badge — and you want it to convey more information than a static QR code can hold.
- **You want to transfer data across a physical boundary** — between an air-gapped device and the outside world, between two phones with no mutual network, between a screen in one room and a camera in another.

A standard QR code holds about 3 KB of text. That covers a URL. It doesn't cover a document, a conversation, a configuration, or a web page.

qrvid covers all of those.

---

## The Insight

A single QR code is a snapshot. An animated GIF is a sequence. Run a sequence of QR codes fast enough, and a camera watching the screen can read all of them — turning a display into a one-way data channel at ~2 KB/s with no hardware beyond a screen and a phone.

The GIF loops. If the phone misses a frame, it catches it on the next loop. Eventually it has everything, and the download completes.

This is the same physical principle as smoke signals, semaphore, or a telegraph — information encoded in visible light, moving from one place to another without any network infrastructure. qrvid is just that idea running at 2 frames per second on a smartphone screen.

---

## How It Works

### Encoding

You give qrvid a payload — text, JSON, a URL, an entire HTML file. It:

1. Wraps it in a small JSON envelope: `{ "v": 1, "data": "...", "url": "https://..." }`
2. Compresses it with deflate (pako)
3. Splits the compressed bytes into chunks (~432 bytes each at default quality)
4. Encodes each chunk as a QR code with a frame header: session ID, frame index, total frames, CRC checksum
5. Assembles all QR frames into an animated GIF with a looping delay (default 500 ms/frame)
6. Prepends a **beacon frame** — explained below

The output is a standard `.gif` file that plays anywhere: browsers, phones, TVs, e-ink displays, printed pages, video billboards.

### The Beacon Frame

Every loop begins with a **beacon frame**: a small QR code floating on a solid black background, visually unlike every data frame (which are full-bleed white). It encodes:

```
QRVD:BEACON:<SESSION>/<TOTAL>
```

The beacon serves three purposes:
- It tells the decoder how many data frames to expect
- It acts as a visual "start of loop" marker — the viewer can see when one pass ends and another begins
- It allows the decoder to detect when the GIF on screen has changed mid-scan

The beacon frame works on any display — black-and-white e-ink, thermal printers, photocopies, greyscale monitors — because it uses no color, only contrast.

### Decoding (What Happens on the Phone)

The qrvid mobile app watches the camera continuously. When it sees the beacon flash:

1. It initialises a new session with the expected frame count
2. It begins collecting data frames, storing each by its index in a map
3. Duplicate frames (same index seen twice on loop 2) are silently ignored — fully idempotent
4. The progress bar fills: "14 / 21 frames · Loop 2"
5. When all frames are collected, the data is base45-decoded, decompressed, and parsed
6. If a URL was encoded, the app opens it in the browser with all the data attached as a hash fragment

If the user misses frame 7 on loop 1, they catch it on loop 2. The GIF keeps looping until the user puts their phone down. Self-healing is built into the loop.

### The URL Handoff

If the payload includes a URL, the decoder opens:

```
https://example.com/import#qrvid=<base64(JSON.stringify(envelope))>
```

The data arrives client-side in the URL hash. The target site reads it with two lines of JavaScript:

```js
const raw = atob(new URLSearchParams(location.hash.slice(1)).get('qrvid') ?? '')
const { data } = JSON.parse(raw)
```

Nothing hits the server. The URL is just a routing mechanism; all the content was in the GIF.

---

## What This Enables

### Serverless Deep Links

A professor encodes an entire pre-filled web form into a GIF. Students scan it in class. The form opens in their browsers, fully populated. No link, no sign-in, no cloud service. The [example that inspired this project](https://agentstudio.aroughidea.com/view#...) does exactly this — a complex tool configuration encoded into a shareable URL fragment. qrvid takes that idea and removes the URL entirely.

Any web application that reads `window.location.hash` can receive data this way: configured dashboards, pre-filled surveys, initialized chatbot sessions, saved game states, shared documents.

### Offline-First Content Delivery

Scan the GIF now. Open the site when you have Wi-Fi.

The URL is embedded in the data. The phone stores the entire payload. When the user gets connectivity, the app opens the URL and injects the data. The experience is seamless — no QR code that links to a dead server, no "page not found" when the URL rotates.

This works for restaurant menus at outdoor venues, conference session materials, trade show product sheets, transit information at stations without connectivity.

### E-Ink Packaging and Smart Labels

E-ink displays consume power only when they refresh. They can run for months on a coin cell. A product with a cycling e-ink label can stream assembly instructions, multi-language manuals, regulatory documents, or configuration profiles to a phone held nearby — encoded as a qrvid GIF cycling at 1–2 fps.

A single e-ink label replaces:
- Printed instruction manuals
- QR codes that link to pages that go offline
- Multi-language leaflets
- NFC tags that require reader infrastructure

The display has no radio. The phone needs no pairing. The data transfer is passive, visible, and requires no power spike.

### Digital Signage and Video Billboards

A video billboard cycles qrvid frames as part of its content loop. Pedestrians, passengers in vehicles, or visitors at events can scan at any time — even mid-sequence — and their phone will catch up on the next loop.

Applications: transit schedules, emergency information, event programs, venue maps, product catalogs, loyalty program enrollment, municipal notices.

The billboard needs no knowledge of who is scanning. There is no analytics infrastructure, no backend, no API call. The content is fully in the light.

### Air-Gapped Data Transfer

qrvid is a one-way optical data channel. The sender is any screen. The receiver is any camera. No shared network, no Bluetooth pairing, no USB port required.

Air-gapped environments — secure government systems, industrial control networks, medical devices, research laboratories — can use qrvid to move data across physical boundaries without any wired or wireless network connection. The data crosses the gap at the speed of light, through glass.

### Offline Web Apps and Embedded Experiences

A sufficiently compressed HTML page — a self-contained React app, a game, a form, a calculator, a reference document — can be encoded into a qrvid GIF. The decoder receives it, reconstructs the HTML, and opens it locally in the browser. No server. No app store. No download.

The practical limit depends on compression ratio: a minimal React app or game might be 20–80 KB compressed, fitting in 50–185 frames. At 500 ms per frame that's a 25–90 second scan — realistic for a kiosk, a product package, or a classroom setting.

This is executable content delivered through visible light.

---

## Industry Applications at a Glance

| Sector | Application |
|---|---|
| Education | Pre-filled classroom tools, encoded lecture materials, offline textbook supplements |
| Retail & Packaging | E-ink product labels, assembly instructions, multi-language manuals |
| Healthcare | Encoded prescriptions, patient intake forms, medical ID data (offline) |
| Events & Venues | Offline conference programs, venue maps, session materials, ticketing data |
| Digital Signage | Billboards delivering content to pedestrians, transit displays, stadium screens |
| Industrial / OT | Air-gapped firmware configs, calibration data across security boundaries |
| Government | Emergency broadcast data, offline civic forms, field data collection |
| Consumer Apps | Conversation sharing, save-state transfer between devices, contactless business cards |

---

## Technical Reference

### Frame Format

```
[Beacon frame] [Data frame 1] [Data frame 2] … [Data frame N] → loops
```

**Beacon:**
```
QRVD:BEACON:<SESSION>/<TOTAL>
```

**Data frame:**
```
QRVD:<SESSION>:<IDX>/<TOTAL>:<CRC>:<DATA>
```

All characters are from the QR alphanumeric character set, enabling alphanumeric mode (1.5–2× more efficient than byte mode).

### Capacity

| EC Level | Bytes per frame | Typical compressed payload | Approximate scan time |
|---|---|---|---|
| L (Low) | 553 bytes | 50 KB → ~90 frames | 45 s |
| M (Medium, default) | 432 bytes | 50 KB → ~116 frames | 58 s |
| Q (Quartile) | 302 bytes | 50 KB → ~166 frames | 83 s |
| H (High) | 228 bytes | 50 KB → ~220 frames | 110 s |

For most use cases — a document, a form, a short conversation — the compressed payload is under 5 KB, fitting in under 12 frames with a scan time under 10 seconds.

### Pipeline

```
payload
  → JSON envelope { v, data, url? }
  → deflate compression
  → split into chunks
  → per chunk: CRC-16 + base45 encode + frame header
  → render each to QR canvas
  → assemble into animated GIF (beacon first, then data frames)
```

### Components

| Component | Location | Language |
|---|---|---|
| Protocol core (encode + decode) | `qrvid-core.js` | JavaScript (UMD, no dependencies at runtime) |
| Web GIF encoder UI | `qrvid-encode.html` | Browser |
| CLI GIF encoder | `cli/encode.js` | Node.js |
| Mobile decoder | `mobile/` | TypeScript / React Native (Expo) |
| Live bidirectional QR transfer | `smokesignal.html` | Browser (see below) |

---

## Origin: smokesignal

qrvid is built on top of [jcomeauictx/smokesignal](https://github.com/jcomeauictx/smokesignal), an earlier experiment in permissionless optical data communications.

smokesignal's premise: two laptops facing each other, cameras on, exchanging QR codes in a bidirectional acknowledgment loop. Each device displays a QR code encoding a chunk of data plus a hash of the last thing it received from the other device. When the peer sees its hash in your packet, it knows you got its last chunk cleanly and sends the next one.

It's a hand-rolled reliable transport protocol running over visible light — no Wi-Fi, no Bluetooth, no cable. Two screens, two cameras, one room.

smokesignal proved the physical concept and delivered a working JavaScript implementation (using `jsQR` for scanning and `qrcodejs` for display) and a Python implementation (using `zbar` + `qrcode` + `cv2`). The `smokesignal.html` app in this repo still works for live bidirectional transfer between two devices.

qrvid takes the core insight — data in light, no infrastructure — and extends it to the **asynchronous, broadcast case**: one sender, many receivers, no acknowledgment required, packaged as a universally playable GIF file.

The protocol is simplified (no ACK hash, no bidirectional handshake), the capacity is higher (alphanumeric QR mode via base45 vs. binary mode), and the output is a file format that works on any screen, including printed paper.

The smokesignal idea scales further than this repo: a mesh of windows, each flashing QR codes to its neighbors, could route data across a neighborhood with no network infrastructure. That future is still in the README.

---

## Quickstart

### Encode (web)

```sh
make uwsgi        # or: python3 wsgi.py
# open http://127.0.0.1:8080/qrvid-encode.html
```

Paste your data, optionally add a URL, click Generate.

### Encode (CLI)

```sh
npm install
echo '{"hello":"world"}' | node cli/encode.js --stdin -o out.gif
node cli/encode.js myfile.json --url https://example.com/import -o out.gif
```

### Decode (mobile)

```sh
cd mobile && npx expo start
```

Open the Expo app on your phone, point it at a qrvid GIF playing on any screen.

### Live bidirectional transfer (smokesignal)

```sh
make uwsgi
# open http://127.0.0.1:8080/smokesignal.html on two devices facing each other
```

---

## License

MIT — see `LICENSE`.
