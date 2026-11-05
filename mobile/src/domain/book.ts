import type { CivilDate, Movement, MovementDirection, MovementMoneyType, YearMonth } from './movements.ts';
import type { RecurrenceException, RecurrenceRule } from './recurrences.ts';

export interface Account {
  id: string; name: string; currency: 'BRL'; kind: 'cash' | 'investment'; moneyType: MovementMoneyType;
  openingOn: CivilDate; openingMinor: number; eligible: boolean;
}
export interface Category { id: string; name: string }
export interface BookProject { id: string; name: string; description: string }
export interface CreditCard { id: string; name: string }
export interface Preference { id: 'time-zone' | 'safe-horizon'; value: string }
export interface Operation {
  id: string; title: string; currency: 'BRL'; direction: MovementDirection; amountMinor: number;
  nature: 'forecast' | 'commitment'; occurredOn: CivilDate | null; expectedOn: CivilDate | null;
  accountId: string; categoryId: string | null; projectId: string | null; cardId: string | null;
  planId: string | null; recurrenceKey: string | null;
  /** Original expected total retained when the record is revised. */
  baselineAmountMinor: number;
  occurredTime?: string | null;
}
export interface Obligation {
  id: string; operationId: string; position: number; amountMinor: number;
  dueOn: CivilDate; plannedOn: CivilDate; status: 'open' | 'waived' | 'cancelled-forecast';
}
export interface Settlement {
  id: string; obligationId: string; amountMinor: number; settledOn: CivilDate;
  accountId: string | null; method: 'cash' | 'card-credit'; creditRefundId: string | null;
  settledTime?: string | null;
}
export interface Refund {
  id: string; operationId: string; amountMinor: number; status: 'pending' | 'received' | 'cancelled';
  plannedOn: CivilDate; receivedOn: CivilDate | null; destination: 'account' | 'card';
  accountId: string | null; cardId: string | null; reason: string;
}
export interface Transfer {
  id: string; fromAccountId: string; toAccountId: string; amountMinor: number; occurredOn: CivilDate;
}
export interface Reserve { id: string; name: string; accountId: string; amountMinor: number }
export interface AcquisitionPlan {
  id: string; title: string; currency: 'BRL'; estimatedMinor: number | null; targetMinor: number | null;
  notes: string; projectId: string | null; convertedOperationId: string | null;
}
export interface Budget {
  id: string; categoryId: string; month: YearMonth; amountMinor: number; baselineMinor: number;
}
export interface StockItem { id: string; name: string; unit: 'kg' | 'g' | 'un' | 'L' | 'mL' | 'm' }
export interface StockLot {
  id: string; itemId: string; operationId: string; quantity: number; costMinor: number; acquiredOn: CivilDate;
}
export interface StockUse {
  id: string; itemId: string; quantity: number; occurredOn: CivilDate;
  kind: 'consumption' | 'loss'; projectId: string | null;
}
/** User-supplied economic cost. It is never an additional payment. */
export interface ProductionCost { id: string; title: string; projectId: string; saleOperationId: string | null; amountMinor: number; occurredOn: CivilDate }
export interface InvestmentAsset { id: string; name: string; marketUnitPriceMinor: number; valuedOn: CivilDate }
export interface InvestmentTrade {
  id: string; assetId: string; kind: 'buy' | 'sell'; quantity: number; amountMinor: number;
  costBasisMinor: number; accountId: string; occurredOn: CivilDate;
}
export interface Tool {
  id: string; name: string; operationId: string; attributedMinor: number; residualMinor: number; uses: number;
}
export interface AuditChange { table: string; id: string; before: unknown; after: unknown }
export interface BookAudit { requestId: string; recordedAt: string; kind: string; reason: string; changes: AuditChange[] }
export interface FinanceBook {
  version: 1;
  openingMonth: YearMonth;
  cushionMinor: number;
  /** Simple records and obligations are distinct sources; promotion removes the simple source atomically. */
  movements: Movement[];
  baselineMovements: Movement[];
  accounts: Account[];
  categories: Category[];
  projects: BookProject[];
  cards: CreditCard[];
  preferences: Preference[];
  operations: Operation[];
  obligations: Obligation[];
  settlements: Settlement[];
  refunds: Refund[];
  transfers: Transfer[];
  reserves: Reserve[];
  plans: AcquisitionPlan[];
  budgets: Budget[];
  recurrenceRules: RecurrenceRule[];
  recurrenceExceptions: RecurrenceException[];
  stockItems: StockItem[];
  stockLots: StockLot[];
  stockUses: StockUse[];
  productionCosts: ProductionCost[];
  assets: InvestmentAsset[];
  trades: InvestmentTrade[];
  tools: Tool[];
  audit: BookAudit[];
  requests: { id: string; content: string }[];
}

export interface OperationInput {
  id: string; title: string; direction: MovementDirection; amountMinor: number;
  nature: 'forecast' | 'commitment'; occurredOn: CivilDate | null; expectedOn: CivilDate | null;
  accountId: string; categoryId: string | null; projectId: string | null; cardId: string | null;
  dueOn: CivilDate; installmentCount: number; shortMonthPolicy: 'last-day' | 'skip' | 'next-month';
  initialPaidMinor?: number;
  settledOn?: CivilDate | null;
  occurredTime?: string | null;
  settledTime?: string | null;
}

export type FinanceCommand =
  | { kind: 'save-movement'; movement: Movement }
  | { kind: 'import-movements'; movements: Movement[] }
  | { kind: 'save-account'; account: Account }
  | { kind: 'save-category'; category: Category }
  | { kind: 'save-project'; project: BookProject }
  | { kind: 'save-card'; card: CreditCard }
  | { kind: 'create-operation'; operation: OperationInput }
  | { kind: 'edit-operation'; operationId: string; title: string; categoryId: string | null; projectId: string | null; occurredOn: CivilDate | null }
  | { kind: 'revise-operation'; operationId: string; title: string; amountMinor: number; occurredOn: CivilDate | null; expectedOn: CivilDate | null; accountId: string; categoryId: string | null; projectId: string | null; occurredTime?: string | null }
  | { kind: 'confirm-operation'; operationId: string; amountMinor: number; occurredOn: CivilDate | null; occurredTime?: string | null }
  | { kind: 'correct-settlement'; settlement: Settlement }
  | { kind: 'promote-movement'; movementId: string }
  | { kind: 'settle'; settlement: Settlement }
  | { kind: 'pay-invoice'; cardId: string; month: YearMonth; amountMinor: number; accountId: string; settledOn: CivilDate }
  | { kind: 'reschedule'; obligationId: string; plannedOn: CivilDate }
  | { kind: 'waive'; obligationIds: string[]; legalReleaseConfirmed: boolean }
  | { kind: 'request-refund'; refund: Refund }
  | { kind: 'receive-refund'; refundId: string; receivedOn: CivilDate }
  | { kind: 'cancel-refund'; refundId: string }
  | { kind: 'transfer'; transfer: Transfer }
  | { kind: 'save-reserve'; reserve: Reserve }
  | { kind: 'save-plan'; plan: AcquisitionPlan }
  | { kind: 'convert-plan'; planId: string; operation: OperationInput }
  | { kind: 'save-budget'; budget: Budget }
  | { kind: 'save-recurrence'; rule: RecurrenceRule }
  | { kind: 'revise-recurrence'; ruleId: string; fromPosition: number; amountMinor: number; title: string }
  | { kind: 'recurrence-exception'; exception: RecurrenceException }
  | { kind: 'materialize-occurrence'; ruleId: string; position: number; through: CivilDate }
  | { kind: 'cancel-recurrence'; ruleId: string; from: CivilDate; scope: 'this' | 'future' | 'pending' | 'rule'; position: number; legalReleaseConfirmed: boolean }
  | { kind: 'complete-recurrence'; ruleId: string; completedOn: CivilDate }
  | { kind: 'save-stock-item'; item: StockItem }
  | { kind: 'purchase-stock'; operation: OperationInput; lot: StockLot }
  | { kind: 'consume-stock'; id: string; itemId: string; quantity: number; occurredOn: CivilDate; projectId: string | null; loss: boolean }
  | { kind: 'save-production-cost'; cost: ProductionCost }
  | { kind: 'save-asset'; asset: InvestmentAsset }
  | { kind: 'trade'; trade: InvestmentTrade }
  | { kind: 'save-tool'; tool: Tool }
  | { kind: 'tool-use'; toolId: string; count: number }
  | { kind: 'set-cushion'; amountMinor: number }
  | { kind: 'set-preferences'; timeZone: string; horizon: 'next-income' | '30-days' | '90-days' };

export interface CommandContext { requestId: string; recordedAt: string; today: CivilDate; reason?: string }

export function emptyBook(openingMonth: YearMonth): FinanceBook {
  return {
    version: 1, openingMonth, cushionMinor: 0, movements: [], baselineMovements: [],
    accounts: [], categories: [], projects: [], cards: [], preferences: [{ id: 'time-zone', value: 'device' }, { id: 'safe-horizon', value: 'next-income' }], operations: [], obligations: [],
    settlements: [], refunds: [], transfers: [], reserves: [], plans: [], budgets: [],
    recurrenceRules: [], recurrenceExceptions: [], stockItems: [], stockLots: [], stockUses: [],
    productionCosts: [], assets: [], trades: [], tools: [], audit: [], requests: [],
  };
}
