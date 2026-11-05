import * as SQLite from 'expo-sqlite';
import { createDemoBook } from '../demo/demoData';
import { openCipherRepository } from '../persistence/bookRepository';
import { decryptBook, encryptBook, toHex } from '../security/envelope';
import { nativeCrypto } from './nativeCrypto';
import type { NativeProofResult } from './nativeProof';

/** Device-only proof using isolated synthetic databases and runtime-generated secrets. */
export async function runNativeProof(): Promise<NativeProofResult[]> {
  const results: NativeProofResult[] = [];
  const suffix = toHex(nativeCrypto.randomBytes(8));
  const sourceName = `myfinance-proof-${suffix}-source.db`;
  const restoredName = `myfinance-proof-${suffix}-restored.db`;
  const firstKey = nativeCrypto.randomBytes(32); const secondKey = nativeCrypto.randomBytes(32);
  const password = toHex(nativeCrypto.randomBytes(24));
  let repository: ReturnType<typeof openCipherRepository> | null = null;
  const open = (name: string) => () => SQLite.openDatabaseSync(name, { useNewConnection: true });
  try {
    const book = createDemoBook('2026-10', '2026-10-25');
    repository = openCipherRepository(open(sourceName), firstKey);
    repository.save(book, null); repository.close(); repository = null;
    results.push({ id: 'cipher-runtime', status: 'passed', detail: 'Runtime SQLCipher confirmado antes da escrita.' });
    const withoutKey = SQLite.openDatabaseSync(sourceName, { useNewConnection: true });
    let rejected = false;
    try { withoutKey.getFirstSync('SELECT * FROM book_meta'); } catch { rejected = true; }
    finally { withoutKey.closeSync(); }
    if (!rejected) throw new Error('Leitura sem chave foi permitida.');
    results.push({ id: 'no-key', status: 'passed', detail: 'O arquivo cifrado recusou leitura sem chave.' });
    let wrongKeyRejected = false;
    try { const incorrect = openCipherRepository(open(sourceName), secondKey); incorrect.close(); }
    catch { wrongKeyRejected = true; }
    if (!wrongKeyRejected) throw new Error('Chave incorreta foi aceita.');
    results.push({ id: 'wrong-key', status: 'passed', detail: 'Chave diferente não abriu o banco.' });
    repository = openCipherRepository(open(sourceName), firstKey);
    const loaded = repository.load();
    if (JSON.stringify(loaded) !== JSON.stringify(book)) throw new Error('Reabertura divergente.');
    results.push({ id: 'restart', status: 'passed', detail: 'Fechar e reabrir preservou dados e vínculos.' });
    const start = Date.now();
    const envelope = await encryptBook(book, password, nativeCrypto);
    const restored = await decryptBook(envelope, password, nativeCrypto);
    repository.close(); repository = openCipherRepository(open(restoredName), secondKey);
    repository.save(restored, null);
    if (JSON.stringify(repository.load()) !== JSON.stringify(book)) throw new Error('Restauração divergente.');
    results.push({ id: 'portable-backup', status: 'passed', detail: `Backup restaurado em banco com outra chave. Derivação e ciclo: ${Date.now() - start} ms.` });
    const tampered = JSON.parse(envelope) as { ciphertext: string };
    tampered.ciphertext = `${tampered.ciphertext[0] === 'a' ? 'b' : 'a'}${tampered.ciphertext.slice(1)}`;
    let corruptRejected = false;
    try { await decryptBook(JSON.stringify(tampered), password, nativeCrypto); } catch { corruptRejected = true; }
    if (!corruptRejected) throw new Error('Backup adulterado foi aceito.');
    results.push({ id: 'tampered-backup', status: 'passed', detail: 'Adulteração recusada antes de restaurar.' });
  } catch {
    results.push({ id: 'native-proof', status: 'failed', detail: 'A prova nativa falhou. Não use dados reais e revise este build.' });
  } finally {
    try { repository?.close(); } finally {
      firstKey.fill(0); secondKey.fill(0);
      // Both exact filenames are generated here, isolated from the user's database.
      for (const name of [sourceName, restoredName]) {
        if (/^myfinance-proof-[0-9a-f]{16}-(source|restored)\.db$/.test(name)) {
          try { SQLite.deleteDatabaseSync(name); } catch { /* A failed runtime may not have created the proof file. */ }
        }
      }
    }
  }
  results.push({ id: 'biometrics-and-interruption', status: 'manual-required', detail: 'Validar cancelamento e mudança de biometria, interrupção durante escrita/restauração, proteção do seletor de apps e reinstalação em outro aparelho.' });
  return results;
}
