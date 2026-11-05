import type { FinanceBook } from '../domain/book';
import type { VaultSession } from './vaultTypes';
export async function hasVault(): Promise<boolean> { return false; }
export async function createVault(_username: string, _password: string, _book: FinanceBook): Promise<VaultSession> { throw new Error('Dados protegidos exigem build Android nativo com SQLCipher.'); }
export async function unlockVault(_password: string): Promise<VaultSession> { throw new Error('Dados protegidos indisponíveis no navegador.'); }
export async function unlockWithBiometrics(): Promise<VaultSession> { throw new Error('Biometria indisponível no navegador.'); }
export async function readBackupFile(_password: string): Promise<FinanceBook | null> { throw new Error('Restauração protegida exige build nativo.'); }
