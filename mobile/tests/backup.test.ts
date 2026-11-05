import assert from 'node:assert/strict';
import test from 'node:test';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { encryptBook, decryptBook, decryptEnvelope, encryptEnvelope, SCRYPT_PROFILE, type CryptoProvider } from '../src/security/envelope.ts';
import { createDemoBook } from '../src/demo/demoData.ts';
import { FinanceStore } from '../src/application/financeStore.ts';

const crypto: CryptoProvider = {
  randomBytes: (length) => randomBytes(length),
  deriveKey: (password, salt) => new Promise((resolve, reject) => scrypt(password, salt, 32, SCRYPT_PROFILE, (error, key) => error ? reject(error) : resolve(key))),
  encode: (text) => Buffer.from(text, 'utf8'), decode: (bytes) => Buffer.from(bytes).toString('utf8'),
  seal: (key, iv, data, aad) => {
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad);
    return { data: Buffer.concat([cipher.update(data), cipher.final()]), tag: cipher.getAuthTag() };
  },
  open: (key, iv, data, aad, tag) => {
    const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(aad); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  },
};
// Ephemeral test secrets are generated at runtime and never printed or committed.
const recovery = randomBytes(24).toString('hex');
const wrong = randomBytes(24).toString('hex');

test('authenticated backup restores relationships and audit using only its recovery password', async () => {
  const book = createDemoBook('2026-10', '2026-10-25');
  const serialized = await encryptBook(book, recovery, crypto);
  const restored = await decryptBook(serialized, recovery, crypto);
  assert.deepEqual(restored, book);
  assert.ok(!serialized.includes(book.movements[0].title));
  const newDevice = new FinanceStore(restored);
  assert.deepEqual(newDevice.snapshot(), book);
});

test('wrong passwords and tampered ciphertext, tag or authenticated header are rejected before restore', async () => {
  const current = createDemoBook('2026-10', '2026-10-25');
  const snapshot = JSON.stringify(current);
  const serialized = await encryptBook(current, recovery, crypto);
  await assert.rejects(() => decryptBook(serialized, wrong, crypto));
  for (const field of ['ciphertext', 'tag', 'salt', 'iv'] as const) {
    const candidate = JSON.parse(serialized) as Record<string, string>;
    candidate[field] = `${candidate[field][0] === 'a' ? 'b' : 'a'}${candidate[field].slice(1)}`;
    await assert.rejects(() => decryptBook(JSON.stringify(candidate), recovery, crypto));
  }
  assert.equal(JSON.stringify(current), snapshot);
});

test('unknown versions, excessive KDF profiles, truncation and malformed schema fail closed', async () => {
  const serialized = await encryptBook(createDemoBook('2026-10', '2026-10-25'), recovery, crypto);
  for (const override of [{ version: 2 }, { kdf: 'attacker-selected-cost' }, { algorithm: 'AES-CBC' }, { purpose: 'device-key' }]) {
    await assert.rejects(() => decryptBook(JSON.stringify({ ...JSON.parse(serialized), ...override }), recovery, crypto));
  }
  await assert.rejects(() => decryptBook(serialized.slice(0, -8), recovery, crypto));
  const invalid = await encryptEnvelope(JSON.stringify({ version: 1, accounts: [] }), 'backup', recovery, crypto);
  await assert.rejects(() => decryptBook(invalid, recovery, crypto));
});

test('key wrapping and portable backups are bound to different authenticated purposes', async () => {
  const opaque = randomBytes(32).toString('hex');
  const wrapped = await encryptEnvelope(opaque, 'device-key', recovery, crypto);
  assert.ok(await decryptEnvelope(wrapped, 'device-key', recovery, crypto) === opaque);
  await assert.rejects(() => decryptEnvelope(wrapped, 'backup', recovery, crypto));
  const second = await encryptEnvelope(opaque, 'device-key', recovery, crypto);
  assert.ok(wrapped !== second);
});
