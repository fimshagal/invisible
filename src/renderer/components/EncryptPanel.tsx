import { useCallback, useState } from 'react';
import {
  embedMessageInImage,
  loadImageFromFile,
  getCapacityInfo,
  getMinimumDimensions,
  bytesRequiredForMessage,
  getCapacityBytes,
  type RgbaImage,
} from '@stego-crypto/index';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function EncryptPanel() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<RgbaImage | null>(null);
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; text: string }>({
    type: 'idle',
    text: '',
  });
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const onImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setResultUrl(null);
    setStatus({ type: 'idle', text: '' });

    const url = URL.createObjectURL(file);
    setPreview(url);

    try {
      const img = await loadImageFromFile(file);
      setImageInfo(img);
    } catch {
      setImageInfo(null);
      setStatus({ type: 'err', text: 'Failed to read image' });
    }
  }, []);

  const capacity = imageInfo ? getCapacityInfo(imageInfo.width, imageInfo.height) : null;
  const messageBytes = new TextEncoder().encode(message).length;
  const requiredBytes = message ? bytesRequiredForMessage(messageBytes) : 0;
  const minDims = message ? getMinimumDimensions(messageBytes) : null;
  const fits =
    capacity && message
      ? requiredBytes <= getCapacityBytes(imageInfo!.width, imageInfo!.height)
      : true;

  const handleEncrypt = async () => {
    if (!imageFile || !imageInfo || !secret || !message) {
      setStatus({ type: 'err', text: 'Please fill in all fields' });
      return;
    }

    setStatus({ type: 'loading', text: 'Encrypting…' });

    try {
      const { pngBlob } = await embedMessageInImage(imageInfo, message, secret);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(pngBlob);
      setResultUrl(url);
      setStatus({ type: 'ok', text: 'Done! Save the PNG — always use PNG when sharing.' });
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
    a.download = `invisible-${Date.now()}.png`;
    a.click();
  };

  return (
    <section className="panel">
      <div className="field">
        <label htmlFor="enc-image">Image (PNG / JPEG / WebP…)</label>
        <input id="enc-image" type="file" accept="image/*" onChange={onImageChange} />
        {preview && (
          <div className="preview-row">
            <img src={preview} alt="Preview" className="preview" />
            {capacity && (
              <div className="meta">
                <p>
                  {imageInfo!.width}×{imageInfo!.height} px — capacity ~{' '}
                  {formatBytes(capacity.maxPayloadBytes)} of data
                </p>
                <p>Max message length: ~{capacity.maxMessageChars} characters</p>
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
          placeholder="Text to hide inside the image"
          rows={4}
        />
        {message && minDims && !fits && (
          <p className="hint warn">
            Image too small. Need at least ~{minDims.minSide}×{minDims.minSide} px (
            {minDims.minPixels.toLocaleString()} pixels).
          </p>
        )}
        {message && capacity && fits && (
          <p className="hint">
            Requires {formatBytes(requiredBytes)} of{' '}
            {formatBytes(getCapacityBytes(imageInfo!.width, imageInfo!.height))} available
            (up to {capacity.maxOffsetPixels} px offset reserved)
          </p>
        )}
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={handleEncrypt} disabled={!fits}>
          Encrypt & hide
        </button>
        {resultUrl && (
          <button type="button" className="btn secondary" onClick={handleDownload}>
            Download PNG
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
