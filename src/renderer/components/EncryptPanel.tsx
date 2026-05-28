import { useCallback, useState } from 'react';
import {
  embedMessageInImage,
  loadImageFromFile,
  getCapacityInfo,
  getMinimumDimensions,
  bytesRequiredForMessage,
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
      setStatus({ type: 'err', text: 'Не вдалося прочитати зображення' });
    }
  }, []);

  const capacity = imageInfo ? getCapacityInfo(imageInfo.width, imageInfo.height) : null;
  const messageBytes = new TextEncoder().encode(message).length;
  const requiredBytes = message ? bytesRequiredForMessage(messageBytes) : 0;
  const minDims = message ? getMinimumDimensions(messageBytes) : null;
  const fits =
    capacity && message
      ? requiredBytes <= capacity.maxPayloadBytes + 9
      : true;

  const handleEncrypt = async () => {
    if (!imageFile || !imageInfo || !secret || !message) {
      setStatus({ type: 'err', text: 'Заповніть усі поля' });
      return;
    }

    setStatus({ type: 'loading', text: 'Шифрування…' });

    try {
      const { pngBlob } = await embedMessageInImage(imageInfo, message, secret);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(pngBlob);
      setResultUrl(url);
      setStatus({ type: 'ok', text: 'Готово! Збережіть PNG — використовуйте саме PNG для передачі.' });
    } catch (err) {
      setStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Помилка шифрування',
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
        <label htmlFor="enc-image">Зображення (PNG/JPEG/WebP…)</label>
        <input id="enc-image" type="file" accept="image/*" onChange={onImageChange} />
        {preview && (
          <div className="preview-row">
            <img src={preview} alt="Preview" className="preview" />
            {capacity && (
              <div className="meta">
                <p>
                  {imageInfo!.width}×{imageInfo!.height} px — місткість ~{' '}
                  {formatBytes(capacity.maxPayloadBytes)} даних
                </p>
                <p>Макс. довжина повідомлення: ~{capacity.maxMessageChars} символів</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="enc-secret">Таємний ключ</label>
        <input
          id="enc-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Будь-який рядок"
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="enc-message">Повідомлення</label>
        <textarea
          id="enc-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Текст для приховування в зображенні"
          rows={4}
        />
        {message && minDims && !fits && (
          <p className="hint warn">
            Зображення замале. Потрібно мінімум ~{minDims.minSide}×{minDims.minSide} px (
            {minDims.minPixels.toLocaleString()} пікселів).
          </p>
        )}
        {message && capacity && fits && (
          <p className="hint">
            Потрібно {formatBytes(requiredBytes)} з {formatBytes(capacity.maxPayloadBytes + 9)}{' '}
            доступних
          </p>
        )}
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={handleEncrypt} disabled={!fits}>
          Зашифрувати і сховати
        </button>
        {resultUrl && (
          <button type="button" className="btn secondary" onClick={handleDownload}>
            Завантажити PNG
          </button>
        )}
      </div>

      {status.text && (
        <p className={`status ${status.type}`} role="status">
          {status.text}
        </p>
      )}

      {resultUrl && (
        <div className="result">
          <p>Результат (візуально не відрізняється від оригіналу):</p>
          <img src={resultUrl} alt="Result" className="preview" />
        </div>
      )}
    </section>
  );
}
