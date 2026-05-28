import {
  BITS_PER_PCM_SAMPLE,
  MAX_OFFSET_SAMPLES,
  type AudioCapacityInfo,
  type LoadedAudio,
  type PcmAudio,
} from './audio-types';
import { CRYPTO_OVERHEAD, HEADER_SIZE, OFFSET_BOOTSTRAP_SIZE } from './types';

export function getMaxOffsetSamples(sampleRate: number): number {
  return Math.min(MAX_OFFSET_SAMPLES, Math.floor(sampleRate * 0.1));
}

export function getTotalSampleCount(pcm: PcmAudio): number {
  return pcm.samples.length;
}

export function getAudioCapacityBytes(pcm: PcmAudio): number {
  const maxOffset = getMaxOffsetSamples(pcm.sampleRate);
  const usable = Math.max(0, pcm.samples.length - maxOffset);
  return Math.floor((usable * BITS_PER_PCM_SAMPLE) / 8);
}

export function getAudioMaxPayloadBytes(pcm: PcmAudio): number {
  return getAudioCapacityBytes(pcm) - HEADER_SIZE;
}

export function getAudioMaxMessageLength(pcm: PcmAudio): number {
  const maxPayload = getAudioMaxPayloadBytes(pcm);
  return Math.max(0, Math.floor((maxPayload - CRYPTO_OVERHEAD) / 2));
}

export function getAudioCapacityInfo(pcm: PcmAudio): AudioCapacityInfo {
  const maxOffsetSamples = getMaxOffsetSamples(pcm.sampleRate);
  return {
    maxPayloadBytes: getAudioMaxPayloadBytes(pcm),
    maxMessageChars: getAudioMaxMessageLength(pcm),
    totalSamples: pcm.samples.length,
    durationSec: pcm.frameCount / pcm.sampleRate,
    sampleRate: pcm.sampleRate,
    channels: pcm.channels,
    maxOffsetSamples,
  };
}

export function samplesNeededForBytes(byteLength: number): number {
  return Math.ceil((byteLength * 8) / BITS_PER_PCM_SAMPLE);
}

export function getMinimumAudioDuration(messageByteLength: number, sampleRate: number, channels: number): number {
  const stegoBytes = HEADER_SIZE + CRYPTO_OVERHEAD + messageByteLength;
  const minSamples = getMaxOffsetSamples(sampleRate) + samplesNeededForBytes(stegoBytes);
  const minFrames = Math.ceil(minSamples / channels);
  return minFrames / sampleRate;
}

export function assertAudioFits(pcm: PcmAudio, encryptedPayloadBytes: number): void {
  const stegoBytes = HEADER_SIZE + encryptedPayloadBytes;
  const maxOffset = getMaxOffsetSamples(pcm.sampleRate);
  const needed = maxOffset + samplesNeededForBytes(stegoBytes);

  if (needed > pcm.samples.length) {
    const minDur = getMinimumAudioDuration(
      encryptedPayloadBytes - CRYPTO_OVERHEAD,
      pcm.sampleRate,
      pcm.channels,
    );
    throw new Error(
      `Audio too short (${(pcm.frameCount / pcm.sampleRate).toFixed(1)}s). ` +
        `Need at least ~${minDur.toFixed(1)}s for this message.`,
    );
  }
}

export function pickRandomAudioOffset(totalSamples: number, stegoByteLength: number, sampleRate: number): number {
  const payloadSamples = samplesNeededForBytes(stegoByteLength);
  const bootstrapSamples = samplesNeededForBytes(OFFSET_BOOTSTRAP_SIZE);
  const minOffset = bootstrapSamples;
  const maxBySize = totalSamples - payloadSamples;
  const maxOffset = Math.min(getMaxOffsetSamples(sampleRate), maxBySize);

  if (maxOffset < minOffset) {
    throw new Error('Audio too short for payload even without offset');
  }

  return minOffset + Math.floor(Math.random() * (maxOffset - minOffset + 1));
}
