import {
  buildStegoPayload,
  headerSizeFor,
  parseStegoPayload,
  readHeader,
  readOffsetBootstrap,
  writeOffsetBootstrap,
} from './stego';
import { samplesNeededForBytes } from './audio-capacity';
import { encryptMessage, decryptMessage } from './crypto';
import {
  assertAudioFits,
  getAudioCapacityBytes,
  pickRandomAudioOffset,
} from './audio-capacity';
import { bytesRequiredForMessage } from './capacity';
import {
  HEADER_SIZE,
  HEADER_SIZE_V1,
  OFFSET_BOOTSTRAP_SIZE,
  VERSION,
  VERSION_V1,
  DecryptError,
} from './types';
import {
  AudioTooSmallError,
  type AudioEmbedResult,
  type LoadedAudio,
  type PcmAudio,
} from './audio-types';

const encoder = new TextEncoder();

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function isWavBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  return readFourCC(view, 0) === 'RIFF' && readFourCC(view, 8) === 'WAVE';
}

function isWavFile(file: File | Blob, buffer: ArrayBuffer): boolean {
  if (isWavBuffer(buffer)) return true;
  const name = ('name' in file ? file.name : '') ?? '';
  return name.toLowerCase().endsWith('.wav');
}

/**
 * Read 16-bit PCM directly from a WAV file — preserves LSB bits.
 * Web Audio decodeAudioData uses float32 and destroys steganography data.
 */
export function parseWavToPcm(buffer: ArrayBuffer): PcmAudio {
  const view = new DataView(buffer);

  if (!isWavBuffer(buffer)) {
    throw new Error('Not a valid WAV file');
  }

  let offset = 12;
  let sampleRate = 44100;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.byteLength) {
    const id = readFourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    offset += 8;

    if (id === 'fmt ') {
      const audioFormat = view.getUint16(offset, true);
      if (audioFormat !== 1) {
        throw new Error('Only uncompressed PCM WAV is supported for stego readback');
      }
      channels = view.getUint16(offset + 2, true);
      sampleRate = view.getUint32(offset + 4, true);
      bitsPerSample = view.getUint16(offset + 14, true);
      if (bitsPerSample !== 16) {
        throw new Error('Only 16-bit WAV is supported');
      }
    } else if (id === 'data') {
      dataOffset = offset;
      dataSize = size;
    }

    offset += size + (size % 2);
  }

  if (dataOffset < 0 || dataSize < 2) {
    throw new Error('WAV data chunk not found');
  }

  const sampleCount = Math.floor(dataSize / 2);
  const frameCount = Math.floor(sampleCount / channels);

  // Copy into own buffer (handles alignment + detaches from source)
  const raw = new Int16Array(buffer, dataOffset, sampleCount);
  const samples = new Int16Array(sampleCount);
  samples.set(raw);

  return { samples, sampleRate, channels, frameCount };
}

async function pcmToPreviewAudioBuffer(pcm: PcmAudio): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    const buffer = ctx.createBuffer(pcm.channels, pcm.frameCount, pcm.sampleRate);
    for (let ch = 0; ch < pcm.channels; ch++) {
      const channel = buffer.getChannelData(ch);
      for (let i = 0; i < pcm.frameCount; i++) {
        const s = pcm.samples[i * pcm.channels + ch];
        channel[i] = s / (s < 0 ? 0x8000 : 0x7fff);
      }
    }
    return buffer;
  } finally {
    await ctx.close();
  }
}

/** Load audio — WAV is parsed directly to preserve LSB stego data. */
export async function loadAudioFromFile(file: File | Blob): Promise<LoadedAudio> {
  const arrayBuffer = await file.arrayBuffer();

  if (isWavFile(file, arrayBuffer)) {
    const pcm = parseWavToPcm(arrayBuffer);
    const audioBuffer = await pcmToPreviewAudioBuffer(pcm);
    return { pcm, audioBuffer };
  }

  const ctx = new AudioContext();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const pcm = audioBufferToPcm(audioBuffer);
    return { pcm, audioBuffer };
  } finally {
    await ctx.close();
  }
}

export function audioBufferToPcm(buffer: AudioBuffer): PcmAudio {
  const channels = buffer.numberOfChannels;
  const frameCount = buffer.length;
  const samples = new Int16Array(frameCount * channels);

  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      samples[i * channels + ch] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  return {
    samples,
    sampleRate: buffer.sampleRate,
    channels,
    frameCount,
  };
}

/** Encode interleaved 16-bit PCM as a standard WAV blob. */
export function pcmToWavBlob(pcm: PcmAudio): Blob {
  const { samples, sampleRate, channels } = pcm;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const pcmOut = new Int16Array(buffer, 44, samples.length);
  pcmOut.set(samples);

  return new Blob([buffer], { type: 'audio/wav' });
}

function embedBytesInPcm(
  samples: Int16Array,
  bytes: Uint8Array,
  startSampleIndex = 0,
): Int16Array {
  const out = new Int16Array(samples);
  let bitIndex = 0;
  const totalBits = bytes.length * 8;

  for (let i = startSampleIndex; i < out.length && bitIndex < totalBits; i++) {
    const byteIdx = Math.floor(bitIndex / 8);
    const bitPos = 7 - (bitIndex % 8);
    const bit = (bytes[byteIdx] >> bitPos) & 1;
    out[i] = (out[i] & ~1) | bit;
    bitIndex++;
  }

  return out;
}

function extractBytesFromPcm(
  samples: Int16Array,
  byteCount: number,
  startSampleIndex = 0,
): Uint8Array {
  const out = new Uint8Array(byteCount);
  let bitIndex = 0;
  const totalBits = byteCount * 8;

  for (let i = startSampleIndex; i < samples.length && bitIndex < totalBits; i++) {
    const byteIdx = Math.floor(bitIndex / 8);
    const bitPos = 7 - (bitIndex % 8);
    const bit = samples[i] & 1;
    out[byteIdx] |= bit << bitPos;
    bitIndex++;
  }

  return out;
}

export async function embedMessageInAudio(
  pcm: PcmAudio,
  message: string,
  secret: string,
): Promise<AudioEmbedResult> {
  const messageBytes = encoder.encode(message).length;
  const required = bytesRequiredForMessage(messageBytes);
  const available = getAudioCapacityBytes(pcm);

  if (required > available) {
    throw new AudioTooSmallError(required, available);
  }

  const encrypted = await encryptMessage(message, secret);
  assertAudioFits(pcm, encrypted.length);

  const stegoLen = HEADER_SIZE + encrypted.length;
  const offsetSamples = pickRandomAudioOffset(
    pcm.samples.length,
    stegoLen,
    pcm.sampleRate,
  );
  const stegoBytes = buildStegoPayload(encrypted, offsetSamples);
  const bootstrap = writeOffsetBootstrap(offsetSamples);

  let newSamples = embedBytesInPcm(pcm.samples, bootstrap, 0);
  newSamples = embedBytesInPcm(newSamples, stegoBytes, offsetSamples);

  const resultPcm: PcmAudio = { ...pcm, samples: newSamples };
  const wavBlob = pcmToWavBlob(resultPcm);

  return { wavBlob, pcm: resultPcm, offsetSamples };
}

function resolveAudioStegoLocation(pcm: PcmAudio): {
  offsetSamples: number;
  headerInfo: NonNullable<ReturnType<typeof readHeader>>;
} {
  const totalSamples = pcm.samples.length;

  const legacyHeaderBytes = extractBytesFromPcm(pcm.samples, HEADER_SIZE_V1, 0);
  const legacyHeader = readHeader(legacyHeaderBytes);
  if (legacyHeader?.version === VERSION_V1) {
    const headerSize = headerSizeFor(VERSION_V1);
    const totalBytes = headerSize + legacyHeader.payloadLength;
    if (totalBytes * 8 <= totalSamples) {
      return { offsetSamples: 0, headerInfo: legacyHeader };
    }
  }

  const bootstrapBytes = extractBytesFromPcm(pcm.samples, OFFSET_BOOTSTRAP_SIZE, 0);
  const offsetSamples = readOffsetBootstrap(bootstrapBytes);
  const bootstrapEnd = samplesNeededForBytes(OFFSET_BOOTSTRAP_SIZE);

  if (offsetSamples < bootstrapEnd) {
    throw new DecryptError(
      'No hidden message found in this audio (invalid or missing stego header)',
    );
  }

  if (offsetSamples >= totalSamples) {
    throw new DecryptError('Invalid offset bootstrap in audio');
  }

  const headerSize = headerSizeFor(VERSION);
  const headerBytes = extractBytesFromPcm(pcm.samples, headerSize, offsetSamples);
  const headerInfo = readHeader(headerBytes);

  if (!headerInfo || headerInfo.version !== VERSION) {
    throw new DecryptError(
      'No hidden message found in this audio (invalid or missing stego header)',
    );
  }

  if (headerInfo.offsetPixels !== offsetSamples) {
    throw new DecryptError('Stego header offset mismatch — audio may be corrupted');
  }

  return { offsetSamples, headerInfo };
}

export async function extractMessageFromAudio(
  pcm: PcmAudio,
  secret: string,
): Promise<string> {
  const { offsetSamples, headerInfo } = resolveAudioStegoLocation(pcm);
  const headerSize = headerSizeFor(headerInfo.version);
  const totalBytes = headerSize + headerInfo.payloadLength;
  const samplesNeeded = totalBytes * 8;

  if (pcm.samples.length - offsetSamples < samplesNeeded) {
    throw new DecryptError('Corrupted stego header — payload length exceeds audio capacity');
  }

  const fullPayload = extractBytesFromPcm(pcm.samples, totalBytes, offsetSamples);
  const encrypted = parseStegoPayload(fullPayload, headerInfo);

  if (!encrypted) {
    throw new DecryptError('Failed to parse hidden payload');
  }

  return decryptMessage(encrypted, secret);
}

export {
  getAudioCapacityInfo,
  getAudioCapacityBytes,
  getAudioMaxPayloadBytes,
  getAudioMaxMessageLength,
  getMinimumAudioDuration,
  getMaxOffsetSamples,
} from './audio-capacity';
