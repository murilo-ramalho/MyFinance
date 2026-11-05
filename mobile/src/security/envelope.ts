import type { FinanceBook } from '../domain/book.ts';
import { validateBook } from '../domain/bookCommands.ts';

export interface CryptoProvider {
  randomBytes(length: number): Uint8Array;
  deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array>;
  seal(key: Uint8Array, iv: Uint8Array, data: Uint8Array, aad: Uint8Array): { data: Uint8Array; tag: Uint8Array };
  open(key: Uint8Array, iv: Uint8Array, data: Uint8Array, aad: Uint8Array, tag: Uint8Array): Uint8Array;
  encode(text: string): Uint8Array;
  decode(bytes: Uint8Array): string;
}

/** Versioned prototype profile. Native memory/time measurement and human review are release gates. */
export const SCRYPT_PROFILE = { N: 131072, r: 8, p: 1, maxmem: 268435456 } as const;
export const MAX_ENVELOPE_CHARACTERS = 20 * 1024 * 1024;
type Purpose = 'backup' | 'device-key';
interface Header {
  format: 'myfinance'; version: 1; algorithm: 'AES-256-GCM'; purpose: Purpose;
  kdf: 'scrypt-131072-8-1'; salt: string; iv: string;
}
interface Envelope extends Header { ciphertext: string; tag: string }

export function toHex(bytes: Uint8Array): string {
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 4096) {
    encoded += Array.from(bytes.subarray(offset, offset + 4096), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return encoded;
}
export function fromHex(text: string): Uint8Array {
  if (typeof text !== 'string' || text.length % 2 !== 0 || !/^[0-9a-f]+$/.test(text)) throw new Error('Envelope inválido.');
  const bytes = new Uint8Array(text.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}
function headerOf(envelope: Envelope): Header {
  return { format: envelope.format, version: envelope.version, algorithm: envelope.algorithm,
    purpose: envelope.purpose, kdf: envelope.kdf, salt: envelope.salt, iv: envelope.iv };
}

export async function encryptEnvelope(payload: string, purpose: Purpose, password: string, crypto: CryptoProvider): Promise<string> {
  if (password.length < 12) throw new Error('Use pelo menos 12 caracteres na senha.');
  const data = crypto.encode(payload);
  if (data.length > 8 * 1024 * 1024) throw new Error('Dados excedem o limite desta versão do backup.');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const header: Header = { format: 'myfinance', version: 1, algorithm: 'AES-256-GCM', purpose,
    kdf: 'scrypt-131072-8-1', salt: toHex(salt), iv: toHex(iv) };
  const key = await crypto.deriveKey(password, salt);
  try {
    const encrypted = crypto.seal(key, iv, data, crypto.encode(JSON.stringify(header)));
    if (encrypted.tag.length !== 16) throw new Error('A biblioteca não retornou a autenticação esperada.');
    return JSON.stringify({ ...header, ciphertext: toHex(encrypted.data), tag: toHex(encrypted.tag) });
  } finally { key.fill(0); data.fill(0); }
}

export async function decryptEnvelope(serialized: string, purpose: Purpose, password: string, crypto: CryptoProvider): Promise<string> {
  if (typeof serialized !== 'string' || serialized.length > MAX_ENVELOPE_CHARACTERS || !password) throw new Error('Arquivo ou senha inválidos.');
  let envelope: Envelope;
  try {
    envelope = JSON.parse(serialized) as Envelope;
    if (!envelope || envelope.format !== 'myfinance' || envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM'
      || envelope.purpose !== purpose || envelope.kdf !== 'scrypt-131072-8-1'
      || Object.keys(envelope).length !== 9 || !/^[0-9a-f]{32}$/.test(envelope.salt)
      || !/^[0-9a-f]{24}$/.test(envelope.iv) || !/^[0-9a-f]{32}$/.test(envelope.tag)
      || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length % 2 !== 0 || !/^[0-9a-f]+$/.test(envelope.ciphertext)) throw new Error();
  } catch { throw new Error('Formato ou versão do arquivo inválidos.'); }
  const key = await crypto.deriveKey(password, fromHex(envelope.salt));
  try {
    const plaintext = crypto.open(key, fromHex(envelope.iv), fromHex(envelope.ciphertext),
      crypto.encode(JSON.stringify(headerOf(envelope))), fromHex(envelope.tag));
    try { return crypto.decode(plaintext); } finally { plaintext.fill(0); }
  } catch { throw new Error('Senha incorreta ou arquivo adulterado.'); }
  finally { key.fill(0); }
}

export async function encryptBook(book: FinanceBook, recoveryPassword: string, crypto: CryptoProvider): Promise<string> {
  validateBook(book);
  return encryptEnvelope(JSON.stringify(book), 'backup', recoveryPassword, crypto);
}

export async function decryptBook(serialized: string, recoveryPassword: string, crypto: CryptoProvider): Promise<FinanceBook> {
  const plaintext = await decryptEnvelope(serialized, 'backup', recoveryPassword, crypto);
  try {
    const book = JSON.parse(plaintext) as FinanceBook;
    validateBook(book);
    return book;
  } catch { throw new Error('O conteúdo do backup não passou na validação de dados e vínculos.'); }
}
