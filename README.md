# Invisible

Desktop app for **hiding encrypted messages in images** (steganography). Messages are encrypted with AES-256-GCM using a key derived from your secret string (PBKDF2), and embedded in the least significant bits of RGB pixel channels — the image looks almost unchanged.

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
2. Choose an asset (PNG, JPEG, WebP…)
3. Enter your **secret key** (any string)
4. Enter your **message**
5. Click “Encrypt and hide”
6. **Download the PNG** — PNG is required to preserve hidden data (JPEG compression may destroy the payload)

### Decryption

1. Open the **Decryption** tab
2. Upload a PNG (or another image if the data is intact)
3. Enter the same **secret key**
4. View the decrypted message

## Image capacity

Data is hidden in **3 least significant bits per pixel** (R, G, B). Minimum image size depends on message length:

| Component | Size |
|-----------|------|
| Header (magic + version + length) | 9 bytes |
| Encryption (salt + IV + GCM tag + ciphertext) | 44+ bytes |
| Message | UTF-8 bytes |

Formula: `required_pixels = ceil((9 + 44 + len(message)) × 8 / 3)`

The UI shows a warning if the image is too small, and an approximate maximum message length for the selected file.

## Portable decryption module

Copy the `packages/stego-crypto/` folder into another project. The module uses the **Web Crypto API** and **Canvas** — it works in the browser and Electron renderer.

```typescript
import {
  decryptFromFile,
  encryptToFile,
  extractMessageFromImage,
  embedMessageInImage,
  loadImageFromFile,
  getCapacityInfo,
} from '@invisible/stego-crypto';

// Decrypt from File/Blob
const message = await decryptFromFile(imageFile, 'my-secret-key');

// Encrypt → PNG Blob
const pngBlob = await encryptToFile(imageFile, 'Hello!', 'my-secret-key');
```

Low-level functions (`decryptMessage`, `embedBytesInImage`, `extractBytesFromImage`) are also exported for custom integration.

## Security

- AES-256-GCM (authenticated encryption)
- PBKDF2-SHA256, 100,000 iterations for key derivation
- LSB steganography — hides the presence of data from casual viewing, but **does not cryptographically conceal the fact of steganography itself**

## Project structure

```
invisible/
├── forge.config.ts          # Electron Forge
├── packages/stego-crypto/   # Portable module
├── src/
│   ├── main.ts              # Main process (single instance)
│   ├── preload.ts
│   └── renderer/            # React UI
└── vite.*.config.ts
```

## License

MIT
