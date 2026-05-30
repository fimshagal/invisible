# Invisible

Desktop app for **hiding encrypted messages in images or audio** (LSB steganography). Messages are encrypted with AES-256-GCM using a key derived from your secret string (PBKDF2), then embedded in the least significant bits of pixel RGB channels or PCM samples — the file looks and sounds almost unchanged.

## Stack

- [Electron](https://www.electronjs.org/) + [Electron Forge](https://www.electronforge.io/) (Vite plugin)
- React
- Standalone portable module `@invisible/stego-crypto` in `packages/stego-crypto/`

## Requirements

- Node.js 18+
- npm

## Getting started

```bash
# Install dependencies
npm install

# Run in development mode
npm start
```

## Build

```bash
# Package the app
npm run package

# Create an installer (Windows — Squirrel)
npm run make
```

## Usage

### Encryption

1. Open the **Encryption** tab
2. Choose an **image** or **audio** file (see [Supported formats](#supported-formats))
3. Enter your **secret key** (any string)
4. Enter your **message**
5. Click “Encrypt & hide”
6. **Download the file** — images are saved as **PNG**, audio as **WAV** (lossless formats required to preserve hidden data)

### Decryption

1. Open the **Decryption** tab
2. Upload the stego **PNG** or **WAV** (see [Supported formats](#supported-formats))
3. Enter the same **secret key**
4. View the decrypted message

## Supported formats

Invisible works with **images** and **audio**. The library auto-detects the kind from MIME type or file extension (`detectMediaKind`).

### Summary

| | Images | Audio |
|---|--------|-------|
| **Encrypt — input** | Any raster image the browser can decode (see below) | WAV, MP3, OGG, FLAC, M4A, AAC, WebM, Opus, … |
| **Encrypt — output** | **PNG** (always) | **WAV** — 16-bit PCM (always) |
| **Decrypt — input** | **PNG** (recommended) | **WAV** — 16-bit PCM (required for existing stego) |
| **Stego carrier** | 3 LSB per RGB channel | 1 LSB per PCM sample |

### Images

**Input (encryption)** — anything Chromium/`createImageBitmap` can open, for example:

| Format | Role |
|--------|------|
| **PNG** | Decoded losslessly (8-bit RGB/RGBA/palette). Best choice if the file may already contain hidden data. |
| **JPEG, WebP, GIF, BMP, AVIF, …** | Decoded to pixels via Canvas. Fine as a **cover image** for a new message; recompression would destroy payload. |

**Output (encryption)** — always **PNG** (lossless). Share only this file.

**Input (decryption)** — use the **PNG** produced by encryption. Other formats (JPEG, WebP, …) recompress pixels and usually **destroy** the hidden payload. PNG is the only reliable stego container for images.

### Audio

**Input (encryption)** — detected by `audio/*` MIME or extension:

| Extension | Typical format |
|-----------|----------------|
| `.wav` | PCM WAV (read directly, LSB preserved) |
| `.mp3` | MPEG audio |
| `.ogg` | Ogg Vorbis / Opus |
| `.flac` | FLAC |
| `.m4a`, `.aac` | AAC in MP4 / raw AAC |
| `.webm`, `.opus` | WebM / Opus |

Any other format the **Web Audio API** can decode may also work as input, but only the extensions above are recognized explicitly when MIME type is missing.

Non-WAV input is decoded to PCM and re-exported as WAV — the original compressed file is **not** modified in place.

**Output (encryption)** — always **16-bit PCM WAV** (lossless). Share only this file.

**Input (decryption)** — use the **WAV** produced by encryption. Requirements for reading hidden data:

- RIFF/WAVE container
- Uncompressed PCM (format tag `1`)
- **16-bit** samples

MP3/OGG/FLAC and other compressed formats are decoded for **preview and new embedding only**; transcoding removes LSB data, so they cannot carry an existing hidden message.

### Practical rules

1. **Always distribute stego files in the output format** — PNG for images, WAV for audio.
2. **Lossy formats are cover media only** — JPEG/MP3/etc. are OK as input when creating a new message, but the result must be saved and shared as PNG/WAV.
3. **Do not re-encode stego files** — resizing, “Save for web”, audio editors, or format conversion can wipe the payload.
4. **WAV stego must stay 16-bit PCM** — float32/float64 or compressed WAV variants are not supported for readback.

## Capacity

Both formats share the same payload header and AES-256-GCM overhead:

| Component | Size |
|-----------|------|
| Header (magic + version + length) | 9 bytes |
| Encryption (salt + IV + GCM tag + ciphertext) | 44+ bytes |
| Message | UTF-8 bytes |

### Images

Data is hidden in **3 least significant bits per pixel** (R, G, B).

Formula: `required_pixels = ceil((9 + 44 + len(message)) × 8 / 3)`

### Audio

Data is hidden in **1 least significant bit per PCM sample** (16-bit signed, interleaved channels).

Formula: `required_samples = ceil((9 + 44 + len(message)) × 8 / 1)`

Capacity grows with clip duration, sample rate, and channel count. The UI shows warnings when the file is too small and estimates the maximum message length.

## Portable module

Copy the `packages/stego-crypto/` folder into another project. The module uses the **Web Crypto API**, **Canvas** (images), and **Web Audio API** (audio decode) — it works in the browser and Electron renderer.

```typescript
import {
  decryptFromFile,
  encryptToFile,
  detectMediaKind,
  embedMessageInMedia,
  extractMessageFromImage,
  extractMessageFromAudio,
  embedMessageInImage,
  embedMessageInAudio,
  loadImageFromFile,
  loadAudioFromFile,
  getCapacityInfo,
  getAudioCapacityInfo,
} from '@invisible/stego-crypto';

// Auto-detect image vs audio from File/Blob
const message = await decryptFromFile(mediaFile, 'my-secret-key');
const resultBlob = await encryptToFile(mediaFile, 'Hello!', 'my-secret-key');
// resultBlob is PNG for images, WAV for audio

// Explicit media kind
const kind = detectMediaKind(file);
if (kind === 'audio') {
  const { pcm } = await loadAudioFromFile(file);
  const info = getAudioCapacityInfo(pcm);
  const text = await extractMessageFromAudio(pcm, 'my-secret-key');
} else {
  const image = await loadImageFromFile(file);
  const info = getCapacityInfo(image.width, image.height);
  const text = await extractMessageFromImage(image, 'my-secret-key');
}
```

Low-level functions (`decryptMessage`, `embedBytesInImage`, `extractBytesFromImage`, `pcmToWavBlob`, …) are also exported for custom integration.

## Security

- AES-256-GCM (authenticated encryption)
- PBKDF2-SHA256, 100,000 iterations for key derivation
- LSB steganography — hides the presence of data from casual viewing/listening, but **does not cryptographically conceal the fact of steganography itself**

## Project structure

```
invisible/
├── forge.config.ts          # Electron Forge
├── packages/stego-crypto/   # Portable module (image + audio)
├── src/
│   ├── main.ts              # Main process (single instance)
│   ├── preload.ts
│   └── renderer/            # React UI
└── vite.*.config.ts
```

## License

MIT
