import type { FinanceBook } from '../domain/book';
import type { FinanceStore } from '../application/financeStore';

export interface VaultSession {
  store: FinanceStore;
  username: string;
  lock(): void;
  enableBiometrics(): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  exportBackup(recoveryPassword: string): Promise<void>;
  readBackup(recoveryPassword: string): Promise<FinanceBook | null>;
  restore(book: FinanceBook): void;
}
