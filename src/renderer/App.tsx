import { useState } from 'react';
import { EncryptPanel } from './components/EncryptPanel';
import { DecryptPanel } from './components/DecryptPanel';

type Tab = 'encrypt' | 'decrypt';

export default function App() {
  const [tab, setTab] = useState<Tab>('encrypt');

  return (
    <div className="app">
      <header className="header">
        <h1>Invisible</h1>
        <p className="subtitle">
          Ховає зашифроване повідомлення всередині зображення (LSB steganography + AES-256-GCM)
        </p>
        <nav className="tabs">
          <button
            type="button"
            className={tab === 'encrypt' ? 'tab active' : 'tab'}
            onClick={() => setTab('encrypt')}
          >
            Шифрування
          </button>
          <button
            type="button"
            className={tab === 'decrypt' ? 'tab active' : 'tab'}
            onClick={() => setTab('decrypt')}
          >
            Дешифрування
          </button>
        </nav>
      </header>

      <main className="main">
        {tab === 'encrypt' ? <EncryptPanel /> : <DecryptPanel />}
      </main>
    </div>
  );
}
