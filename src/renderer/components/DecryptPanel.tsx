import { useCallback, useState } from 'react';
import { decryptFromFile, loadImageFromFile } from '@stego-crypto/index';

export function DecryptPanel() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; text: string }>({
    type: 'idle',
    text: '',
  });

  const onImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setResult(null);
    setStatus({ type: 'idle', text: '' });

    const url = URL.createObjectURL(file);
    setPreview(url);

    try {
      await loadImageFromFile(file);
    } catch {
      setStatus({ type: 'err', text: 'Не вдалося прочитати зображення' });
    }
  }, []);

  const handleDecrypt = async () => {
    if (!imageFile || !secret) {
      setStatus({ type: 'err', text: 'Додайте зображення і таємний ключ' });
      return;
    }

    setStatus({ type: 'loading', text: 'Дешифрування…' });
    setResult(null);

    try {
      const text = await decryptFromFile(imageFile, secret);
      setResult(text);
      setStatus({ type: 'ok', text: 'Повідомлення знайдено!' });
    } catch (err) {
      setStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Помилка дешифрування',
      });
    }
  };

  return (
    <section className="panel">
      <div className="field">
        <label htmlFor="dec-image">Зображення з прихованим повідомленням</label>
        <input id="dec-image" type="file" accept="image/*" onChange={onImageChange} />
        {preview && <img src={preview} alt="Preview" className="preview" />}
      </div>

      <div className="field">
        <label htmlFor="dec-secret">Таємний ключ</label>
        <input
          id="dec-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Той самий ключ, що використовувався при шифруванні"
          autoComplete="off"
        />
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={handleDecrypt}>
          Дешифрувати
        </button>
      </div>

      {status.text && (
        <p className={`status ${status.type}`} role="status">
          {status.text}
        </p>
      )}

      {result !== null && (
        <div className="result message-box">
          <label>Повідомлення:</label>
          <pre>{result}</pre>
        </div>
      )}
    </section>
  );
}
