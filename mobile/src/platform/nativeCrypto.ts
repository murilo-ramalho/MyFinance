import QuickCrypto, { Buffer } from 'react-native-quick-crypto';
import { SCRYPT_PROFILE, type CryptoProvider } from '../security/envelope';

/** Native OpenSSL primitives; no JavaScript implementation of encryption or password derivation. */
export const nativeCrypto: CryptoProvider = {
  randomBytes: (length) => new Uint8Array(QuickCrypto.randomBytes(length)),
  deriveKey: (password, salt) => new Promise((resolve, reject) => {
    QuickCrypto.scrypt(password, Buffer.from(salt), 32, SCRYPT_PROFILE, (error, key) => {
      if (error || !key) reject(new Error('Não foi possível derivar a chave no dispositivo.'));
      else resolve(new Uint8Array(key));
    });
  }),
  encode: (text) => new Uint8Array(Buffer.from(text, 'utf8')),
  decode: (bytes) => Buffer.from(bytes).toString('utf8'),
  seal: (key, iv, data, aad) => {
    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv));
    cipher.setAAD(Buffer.from(aad));
    const encrypted = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
    return { data: new Uint8Array(encrypted), tag: new Uint8Array(cipher.getAuthTag()) };
  },
  open: (key, iv, data, aad, tag) => {
    const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv));
    decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(Buffer.from(tag));
    return new Uint8Array(Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]));
  },
};
