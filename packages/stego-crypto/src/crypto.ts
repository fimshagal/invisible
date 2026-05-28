import { PBKDF2_ITERATIONS } from './types';

const encoder = new TextEncoder();

async function importKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function deriveKey(
  secret: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt plaintext → [salt(16) | iv(12) | ciphertext+tag] */
export async function encryptMessage(
  message: string,
  secret: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(message),
  );

  const ct = new Uint8Array(ciphertext);
  const out = new Uint8Array(16 + 12 + ct.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(ct, 28);
  return out;
}

/** Decrypt payload produced by encryptMessage. */
export async function decryptMessage(
  payload: Uint8Array,
  secret: string,
): Promise<string> {
  if (payload.length < 28) {
    throw new Error('Invalid encrypted payload');
  }

  const salt = payload.slice(0, 16);
  const iv = payload.slice(16, 28);
  const ciphertext = payload.slice(28);

  const key = await deriveKey(secret, salt);

  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error(
      'Decryption failed — wrong secret key or image contains no valid message',
    );
  }
}

export { deriveKey, importKey };
