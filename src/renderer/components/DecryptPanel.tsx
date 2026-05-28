import { useCallback, useState } from 'react';
import {
  decryptFromFile,
  loadImageFromFile,
  loadAudioFromFile,
  detectMediaKind,
  type MediaKind,
  type LoadedAudio,
} from '@stego-crypto/index';
import { WaveformPreview } from './WaveformPreview';

export function DecryptPanel() {
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [audioInfo, setAudioInfo] = useState<LoadedAudio | null>(null);
  const [secret, setSecret] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; text: string }>({
    type: 'idle',
    text: '',
  });

  const onMediaChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const kind = detectMediaKind(file);
    setMediaFile(file);
    setMediaKind(kind);
    setResult(null);
    setStatus({ type: 'idle', text: '' });
    setAudioInfo(null);

    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));

    try {
      if (kind === 'audio') {
        const loaded = await loadAudioFromFile(file);
        setAudioInfo(loaded);
      } else {
        await loadImageFromFile(file);
      }
    } catch {
      setStatus({ type: 'err', text: 'Failed to read file' });
    }
  }, [preview]);

  const handleDecrypt = async () => {
    if (!mediaFile || !secret) {
      setStatus({ type: 'err', text: 'Add a file and secret key' });
      return;
    }

    setStatus({ type: 'loading', text: 'Decrypting…' });
    setResult(null);

    try {
      const text = await decryptFromFile(mediaFile, secret);
      setResult(text);
      setStatus({ type: 'ok', text: 'Message found!' });
    } catch (err) {
      setStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Decryption failed',
      });
    }
  };

  return (
    <section className="panel">
      <div className="field">
        <label htmlFor="dec-media">Image or audio with hidden message</label>
        <input
          id="dec-media"
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
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="dec-secret">Secret key</label>
        <input
          id="dec-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Same key used when encrypting"
          autoComplete="off"
        />
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={handleDecrypt}>
          Decrypt
        </button>
      </div>

      {status.text && (
        <p className={`status ${status.type}`} role="status">
          {status.text}
        </p>
      )}

      {result !== null && (
        <div className="result message-box">
          <label>Message:</label>
          <pre>{result}</pre>
        </div>
      )}
    </section>
  );
}
