import type { Account, FinanceBook, Obligation } from './book.ts';
import { QUANTITY_SCALE, integer, roundRatio, safeNumber } from './exact.ts';
import { expandRecurrence } from './recurrences.ts';
import { cashDateOf, monthAtOffset, monthOf, summarizeMonth, validateCivilDate, type CivilDate, type Movement, type MovementNature } from './movements.ts';
import { daysInMonth } from './dates.ts';
import { openingCashForMonth } from './projections.ts';
import { addDays } from './recurrences.ts';
import { projectCashMonths } from './projections.ts';

/** Reject unsupported aggregate amounts before publishing or persisting a command. */
export function assertBookAmounts(book: FinanceBook, asOf: CivilDate): void {
  const records = bookMovements(book, monthEnd(monthAtOffset(monthOf(asOf), 1)));
  const opening = openingCashForMonth(records, book.baselineMovements,
    { month: book.openingMonth, cash: bookOpeningCash(book) }, book.openingMonth);
  let balance = BigInt(sumMinor([opening.digital, opening.physical]));
  const days = new Map<string, bigint>();
  const monthly = new Map<string, bigint>();
  for (const record of records) {
    const date = cashDateOf(record);
    if (!date || monthOf(date) < book.openingMonth) continue;
    const signed = BigInt(record.amountMinor) * (record.direction === 'income' ? 1n : -1n);
    days.set(date, (days.get(date) ?? 0n) + signed);
    if (record.flowKind !== 'transfer') {
      const key = `${monthOf(date)}:${record.direction}`;
      const total = (monthly.get(key) ?? 0n) + BigInt(record.amountMinor);
      safeNumber(total); monthly.set(key, total);
    }
  }
  for (const [, flow] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) { balance += flow; safeNumber(balance); }
  financialPosition(book, asOf);
}

export function monthEnd(month: string): CivilDate {
  monthAtOffset(month as FinanceBook['openingMonth'], 0);
  const [year, number] = month.split('-').map(Number);
  return `${month}-${daysInMonth(year, number)}` as CivilDate;
}

export function bookOpeningCash(book: FinanceBook, eligibleOnly = false) {
  const accounts = book.accounts.filter((entry) => entry.kind === 'cash' && (!eligibleOnly || entry.eligible));
  return { digital: sumMinor(accounts.filter((entry) => entry.moneyType === 'digital').map((entry) => entry.openingMinor)),
    physical: sumMinor(accounts.filter((entry) => entry.moneyType === 'physical').map((entry) => entry.openingMinor)) };
}

export function historicalMonthSummary(book: FinanceBook, month: FinanceBook['openingMonth']) {
  monthAtOffset(month, 0);
  if (month < book.openingMonth) return null;
  const records = bookMovements(book, monthEnd(month), false);
  const opening = openingCashForMonth(records, book.baselineMovements, { month: book.openingMonth, cash: bookOpeningCash(book) }, month);
  return summarizeMonth(records.filter((entry) => entry.nature === 'realized'), month, sumMinor([opening.digital, opening.physical]));
}

export function eligibleMovements(book: FinanceBook, movements: readonly Movement[]): Movement[] {
  const ids = new Set(book.accounts.filter((entry) => entry.kind === 'cash' && entry.eligible).map((entry) => entry.id));
  return movements.filter((entry) => entry.accountId && ids.has(entry.accountId));
}

export function eligibleOpeningBalance(book: FinanceBook, movements: readonly Movement[], month: FinanceBook['openingMonth']): number {
  const balances = openingCashForMonth(eligibleMovements(book, movements), eligibleMovements(book, book.baselineMovements),
    { month: book.openingMonth, cash: bookOpeningCash(book, true) }, month);
  return sumMinor([balances.digital, balances.physical]);
}

export function nextExpectedIncomeOn(movements: readonly Movement[], asOf: CivilDate): CivilDate | null {
  return movements.filter((entry) => entry.nature !== 'realized' && entry.direction === 'income')
    .map((entry) => entry.plannedSettlementOn).filter((date): date is CivilDate => date !== null && date >= asOf).sort()[0] ?? null;
}

export function bookTimeZone(book: FinanceBook): string {
  return book.preferences.find((entry) => entry.id === 'time-zone')?.value ?? 'device';
}

export function forecastHorizon(book: FinanceBook, movements: readonly Movement[], asOf: CivilDate): CivilDate | null {
  const policy = book.preferences.find((entry) => entry.id === 'safe-horizon')?.value ?? 'next-income';
  return policy === 'next-income' ? nextExpectedIncomeOn(movements, asOf) : addDays(asOf, policy === '30-days' ? 30 : 90);
}

export function simulateAcquisition(book: FinanceBook, planId: string, date: CivilDate, accountId: string): Movement[] {
  validateCivilDate(date, 'Data da simulação');
  const plan = book.plans.find((entry) => entry.id === planId);
  if (!plan || !plan.estimatedMinor) throw new TypeError('Informe um preço estimado antes de simular.');
  if (plan.convertedOperationId) throw new TypeError('Essa aquisição já foi convertida.');
  const account = accountFor(book, accountId);
  if (account.kind !== 'cash') throw new TypeError('Escolha uma conta de caixa para simular a aquisição.');
  return [...bookMovements(book, monthEnd(monthOf(date))), movementFrom(account, `simulation:${plan.id}`, `${plan.title} · simulação`,
    'expense', plan.estimatedMinor, 'forecast', null, date, date, { projectId: plan.projectId })];
}

export function acquisitionSimulationPreview(book: FinanceBook, planId: string, date: CivilDate, accountId: string, asOf: CivilDate) {
  if (date < asOf) throw new RangeError('Escolha uma data presente ou futura para simular.');
  const through = monthOf(date);
  const opening = { month: book.openingMonth, cash: bookOpeningCash(book) };
  const base = projectCashMonths(bookMovements(book, monthEnd(through)), book.baselineMovements, opening, asOf, through).at(-1)!;
  const scenario = projectCashMonths(simulateAcquisition(book, planId, date, accountId), book.baselineMovements, opening, asOf, through).at(-1)!;
  return { month: through, baselineClosingMinor: base.closingBalanceMinor, scenarioClosingMinor: scenario.closingBalanceMinor,
    impactMinor: sumMinor([scenario.closingBalanceMinor, -base.closingBalanceMinor]) };
}

export function sumMinor(values: readonly number[]): number {
  return safeNumber(values.reduce((sum, value) => { integer(value, 'Valor'); return sum + BigInt(value); }, 0n));
}

export function paidMinor(book: FinanceBook, obligationId: string): number {
  return sumMinor(book.settlements.filter((payment) => payment.obligationId === obligationId).map((payment) => payment.amountMinor));
}

export function remainingMinor(book: FinanceBook, obligation: Obligation): number {
  return obligation.status === 'open' ? sumMinor([obligation.amountMinor, -paidMinor(book, obligation.id)]) : 0;
}

export function obligationStatus(book: FinanceBook, obligation: Obligation, today: CivilDate): string {
  if (obligation.status === 'waived') return 'Obrigação dispensada';
  if (obligation.status === 'cancelled-forecast') return 'Previsão cancelada';
  if (remainingMinor(book, obligation) === 0) return 'Liquidada';
  const forecast = book.operations.find((entry) => entry.id === obligation.operationId)?.nature === 'forecast';
  if (paidMinor(book, obligation.id) > 0) return forecast ? 'Parcialmente liquidada · remanescente previsto' : 'Parcialmente liquidada';
  return forecast ? 'Previsão não confirmada' : obligation.dueOn < today ? 'Pendente em atraso' : 'Pendente';
}

export function operationPaidMinor(book: FinanceBook, operationId: string): number {
  const ids = new Set(book.obligations.filter((entry) => entry.operationId === operationId).map((entry) => entry.id));
  return sumMinor(book.settlements.filter((entry) => ids.has(entry.obligationId)).map((entry) => entry.amountMinor));
}

export function cardCreditMinor(book: FinanceBook, cardId: string, availableOn?: CivilDate): number {
  const refunds = book.refunds.filter((entry) => entry.destination === 'card' && entry.cardId === cardId && entry.status === 'received'
    && (!availableOn || entry.receivedOn! <= availableOn));
  const ids = new Set(refunds.map((entry) => entry.id));
  return sumMinor([
    ...refunds.map((entry) => entry.amountMinor),
    ...book.settlements.filter((entry) => entry.creditRefundId && ids.has(entry.creditRefundId)).map((entry) => -entry.amountMinor),
  ]);
}

export function invoiceSummary(book: FinanceBook, cardId: string, month: string, creditAvailableOn?: CivilDate) {
  const operationIds = new Set(book.operations.filter((entry) => entry.cardId === cardId).map((entry) => entry.id));
  const obligations = book.obligations.filter((entry) => operationIds.has(entry.operationId) && monthOf(entry.dueOn) === month);
  const remaining = sumMinor(obligations.map((entry) => remainingMinor(book, entry)));
  const credit = cardCreditMinor(book, cardId, creditAvailableOn);
  return { obligations, remainingMinor: remaining, creditMinor: credit, payableMinor: Math.max(0, sumMinor([remaining, -credit])) };
}

function accountFor(book: FinanceBook, id: string): Account {
  const account = book.accounts.find((entry) => entry.id === id);
  if (!account) throw new TypeError('Conta inexistente.');
  return account;
}

function movementFrom(
  account: Account, id: string, title: string, direction: 'income' | 'expense', amountMinor: number,
  nature: MovementNature, occurredOn: CivilDate | null, expectedOn: CivilDate | null, cashDate: CivilDate,
  labels: Partial<Movement> = {},
): Movement {
  return {
    id, title, currency: 'BRL', direction, moneyType: account.moneyType, amountMinor, nature,
    accountId: account.id, cardId: null, projectId: null, categoryId: null,
    occurredOn, expectedOn, settledOn: nature === 'realized' ? cashDate : null,
    plannedSettlementOn: nature === 'realized' ? null : cashDate, ...labels,
  };
}

/** One cash stream for every screen. Purchases, payments and invoices are never summed twice. */
export function bookMovements(book: FinanceBook, through: CivilDate, includeVirtual = true): Movement[] {
  const records: Movement[] = book.movements.map((movement) => ({ ...movement,
    accountId: movement.accountId ?? book.accounts.find((entry) => entry.kind === 'cash' && entry.moneyType === movement.moneyType)?.id,
  }));
  const projectedCredits = new Map(book.cards.map((card) => [card.id, cardCreditMinor(book, card.id)]));
  for (const obligation of book.obligations.slice().sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id))) {
    const operation = book.operations.find((entry) => entry.id === obligation.operationId)!;
    const account = accountFor(book, operation.accountId);
    const labels = { operationId: operation.id, obligationId: obligation.id,
      projectId: operation.projectId, categoryId: operation.categoryId, occurredTime: operation.occurredTime ?? null };
    for (const payment of book.settlements.filter((entry) => entry.obligationId === obligation.id && entry.method === 'cash')) {
      const cashAccount = accountFor(book, payment.accountId!);
      if (cashAccount.kind === 'cash') records.push(movementFrom(cashAccount, `payment:${payment.id}`,
        `${operation.title} · pagamento ${obligation.position}`, operation.direction, payment.amountMinor, 'realized',
        operation.occurredOn, operation.expectedOn, payment.settledOn, { ...labels, displayOn: payment.settledOn, settledTime: payment.settledTime ?? null }));
    }
    let remaining = remainingMinor(book, obligation);
    if (operation.cardId && remaining > 0) {
      const credit = projectedCredits.get(operation.cardId) ?? 0;
      const applied = Math.min(credit, remaining);
      remaining -= applied;
      projectedCredits.set(operation.cardId, credit - applied);
    }
    if (remaining > 0 && account.kind === 'cash') records.push(movementFrom(account, `obligation:${obligation.id}`,
      `${operation.title}${book.obligations.filter((entry) => entry.operationId === operation.id).length > 1 ? ` · parcela ${obligation.position}` : ''}`,
      operation.direction, remaining, operation.nature, operation.occurredOn, operation.expectedOn, obligation.plannedOn,
      { ...labels, displayOn: obligation.plannedOn, cardId: operation.cardId }));
  }
  for (const refund of book.refunds.filter((entry) => entry.destination === 'account' && entry.status !== 'cancelled')) {
    const original = book.operations.find((entry) => entry.id === refund.operationId)!;
    const account = accountFor(book, refund.accountId!);
    if (account.kind === 'cash') records.push(movementFrom(account, `refund:${refund.id}`,
      `${original.direction === 'expense' ? 'Reembolso' : 'Devolução'} · ${original.title}`,
      original.direction === 'expense' ? 'income' : 'expense', refund.amountMinor,
      refund.status === 'received' ? 'realized' : 'commitment', refund.receivedOn, refund.plannedOn,
      refund.receivedOn ?? refund.plannedOn, { operationId: original.id, categoryId: original.categoryId,
        projectId: original.projectId, flowKind: 'refund' }));
  }
  for (const transfer of book.transfers) {
    const from = accountFor(book, transfer.fromAccountId);
    const to = accountFor(book, transfer.toAccountId);
    const internal = from.kind === 'cash' && to.kind === 'cash';
    for (const [account, direction, other] of [[from, 'expense', to], [to, 'income', from]] as const) {
      if (account.kind === 'cash') records.push(movementFrom(account, `transfer:${transfer.id}:${direction}`,
        `${internal ? 'Transferência' : 'Movimentação de patrimônio'} · ${other.name}`,
        direction, transfer.amountMinor, 'realized', transfer.occurredOn, null, transfer.occurredOn,
        { flowKind: internal ? 'transfer' : 'investment' }));
    }
  }
  for (const trade of book.trades) {
    const account = accountFor(book, trade.accountId);
    if (account.kind === 'cash') records.push(movementFrom(account, `trade:${trade.id}`,
      `${trade.kind === 'buy' ? 'Aporte' : 'Resgate'} · ${book.assets.find((entry) => entry.id === trade.assetId)!.name}`,
      trade.kind === 'buy' ? 'expense' : 'income', trade.amountMinor, 'realized', trade.occurredOn, null,
      trade.occurredOn, { flowKind: 'investment' }));
  }
  if (includeVirtual) {
    const materialized = new Set(book.operations.map((entry) => entry.recurrenceKey).filter(Boolean));
    for (const rule of book.recurrenceRules) {
      const account = accountFor(book, rule.accountId);
      for (const occurrence of expandRecurrence(rule, book.recurrenceExceptions, `${book.openingMonth}-01`, through)) {
        if (materialized.has(occurrence.key)) continue;
        records.push(movementFrom(account, `recurrence:${occurrence.key}`, `${occurrence.title} · recorrência`,
          rule.direction, occurrence.amountMinor, rule.contractual ? 'commitment' : 'forecast', null,
          occurrence.date, occurrence.date, { projectId: rule.projectId, categoryId: rule.categoryId, recurrenceKey: occurrence.key }));
      }
    }
  }
  return records;
}

export function accountBalance(book: FinanceBook, accountId: string, asOf: CivilDate): number {
  validateCivilDate(asOf, 'Data do saldo');
  const account = accountFor(book, accountId);
  if (asOf < account.openingOn) throw new RangeError('Não há abertura conhecida para essa data.');
  const values = [account.openingMinor];
  if (account.kind === 'cash') {
    for (const record of bookMovements(book, asOf, false)) {
      if (record.accountId === accountId && record.nature === 'realized' && record.settledOn! <= asOf) {
        values.push(record.direction === 'income' ? record.amountMinor : -record.amountMinor);
      }
    }
    for (const baseline of book.baselineMovements) {
      const baselineAccount = baseline.accountId ?? book.accounts.find((entry) => entry.kind === 'cash' && entry.moneyType === baseline.moneyType)?.id;
      if (baselineAccount === accountId && baseline.nature === 'realized' && baseline.settledOn! < account.openingOn) {
        values.push(baseline.direction === 'income' ? -baseline.amountMinor : baseline.amountMinor);
      }
    }
  } else {
    for (const transfer of book.transfers.filter((entry) => entry.occurredOn <= asOf)) {
      if (transfer.fromAccountId === accountId) values.push(-transfer.amountMinor);
      if (transfer.toAccountId === accountId) values.push(transfer.amountMinor);
    }
    for (const trade of book.trades.filter((entry) => entry.accountId === accountId && entry.occurredOn <= asOf)) {
      values.push(trade.kind === 'buy' ? -trade.amountMinor : trade.amountMinor);
    }
  }
  return sumMinor(values);
}

export function protectedMinor(book: FinanceBook, eligibleOnly = false): number {
  return sumMinor(book.reserves.filter((reserve) => !eligibleOnly || accountFor(book, reserve.accountId).eligible).map((entry) => entry.amountMinor));
}

export function reserveAvailability(book: FinanceBook, accountId: string, asOf: CivilDate) {
  const cashMinor = accountBalance(book, accountId, asOf);
  const reservedMinor = sumMinor(book.reserves.filter((entry) => entry.accountId === accountId).map((entry) => entry.amountMinor));
  return { cashMinor, reservedMinor, insufficient: reservedMinor > Math.max(0, cashMinor) };
}

export function dailyCashForecast(book: FinanceBook, asOf: CivilDate, through: CivilDate, conservative: boolean) {
  validateCivilDate(asOf, 'Início'); validateCivilDate(through, 'Fim');
  if (through < asOf || through > addDays(asOf, 366)) throw new RangeError('Escolha um horizonte de até 366 dias.');
  let projected = sumMinor(book.accounts.filter((entry) => entry.kind === 'cash').map((entry) => accountBalance(book, entry.id, asOf)));
  const settledCashMinor = projected;
  const flows = new Map<CivilDate, number[]>();
  for (const record of bookMovements(book, through)) {
    const cashDate = cashDateOf(record);
    if (!cashDate || cashDate > through || (record.nature === 'realized' && cashDate <= asOf)
      || (conservative && record.direction === 'income' && record.nature === 'forecast')) continue;
    const date = cashDate < asOf ? asOf : cashDate;
    const values = flows.get(date) ?? [];
    values.push(record.direction === 'income' ? record.amountMinor : -record.amountMinor); flows.set(date, values);
  }
  const rows: { date: CivilDate; settledCashMinor: number; projectedCashMinor: number; freeMinor: number }[] = [];
  for (let date = asOf; ; date = addDays(date, 1)) {
    projected = sumMinor([projected, ...(flows.get(date) ?? [])]);
    rows.push({ date, settledCashMinor, projectedCashMinor: projected, freeMinor: sumMinor([projected, -protectedMinor(book), -book.cushionMinor]) });
    if (date === through) break;
  }
  return rows;
}

export function stockPosition(book: FinanceBook, itemId: string) {
  const lots = book.stockLots.filter((entry) => entry.itemId === itemId);
  const uses = book.stockUses.filter((entry) => entry.itemId === itemId);
  return { quantity: sumMinor([...lots.map((entry) => entry.quantity), ...uses.map((entry) => -entry.quantity)]),
    purchasedMinor: sumMinor(lots.map((entry) => entry.costMinor)) };
}

export function assetPosition(book: FinanceBook, assetId: string) {
  const asset = book.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new TypeError('Ativo inexistente.');
  const trades = book.trades.filter((entry) => entry.assetId === assetId);
  const quantity = sumMinor(trades.map((entry) => entry.kind === 'buy' ? entry.quantity : -entry.quantity));
  const costMinor = sumMinor(trades.map((entry) => entry.kind === 'buy' ? entry.amountMinor : -entry.costBasisMinor));
  const realizedGainMinor = sumMinor(trades.filter((entry) => entry.kind === 'sell').map((entry) => sumMinor([entry.amountMinor, -entry.costBasisMinor])));
  const marketMinor = roundRatio(BigInt(quantity) * BigInt(asset.marketUnitPriceMinor), BigInt(QUANTITY_SCALE));
  return { quantity, costMinor, marketMinor, realizedGainMinor, unrealizedGainMinor: sumMinor([marketMinor, -costMinor]) };
}

export function budgetSummary(book: FinanceBook, budgetId: string) {
  const budget = book.budgets.find((entry) => entry.id === budgetId);
  if (!budget) throw new TypeError('Orçamento inexistente.');
  const actual = [
    ...book.movements.filter((entry) => entry.nature === 'realized' && entry.direction === 'expense' && entry.categoryId === budget.categoryId
      && entry.occurredOn && monthOf(entry.occurredOn) === budget.month && !['transfer', 'investment', 'refund'].includes(entry.flowKind ?? '')).map((entry) => entry.amountMinor),
    ...book.operations.filter((entry) => entry.direction === 'expense' && entry.categoryId === budget.categoryId
      && entry.occurredOn && monthOf(entry.occurredOn) === budget.month).map((entry) => entry.amountMinor),
  ];
  const spentMinor = sumMinor(actual);
  return { baselineMinor: budget.baselineMinor, plannedMinor: budget.amountMinor, spentMinor,
    deviationMinor: sumMinor([spentMinor, -budget.amountMinor]),
    deviationBasisPoints: budget.amountMinor === 0 ? null : roundRatio(BigInt(spentMinor - budget.amountMinor) * 10000n, BigInt(budget.amountMinor)) };
}

export function productionSummary(book: FinanceBook, projectId: string) {
  const salesMinor = sumMinor([
    ...book.movements.filter((entry) => entry.projectId === projectId && entry.direction === 'income' && entry.nature === 'realized'
      && !['investment', 'transfer', 'refund'].includes(entry.flowKind ?? '')).map((entry) => entry.amountMinor),
    ...book.operations.filter((entry) => entry.projectId === projectId && entry.direction === 'income' && entry.occurredOn !== null).map((entry) => entry.amountMinor),
  ]);
  const informedCostMinor = sumMinor(book.productionCosts.filter((entry) => entry.projectId === projectId).map((entry) => entry.amountMinor));
  const refundedSalesMinor = sumMinor(book.refunds.filter((refund) => refund.status === 'received' && book.operations.some((operation) =>
    operation.id === refund.operationId && operation.direction === 'income' && operation.projectId === projectId)).map((refund) => refund.amountMinor));
  return { salesMinor, refundedSalesMinor, informedCostMinor, grossResultMinor: sumMinor([salesMinor, -refundedSalesMinor, -informedCostMinor]) };
}

export function financialPosition(book: FinanceBook, asOf: CivilDate) {
  const cashMinor = sumMinor(book.accounts.filter((entry) => entry.kind === 'cash').map((entry) => accountBalance(book, entry.id, asOf)));
  const investmentMinor = sumMinor([
    ...book.accounts.filter((entry) => entry.kind === 'investment').map((entry) => accountBalance(book, entry.id, asOf)),
    ...book.assets.map((asset) => assetPosition(book, asset.id).marketMinor),
  ]);
  const confirmed = new Map(book.operations.filter((entry) => entry.nature === 'commitment').map((entry) => [entry.id, entry]));
  const debtMinor = sumMinor([
    ...book.obligations.filter((entry) => confirmed.get(entry.operationId)?.direction === 'expense').map((entry) => remainingMinor(book, entry)),
    ...book.movements.filter((entry) => entry.nature === 'commitment' && entry.direction === 'expense').map((entry) => entry.amountMinor),
  ]);
  const receivableMinor = sumMinor(book.obligations.filter((entry) => {
    const operation = confirmed.get(entry.operationId); return operation?.direction === 'income' && operation.occurredOn !== null;
  }).map((entry) => remainingMinor(book, entry)));
  const cardCreditsMinor = sumMinor(book.cards.map((entry) => cardCreditMinor(book, entry.id)));
  return { cashMinor, investmentMinor, debtMinor, receivableMinor, cardCreditsMinor,
    netMinor: sumMinor([cashMinor, investmentMinor, receivableMinor, cardCreditsMinor, -debtMinor]) };
}

export function toolCostPerUse(book: FinanceBook, toolId: string): number | null {
  const tool = book.tools.find((entry) => entry.id === toolId);
  if (!tool) throw new TypeError('Ferramenta inexistente.');
  const operation = book.operations.find((entry) => entry.id === tool.operationId)!;
  return tool.uses === 0 ? null : roundRatio(BigInt(operation.amountMinor) + BigInt(tool.attributedMinor) - BigInt(tool.residualMinor), BigInt(tool.uses));
}

export function recurrenceCancellationPreview(book: FinanceBook, ruleId: string, fromPosition: number, scope: string, through: CivilDate) {
  const rule = book.recurrenceRules.find((entry) => entry.id === ruleId);
  if (!rule) throw new TypeError('Série inexistente.');
  const inScope = (position: number) => scope === 'rule' || scope === 'pending' || (scope === 'this' ? position === fromPosition : position >= fromPosition);
  const materialized = book.operations.filter((entry) => entry.recurrenceKey?.startsWith(`${rule.id}:`) && inScope(Number(entry.recurrenceKey.split(':').at(-1))));
  const keys = new Set(materialized.map((entry) => entry.recurrenceKey));
  const virtual = expandRecurrence(rule, book.recurrenceExceptions, `${book.openingMonth}-01`, through).filter((entry) => inScope(entry.position) && !keys.has(entry.key));
  const materialIds = new Set(materialized.map((entry) => entry.id));
  const obligations = book.obligations.filter((entry) => materialIds.has(entry.operationId));
  return { virtualCount: virtual.length, openCount: obligations.filter((entry) => remainingMinor(book, entry) > 0).length,
    paidCount: obligations.filter((entry) => paidMinor(book, entry.id) > 0).length, contractual: rule.contractual };
}
