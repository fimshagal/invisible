import { useCallback, useState } from 'react';
import {
  embedMessageInMedia,
  loadImageFromFile,
  loadAudioFromFile,
  detectMediaKind,
  getCapacityInfo,
  getAudioCapacityInfo,
  getMinimumDimensions,
  getMinimumAudioDuration,
  bytesRequiredForMessage,
  getCapacityBytes,
  getAudioCapacityBytes,
  type RgbaImage,
  type MediaKind,
  type LoadedAudio,
} from '@stego-crypto/index';
import { WaveformPreview } from './WaveformPreview';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function EncryptPanel() {
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<RgbaImage | null>(null);
  const [audioInfo, setAudioInfo] = useState<LoadedAudio | null>(null);
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; text: string }>({
    type: 'idle',
    text: '',
  });
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultExt, setResultExt] = useState<'png' | 'wav'>('png');

  const onMediaChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const kind = detectMediaKind(file);
    setMediaFile(file);
    setMediaKind(kind);
    setResultUrl(null);
    setStatus({ type: 'idle', text: '' });
    setImageInfo(null);
    setAudioInfo(null);

    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));

    try {
      if (kind === 'audio') {
        const loaded = await loadAudioFromFile(file);
        setAudioInfo(loaded);
      } else {
        const img = await loadImageFromFile(file);
        setImageInfo(img);
      }
    } catch {
      setStatus({ type: 'err', text: 'Failed to read file' });
    }
  }, [preview]);

  const imageCapacity = imageInfo ? getCapacityInfo(imageInfo.width, imageInfo.height) : null;
  const audioCapacity = audioInfo ? getAudioCapacityInfo(audioInfo.pcm) : null;

  const messageBytes = new TextEncoder().encode(message).length;
  const requiredBytes = message ? bytesRequiredForMessage(messageBytes) : 0;

  const availableBytes =
    mediaKind === 'audio' && audioInfo
      ? getAudioCapacityBytes(audioInfo.pcm)
      : mediaKind === 'image' && imageInfo
        ? getCapacityBytes(imageInfo.width, imageInfo.height)
        : 0;

  const fits = message && availableBytes > 0 ? requiredBytes <= availableBytes : true;

  const handleEncrypt = async () => {
    const source = mediaKind === 'audio' ? audioInfo?.pcm : imageInfo;
    if (!mediaFile || !mediaKind || !source || !secret || !message) {
      setStatus({ type: 'err', text: 'Please fill in all fields' });
      return;
    }

    setStatus({ type: 'loading', text: 'Encrypting…' });

    try {
      const result = await embedMessageInMedia(mediaKind, source, message, secret);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(result.blob);
      setResultUrl(url);
      setResultExt(result.extension);

      const doneMsg =
        result.kind === 'audio'
          ? 'Done! Download the file below — output is always WAV (lossless) to preserve hidden data.'
          : 'Done! Download the file below — always share as PNG (JPEG recompression destroys the payload).';

      setStatus({ type: 'ok', text: doneMsg });
    } catch (err) {
      setStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Encryption failed',
      });
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `invisible-${Date.now()}.${resultExt}`;
    a.click();
  };

  return (
    <section className="panel">
      <div className="field">
        <label htmlFor="enc-media">Image or audio (PNG / JPEG / WAV / MP3 / OGG / FLAC…)</label>
        <input
          id="enc-media"
          type="file"
          accept="image/*,audio/*,.mp3,.ogg,.flac,.m4a,.aac,.opus,.wav"
          onChange={onMediaChange}
        />
        {(preview || audioInfo) && (
          <div className="preview-row">
            {mediaKind === 'audio' && audioInfo ? (
              <WaveformPreview audioBuffer={audioInfo.audioBuffer} />
            ) : (
              preview && <img src={preview} alt="Preview" className="preview" />
            )}
            {imageCapacity && imageInfo && (
              <div className="meta">
                <p>
                  {imageInfo.width}×{imageInfo.height} px — capacity ~{' '}
                  {formatBytes(imageCapacity.maxPayloadBytes)} of data
                </p>
                <p>Max message length: ~{imageCapacity.maxMessageChars} characters</p>
              </div>
            )}
            {audioCapacity && audioInfo && (
              <div className="meta">
                <p>
                  {formatDuration(audioCapacity.durationSec)} · {audioCapacity.sampleRate} Hz ·{' '}
                  {audioCapacity.channels} ch — capacity ~{' '}
                  {formatBytes(audioCapacity.maxPayloadBytes)}
                </p>
                <p>Max message length: ~{audioCapacity.maxMessageChars} characters</p>
                {mediaKind === 'audio' &&
                  !fileIsWav(mediaFile) &&
                  mediaFile && (
                    <p className="hint">Input will be decoded and saved as WAV.</p>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="enc-secret">Secret key</label>
        <input
          id="enc-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Any string"
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="enc-message">Message</label>
        <textarea
          id="enc-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Text to hide inside the file"
          rows={4}
        />
        {message && !fits && mediaKind === 'image' && imageInfo && (
          <p className="hint warn">
            {(() => {
              const min = getMinimumDimensions(messageBytes);
              return `Image too small. Need at least ~${min.minSide}×${min.minSide} px (${min.minPixels.toLocaleString()} pixels).`;
            })()}
          </p>
        )}
        {message && !fits && mediaKind === 'audio' && audioInfo && (
          <p className="hint warn">
            Audio too short. Need at least ~
            {getMinimumAudioDuration(
              messageBytes,
              audioInfo.pcm.sampleRate,
              audioInfo.pcm.channels,
            ).toFixed(1)}
            s for this message.
          </p>
        )}
        {message && fits && availableBytes > 0 && (
          <p className="hint">
            Requires {formatBytes(requiredBytes)} of {formatBytes(availableBytes)} available
          </p>
        )}
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={handleEncrypt} disabled={!fits}>
          Encrypt & hide
        </button>
        {resultUrl && (
          <button type="button" className="btn secondary" onClick={handleDownload}>
            Download file
          </button>
        )}
      </div>

      {status.text && (
        <p className={`status ${status.type}`} role="status">
          {status.text}
        </p>
      )}
    </section>
  );
}

function fileIsWav(file: File | null): boolean {
  if (!file) return false;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'wav' || file.type.includes('wav');
}
