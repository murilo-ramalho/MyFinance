import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { FinanceStore } from '../application/financeStore';
import { emptyBook, type FinanceBook } from '../domain/book';
import { monthAtOffset, monthOf } from '../domain/movements';
import { deviceToday } from './deviceDate';
import { assertBookAmounts, bookTimeZone } from '../domain/bookSelectors';
import { openCipherRepository } from '../persistence/bookRepository';
import { decryptBook, decryptEnvelope, encryptBook, encryptEnvelope, fromHex, MAX_ENVELOPE_CHARACTERS, toHex } from '../security/envelope';
import { nativeCrypto } from './nativeCrypto';
import type { VaultSession } from './vaultTypes';

const PROFILE = 'myfinance.profile.v1';
const BIOMETRIC = 'myfinance.biometric.v1';
const STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
interface Material { key: string; username: string; openingMonth: FinanceBook['openingMonth'] }

function parseMaterial(payload: string): Material {
  const material = JSON.parse(payload) as Material;
  if (!material || !/^[0-9a-f]{64}$/.test(material.key) || typeof material.username !== 'string' || !material.username.trim()) throw new Error('Material protegido inválido.');
  monthAtOffset(material.openingMonth, 0);
  return material;
}

function openSession(material: Material): VaultSession {
  const key = fromHex(material.key);
  const username = material.username;
  const openingMonth = material.openingMonth;
  material.key = '';
  let repository: ReturnType<typeof openCipherRepository>;
  try { repository = openCipherRepository(() => SQLite.openDatabaseSync('myfinance-local-v1.db', { useNewConnection: true }), key); }
  catch (error) { key.fill(0); throw error; }
  let live = true;
  const assertLive = () => { if (!live) throw new Error('A sessão foi bloqueada.'); };
  let book: FinanceBook;
  try {
    const loaded = repository.load();
    book = loaded ?? emptyBook(openingMonth);
    if (book.openingMonth > monthOf(deviceToday(bookTimeZone(book)))) throw new Error('A abertura desse livro está no futuro. Confira a data do aparelho.');
    // Interrupted first-time creation can leave a wrapped key and no committed book.
    // Resume with an explicitly empty book, never inventing the failed opening balances.
    if (!loaded) repository.save(book, null);
    assertBookAmounts(book, deviceToday(bookTimeZone(book)));
  } catch (error) { repository.close(); key.fill(0); throw error; }
  const store = new FinanceStore(book, (next, revision) => { assertLive(); repository.save(next, revision); });
  return {
    username, store,
    lock: () => { if (live) { live = false; try { repository.close(); } finally { key.fill(0); } } },
    enableBiometrics: async () => {
      assertLive();
      if (!SecureStore.canUseBiometricAuthentication()) {
        throw new Error('Configure uma biometria no aparelho para ativar o desbloqueio.');
      }
      await SecureStore.setItemAsync(BIOMETRIC, JSON.stringify({ key: toHex(key), username, openingMonth }),
        { ...STORE_OPTIONS, requireAuthentication: true, authenticationPrompt: 'Confirmar biometria para ativar o desbloqueio' });
      assertLive();
    },
    changePassword: async (current, next) => {
      assertLive();
      const wrapped = await SecureStore.getItemAsync(PROFILE, STORE_OPTIONS);
      if (!wrapped) throw new Error('Perfil indisponível.');
      const verified = parseMaterial(await decryptEnvelope(wrapped, 'device-key', current, nativeCrypto));
      if (verified.key !== toHex(key)) throw new Error('Perfil incompatível com a sessão.');
      const replacement = await encryptEnvelope(JSON.stringify(verified), 'device-key', next, nativeCrypto);
      assertLive(); await SecureStore.setItemAsync(PROFILE, replacement, STORE_OPTIONS);
    },
    exportBackup: async (password) => {
      assertLive();
      const encrypted = await encryptBook(store.snapshot(), password, nativeCrypto);
      assertLive();
      if (!await Sharing.isAvailableAsync()) throw new Error('Compartilhamento indisponível.');
      const file = new File(Paths.cache, `myfinance-${Date.now()}.mfb`);
      file.write(encrypted);
      try { await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream', dialogTitle: 'Salvar backup cifrado' }); }
      finally { if (file.exists) file.delete(); }
    },
    readBackup: async (password) => {
      assertLive();
      return readBackupFile(password);
    },
    restore: (candidate) => {
      if (candidate.openingMonth > monthOf(deviceToday(bookTimeZone(candidate)))) throw new Error('A abertura do backup está no futuro.');
      assertBookAmounts(candidate, deviceToday(bookTimeZone(candidate)));
      assertLive(); repository.save(candidate, store.snapshot().audit.length);
      // The host remounts the finance UI from the repository after a confirmed restore.
    },
  };
}

export async function hasVault(): Promise<boolean> { return await SecureStore.getItemAsync(PROFILE, STORE_OPTIONS) !== null; }

export async function createVault(username: string, password: string, book: FinanceBook): Promise<VaultSession> {
  if (!username.trim()) throw new Error('Informe seu nome.');
  if (await hasVault()) throw new Error('Já existe um perfil local. Desbloqueie ou restaure um backup.');
  if (book.openingMonth > monthOf(deviceToday(bookTimeZone(book)))) throw new Error('A abertura do livro não pode estar no futuro.');
  const key = nativeCrypto.randomBytes(32);
  const material = { key: toHex(key), username: username.trim(), openingMonth: book.openingMonth };
  let repository: ReturnType<typeof openCipherRepository> | null = null;
  try {
    // Capability check happens before any credentials or financial records are saved.
    repository = openCipherRepository(() => SQLite.openDatabaseSync('myfinance-local-v1.db', { useNewConnection: true }), key);
    const wrapped = await encryptEnvelope(JSON.stringify(material), 'device-key', password, nativeCrypto);
    await SecureStore.setItemAsync(PROFILE, wrapped, STORE_OPTIONS);
    await SecureStore.deleteItemAsync(BIOMETRIC, STORE_OPTIONS);
    repository.save(book, null);
  } finally { repository?.close(); key.fill(0); }
  return openSession(material);
}

export async function unlockVault(password: string): Promise<VaultSession> {
  const wrapped = await SecureStore.getItemAsync(PROFILE, STORE_OPTIONS);
  if (!wrapped) throw new Error('Nenhum perfil local foi encontrado.');
  return openSession(parseMaterial(await decryptEnvelope(wrapped, 'device-key', password, nativeCrypto)));
}

export async function unlockWithBiometrics(): Promise<VaultSession> {
  const protectedMaterial = await SecureStore.getItemAsync(BIOMETRIC,
    { ...STORE_OPTIONS, requireAuthentication: true, authenticationPrompt: 'Desbloquear registros locais' });
  if (!protectedMaterial) throw new Error('Biometria indisponível ou alterada. Use sua senha.');
  return openSession(parseMaterial(protectedMaterial));
}

/** Recovery uses only the backup password. The device session must be reauthenticated before replacement. */
export async function readBackupFile(password: string): Promise<FinanceBook | null> {
  const selected = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (selected.canceled) return null;
  const file = new File(selected.assets[0].uri);
  try {
    if (file.size > MAX_ENVELOPE_CHARACTERS) throw new Error('Arquivo acima do limite permitido.');
    return await decryptBook(await file.text(), password, nativeCrypto);
  } finally { if (file.exists) file.delete(); }
}
