import { StegoError } from './types';

export const BITS_PER_PCM_SAMPLE = 1;

/** Max random start offset in PCM samples (~100 ms at 44.1 kHz) */
export const MAX_OFFSET_SAMPLES = 4410;

export interface PcmAudio {
  /** Interleaved signed 16-bit PCM */
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  frameCount: number;
}

export interface LoadedAudio {
  pcm: PcmAudio;
  audioBuffer: AudioBuffer;
}

export interface AudioCapacityInfo {
  maxPayloadBytes: number;
  maxMessageChars: number;
  totalSamples: number;
  durationSec: number;
  sampleRate: number;
  channels: number;
  maxOffsetSamples: number;
}

export interface AudioEmbedResult {
  wavBlob: Blob;
  pcm: PcmAudio;
  offsetSamples: number;
}

export class AudioTooSmallError extends StegoError {
  readonly requiredBytes: number;
  readonly availableBytes: number;

  constructor(required: number, available: number) {
    super(
      `Audio too short: need ${required} bytes capacity, have ${available}. ` +
        `Try a longer clip or a shorter message.`,
    );
    this.name = 'AudioTooSmallError';
    this.requiredBytes = required;
    this.availableBytes = available;
  }
}

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'wav',
  'mp3',
  'ogg',
  'flac',
  'm4a',
  'aac',
  'webm',
  'opus',
] as const;

export const SUPPORTED_AUDIO_MIMES = [
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/flac',
  'audio/mp4',
  'audio/aac',
  'audio/webm',
] as const;
