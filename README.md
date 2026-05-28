# Invisible

Desktop-додаток для **приховування зашифрованих повідомлень у зображеннях** (steganography). Повідомлення шифрується AES-256-GCM з ключем, похідним від вашого таємного рядка (PBKDF2), і вбудовується в молодші біти RGB-каналів пікселів — візуально зображення майже не змінюється.

## Стек

- [Electron](https://www.electronjs.org/) + [Electron Forge](https://www.electronforge.io/) (Vite plugin)
- TypeScript + React
- Окремий переносний модуль `@invisible/stego-crypto` у `packages/stego-crypto/`

## Вимоги

- Node.js 18+
- npm

## Запуск

```bash
# Встановити залежності
npm install

# Запустити в режимі розробки
npm start
```

При повторному запуску додатку відкривається **вже існуюче вікно** (single-instance lock).

## Збірка

```bash
# Упакувати додаток
npm run package

# Створити інсталятор (Windows — Squirrel)
npm run make
```

## Як користуватися

### Шифрування

1. Вкладка **Шифрування**
2. Оберіть зображення (PNG, JPEG, WebP…)
3. Введіть **таємний ключ** (будь-який рядок)
4. Введіть **повідомлення**
5. Натисніть «Зашифрувати і сховати»
6. **Завантажте PNG** — саме PNG потрібен для збереження прихованих даних (JPEG стискає і може знищити payload)

### Дешифрування

1. Вкладка **Дешифрування**
2. Завантажте PNG (або інше зображення, якщо дані не пошкоджені)
3. Введіть той самий **таємний ключ**
4. Отримайте розшифроване повідомлення

## Місткість зображення

Дані ховаються в **3 молодших біта на піксель** (R, G, B). Мінімальний розмір залежить від довжини повідомлення:

| Компонент | Розмір |
|-----------|--------|
| Заголовок (magic + version + length) | 9 байт |
| Шифрування (salt + IV + GCM tag + ciphertext) | 44+ байт |
| Повідомлення | UTF-8 байти |

Формула: `потрібні_пікселі = ceil((9 + 44 + len(message)) × 8 / 3)`

Інтерфейс показує попередження, якщо зображення замале, і орієнтовну максимальну довжину повідомлення для обраного файлу.

## Переносний модуль дешифрування

Папку `packages/stego-crypto/` можна скопіювати в інший проєкт. Модуль використовує **Web Crypto API** і **Canvas** — працює в браузері та Electron renderer.

```typescript
import {
  decryptFromFile,
  encryptToFile,
  extractMessageFromImage,
  embedMessageInImage,
  loadImageFromFile,
  getCapacityInfo,
} from '@invisible/stego-crypto';

// Дешифрування з File/Blob
const message = await decryptFromFile(imageFile, 'my-secret-key');

// Шифрування → PNG Blob
const pngBlob = await encryptToFile(imageFile, 'Hello!', 'my-secret-key');
```

Низькорівневі функції (`decryptMessage`, `embedBytesInImage`, `extractBytesFromImage`) також експортуються для кастомної інтеграції.

## Безпека

- AES-256-GCM (аутентифіковане шифрування)
- PBKDF2-SHA256, 100 000 ітерацій для деривації ключа
- LSB steganography — приховує факт наявності даних від casual перегляду, але **не є криптографічним захистом самого факту стеганографії**

## Структура проєкту

```
invisible/
├── forge.config.ts          # Electron Forge
├── packages/stego-crypto/   # Переносний модуль
├── src/
│   ├── main.ts              # Main process (single instance)
│   ├── preload.ts
│   └── renderer/            # React UI
└── vite.*.config.ts
```

## Ліцензія

MIT
