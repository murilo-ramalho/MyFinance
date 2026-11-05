import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyBook, type CommandContext, type FinanceBook, type FinanceCommand, type OperationInput } from '../src/domain/book.ts';
import { applyFinanceCommand, validateBook } from '../src/domain/bookCommands.ts';
import { accountBalance, acquisitionSimulationPreview, assetPosition, bookMovements, budgetSummary, dailyCashForecast, forecastHorizon, historicalMonthSummary, invoiceSummary, monthEnd, productionSummary, protectedMinor, remainingMinor, simulateAcquisition, stockPosition, toolCostPerUse } from '../src/domain/bookSelectors.ts';
import { allocateMinor, formatQuantity, parseQuantity, roundRatio } from '../src/domain/exact.ts';
import { expandRecurrence, type RecurrenceRule } from '../src/domain/recurrences.ts';
import { summarizeMonth } from '../src/domain/movements.ts';

function initial(): FinanceBook {
  const book = emptyBook('2026-10');
  book.accounts = [
    { id: 'bank', name: 'Banco', currency: 'BRL', kind: 'cash', moneyType: 'digital', openingOn: '2026-10-01', openingMinor: 500000, eligible: true },
    { id: 'wallet', name: 'Carteira', currency: 'BRL', kind: 'cash', moneyType: 'physical', openingOn: '2026-10-01', openingMinor: 0, eligible: true },
  ];
  book.categories = [{ id: 'food', name: 'Alimentação' }];
  book.projects = [{ id: 'printer', name: 'Impressora', description: 'Produção 3D' }];
  book.cards = [{ id: 'card', name: 'Cartão' }];
  return book;
}
const context = (id: string): CommandContext => ({ requestId: id, recordedAt: '2026-12-20T15:00:00.000Z', today: '2026-12-20' });
function apply(book: FinanceBook, command: FinanceCommand, id = `r-${book.audit.length}`): FinanceBook {
  return applyFinanceCommand(book, command, context(id));
}
function operation(id = 'purchase', overrides: Partial<OperationInput> = {}): OperationInput {
  return { id, title: id, direction: 'expense', amountMinor: 10000, nature: 'commitment', occurredOn: '2026-10-20',
    expectedOn: null, accountId: 'bank', categoryId: null, projectId: null, cardId: null, dueOn: '2026-11-10',
    installmentCount: 1, shortMonthPolicy: 'last-day', ...overrides };
}
function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return { id: 'monthly', title: 'Compra voluntária', version: 1, kind: 'monthly', anchorOn: '2026-11-02',
    interval: 1, endOn: '2027-01-31', count: null, shortMonthPolicy: 'last-day', canceledFrom: null,
    contractual: false, amountMinor: 1000, direction: 'expense', accountId: 'bank', categoryId: null,
    projectId: null, lastCompletedOn: null, completedCount: 0, conditionNote: null, ...overrides };
}

test('allocates cents deterministically and handles exact quantities and half-even rounding', () => {
  assert.deepEqual(allocateMinor(10000, 3), [3334, 3333, 3333]);
  for (let count = 1; count <= 50; count += 1) assert.equal(allocateMinor(10007, count).reduce((sum, value) => sum + value, 0), 10007);
  assert.equal(parseQuantity('0,200001'), 200001);
  assert.equal(formatQuantity(200001), '0,200001');
  assert.equal(parseQuantity('0.0000001'), null);
  assert.equal(parseQuantity('-1'), null);
  assert.equal(roundRatio(5n, 2n), 2);
  assert.equal(roundRatio(7n, 2n), 4);
  assert.equal(roundRatio(-5n, 2n), -2);
  assert.throws(() => allocateMinor(2, 3));
});

test('installments preserve the total and contractual due dates across month ends', () => {
  const book = apply(initial(), { kind: 'create-operation', operation: operation('purchase', { installmentCount: 3, dueOn: '2026-10-31' }) });
  assert.deepEqual(book.obligations.map((entry) => entry.amountMinor), [3334, 3333, 3333]);
  assert.deepEqual(book.obligations.map((entry) => entry.dueOn), ['2026-10-31', '2026-11-30', '2026-12-31']);
  validateBook(book);
});

test('partial early and late payments affect cash only on their actual dates and preserve the original due date', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation() });
  const id = book.obligations[0].id;
  book = apply(book, { kind: 'settle', settlement: { id: 'early', obligationId: id, amountMinor: 4000,
    settledOn: '2026-10-28', accountId: 'bank', method: 'cash', creditRefundId: null } });
  assert.equal(remainingMinor(book, book.obligations[0]), 6000);
  assert.equal(accountBalance(book, 'bank', '2026-10-27'), 500000);
  assert.equal(accountBalance(book, 'bank', '2026-10-28'), 496000);
  book = apply(book, { kind: 'reschedule', obligationId: id, plannedOn: '2026-12-02' });
  book = apply(book, { kind: 'settle', settlement: { id: 'late', obligationId: id, amountMinor: 6000,
    settledOn: '2026-12-02', accountId: 'bank', method: 'cash', creditRefundId: null } });
  assert.equal(book.obligations[0].dueOn, '2026-11-10');
  assert.equal(summarizeMonth(bookMovements(book, '2026-12-31'), '2026-11', 496000).outflowMinor, 0);
  assert.equal(accountBalance(book, 'bank', '2026-12-02'), 490000);
  assert.equal(book.operations[0].occurredOn, '2026-10-20');
  assert.throws(() => apply(book, { kind: 'settle', settlement: { id: 'excess', obligationId: id,
    amountMinor: 1, settledOn: '2026-12-02', accountId: 'bank', method: 'cash', creditRefundId: null } }));
});

test('pending refunds do not credit settled cash, and partial requests reserve the eligible amount', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation('purchase', { amountMinor: 16900, initialPaidMinor: 16900, settledOn: '2026-10-20' }) });
  const refund = { id: 'refund-1', operationId: 'purchase', amountMinor: 6000, status: 'pending' as const,
    plannedOn: '2026-10-25' as const, receivedOn: null, destination: 'account' as const, accountId: 'bank', cardId: null, reason: 'Devolução parcial' };
  book = apply(book, { kind: 'request-refund', refund });
  assert.equal(accountBalance(book, 'bank', '2026-10-25'), 483100);
  book = apply(book, { kind: 'request-refund', refund: { ...refund, id: 'refund-2', amountMinor: 10900 } });
  assert.throws(() => apply(book, { kind: 'request-refund', refund: { ...refund, id: 'excess', amountMinor: 1 } }));
  book = apply(book, { kind: 'receive-refund', refundId: 'refund-1', receivedOn: '2026-10-25' });
  book = apply(book, { kind: 'receive-refund', refundId: 'refund-2', receivedOn: '2026-10-26' });
  assert.equal(accountBalance(book, 'bank', '2026-10-25'), 489100);
  assert.equal(accountBalance(book, 'bank', '2026-10-26'), 500000);
  assert.equal(book.operations.length, 1);
  assert.equal(book.settlements.length, 1);
  assert.equal(bookMovements(book, '2026-10-31').filter((entry) => entry.flowKind === 'refund').length, 2);
});

test('card credits reduce an invoice without inventing bank income or duplicating purchase plus invoice payment', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation('card-purchase', { cardId: 'card', amountMinor: 12000 }) });
  assert.equal(accountBalance(book, 'bank', '2026-10-25'), 500000);
  book = apply(book, { kind: 'request-refund', refund: { id: 'credit', operationId: 'card-purchase', amountMinor: 2000,
    status: 'received', plannedOn: '2026-10-25', receivedOn: '2026-10-25', destination: 'card', accountId: null, cardId: 'card', reason: '' } });
  assert.equal(accountBalance(book, 'bank', '2026-10-25'), 500000);
  assert.equal(invoiceSummary(book, 'card', '2026-11').payableMinor, 10000);
  assert.equal(summarizeMonth(bookMovements(book, '2026-11-30'), '2026-11', 500000).outflowMinor, 10000);
  book = apply(book, { kind: 'pay-invoice', cardId: 'card', month: '2026-11', amountMinor: 10000, accountId: 'bank', settledOn: '2026-10-28' });
  assert.equal(accountBalance(book, 'bank', '2026-10-28'), 490000);
  assert.equal(invoiceSummary(book, 'card', '2026-11').payableMinor, 0);
  assert.equal(summarizeMonth(bookMovements(book, '2026-11-30'), '2026-11', 490000).outflowMinor, 0);
  assert.equal(book.operations[0].amountMinor, 12000);
});

test('a retroactive invoice payment cannot spend a card credit received on a later date', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation('card-purchase', { cardId: 'card', amountMinor: 12000 }) });
  book = apply(book, { kind: 'request-refund', refund: { id: 'credit', operationId: 'card-purchase', amountMinor: 2000,
    status: 'received', plannedOn: '2026-10-25', receivedOn: '2026-10-25', destination: 'card', accountId: null, cardId: 'card', reason: '' } });
  assert.equal(invoiceSummary(book, 'card', '2026-11', '2026-10-24').payableMinor, 12000);
  const snapshot = JSON.stringify(book);
  assert.throws(() => apply(book, { kind: 'settle', settlement: { id: 'too-early', obligationId: book.obligations[0].id,
    amountMinor: 2000, settledOn: '2026-10-24', accountId: null, method: 'card-credit', creditRefundId: 'credit' } }));
  assert.equal(JSON.stringify(book), snapshot);
  book = apply(book, { kind: 'pay-invoice', cardId: 'card', month: '2026-11', amountMinor: 10000, accountId: 'bank', settledOn: '2026-10-24' });
  assert.equal(book.settlements.length, 1);
  assert.equal(book.settlements[0].method, 'cash');
  assert.equal(remainingMinor(book, book.obligations[0]), 2000);
  book = apply(book, { kind: 'pay-invoice', cardId: 'card', month: '2026-11', amountMinor: 0, accountId: 'bank', settledOn: '2026-10-25' });
  assert.equal(remainingMinor(book, book.obligations[0]), 0);
  assert.equal(accountBalance(book, 'bank', '2026-10-25'), 490000);
  const invalidImport = structuredClone(book);
  invalidImport.settlements[1].settledOn = '2026-10-24';
  assert.throws(() => validateBook(invalidImport));
});

test('confirmed cancellation of eight unpaid installments preserves four historic payments', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation('contract', { installmentCount: 12, amountMinor: 120000, dueOn: '2026-01-02', occurredOn: '2026-01-01' }) });
  for (const obligation of book.obligations.slice(0, 4)) book = apply(book, { kind: 'settle', settlement: {
    id: `payment-${obligation.position}`, obligationId: obligation.id, amountMinor: 10000,
    settledOn: obligation.dueOn, accountId: 'bank', method: 'cash', creditRefundId: null,
  } });
  const pending = book.obligations.slice(4).map((entry) => entry.id);
  const snapshot = JSON.stringify(book);
  assert.throws(() => apply(book, { kind: 'waive', obligationIds: pending, legalReleaseConfirmed: false }));
  assert.equal(JSON.stringify(book), snapshot);
  book = apply(book, { kind: 'waive', obligationIds: pending, legalReleaseConfirmed: true });
  assert.equal(book.settlements.length, 4);
  assert.equal(book.obligations.filter((entry) => entry.status === 'waived').length, 8);
  assert.equal(book.refunds.length, 0);
  assert.equal(accountBalance(book, 'bank', '2026-12-20'), 460000);
});

test('failed compound cancellation changes neither earlier obligations nor audit', () => {
  const book = apply(initial(), { kind: 'create-operation', operation: operation() });
  const snapshot = JSON.stringify(book);
  assert.throws(() => apply(book, { kind: 'waive', obligationIds: [book.obligations[0].id, 'missing'], legalReleaseConfirmed: true }));
  assert.equal(JSON.stringify(book), snapshot);
});

test('internal transfers conserve consolidated cash and do not inflate income and expense totals', () => {
  const book = apply(initial(), { kind: 'transfer', transfer: { id: 'transfer', fromAccountId: 'bank', toAccountId: 'wallet', amountMinor: 30000, occurredOn: '2026-10-21' } });
  assert.equal(accountBalance(book, 'bank', '2026-10-21'), 470000);
  assert.equal(accountBalance(book, 'wallet', '2026-10-21'), 30000);
  const summary = summarizeMonth(bookMovements(book, '2026-10-31'), '2026-10', 500000);
  assert.equal(summary.inflowMinor, 0); assert.equal(summary.outflowMinor, 0); assert.equal(summary.closingBalanceMinor, 500000);
});

test('reserves protect existing money without creating payment or wealth', () => {
  const book = apply(initial(), { kind: 'save-reserve', reserve: { id: 'emergency', name: 'Emergência', accountId: 'bank', amountMinor: 30000 } });
  assert.equal(accountBalance(book, 'bank', '2026-10-21'), 500000);
  assert.equal(protectedMinor(book), 30000);
  assert.equal(bookMovements(book, '2026-10-31').length, 0);
  assert.throws(() => apply(book, { kind: 'save-reserve', reserve: { id: 'excess', name: 'Excesso', accountId: 'bank', amountMinor: 480000 } }));
});

test('undated acquisitions have no cash impact; simulations are isolated and conversion is linked once', () => {
  let book = apply(initial(), { kind: 'save-plan', plan: { id: 'printer', title: 'Peça desejada', currency: 'BRL', estimatedMinor: 20000,
    targetMinor: 18000, projectId: null, notes: 'Aguardar promoção', convertedOperationId: null } });
  const snapshot = JSON.stringify(book);
  assert.equal(bookMovements(book, '2026-12-31').length, 0);
  assert.equal(summarizeMonth(simulateAcquisition(book, 'printer', '2026-12-10', 'bank'), '2026-12', 500000).closingBalanceMinor, 480000);
  assert.equal(JSON.stringify(book), snapshot);
  const command: FinanceCommand = { kind: 'convert-plan', planId: 'printer', operation: operation('converted', { amountMinor: 19000 }) };
  book = apply(book, command, 'conversion');
  assert.equal(book.plans[0].convertedOperationId, 'converted');
  assert.equal(book.operations[0].planId, 'printer');
  assert.equal(book.plans[0].targetMinor, 18000);
  assert.equal(applyFinanceCommand(book, command, context('conversion')), book);
  assert.throws(() => apply(book, command, 'second-conversion'));
});

test('categories and projects are independent, and budget comparison uses the economic fact once', () => {
  let book = apply(initial(), { kind: 'save-budget', budget: { id: 'food-budget', categoryId: 'food', month: '2026-10', amountMinor: 60000, baselineMinor: 60000 } });
  book = apply(book, { kind: 'create-operation', operation: operation('food', { amountMinor: 63600, categoryId: 'food', projectId: 'printer', initialPaidMinor: 63600, settledOn: '2026-11-02' }) });
  const summary = budgetSummary(book, 'food-budget');
  assert.equal(summary.spentMinor, 63600); assert.equal(summary.deviationMinor, 3600); assert.equal(summary.deviationBasisPoints, 600);
  book = apply(book, { kind: 'save-budget', budget: { ...book.budgets[0], amountMinor: 65000, baselineMinor: 1 } });
  assert.equal(book.budgets[0].baselineMinor, 60000);
  assert.equal(accountBalance(book, 'bank', '2026-10-31'), 500000);
  assert.equal(accountBalance(book, 'bank', '2026-11-02'), 436400);
});

test('stock consumption only changes exact quantities; production costs are entered manually and never generate cash', () => {
  let book = apply(initial(), { kind: 'save-stock-item', item: { id: 'filament', name: 'Filamento', unit: 'kg' } });
  book = apply(book, { kind: 'purchase-stock', operation: operation('stock-purchase', { amountMinor: 10500, initialPaidMinor: 10500, settledOn: '2026-10-20' }),
    lot: { id: 'lot', itemId: 'filament', operationId: 'stock-purchase', quantity: 3000000, costMinor: 10500, acquiredOn: '2026-10-20' } });
  book = apply(book, { kind: 'consume-stock', id: 'use', itemId: 'filament', quantity: 200000, occurredOn: '2026-10-21', projectId: 'printer', loss: false });
  assert.equal(stockPosition(book, 'filament').quantity, 2800000);
  assert.equal(accountBalance(book, 'bank', '2026-10-21'), 489500);
  assert.equal(book.productionCosts.length, 0);
  book = apply(book, { kind: 'save-production-cost', cost: { id: 'manual-cost', title: 'Custo informado da peça', projectId: 'printer', saleOperationId: null, amountMinor: 8487, occurredOn: '2026-10-21' } });
  assert.equal(accountBalance(book, 'bank', '2026-10-21'), 489500);
  assert.equal(productionSummary(book, 'printer').informedCostMinor, 8487);
  assert.throws(() => apply(book, { kind: 'consume-stock', id: 'excess', itemId: 'filament', quantity: 3000000, occurredOn: '2026-10-21', projectId: null, loss: true }));
  assert.throws(() => apply(book, { kind: 'consume-stock', id: 'too-early', itemId: 'filament', quantity: 1, occurredOn: '2026-10-19', projectId: null, loss: false }));
});

test('manual costs preserve the sample production result and equal-value sales remain distinct', () => {
  let book = initial();
  for (const [id, amountMinor, cost] of [['ZOKI', 12000, 8487], ['Espatulas', 14000, 9032]] as const) {
    book = apply(book, { kind: 'create-operation', operation: operation(id, { title: id, direction: 'income', amountMinor, projectId: 'printer' }) });
    book = apply(book, { kind: 'save-production-cost', cost: { id: `cost-${id}`, title: `Custo ${id}`, projectId: 'printer', saleOperationId: id, amountMinor: cost, occurredOn: '2026-10-20' } });
  }
  assert.equal(productionSummary(book, 'printer').grossResultMinor, 8481);
  book = apply(book, { kind: 'create-operation', operation: operation('LETREIRO', { title: 'LETREIRO', direction: 'income', amountMinor: 12000, projectId: 'printer' }) });
  assert.equal(book.operations.length, 3);
});

test('investments distinguish contributions, manual market valuation, sales and realized gain', () => {
  let book = apply(initial(), { kind: 'save-asset', asset: { id: 'asset', name: 'Ativo', marketUnitPriceMinor: 11000, valuedOn: '2026-10-20' } });
  book = apply(book, { kind: 'trade', trade: { id: 'buy', assetId: 'asset', kind: 'buy', quantity: 2000000, amountMinor: 21000, costBasisMinor: 0, accountId: 'bank', occurredOn: '2026-10-20' } });
  assert.equal(assetPosition(book, 'asset').marketMinor, 22000);
  assert.equal(assetPosition(book, 'asset').unrealizedGainMinor, 1000);
  assert.equal(accountBalance(book, 'bank', '2026-10-20'), 479000);
  book = apply(book, { kind: 'trade', trade: { id: 'sell', assetId: 'asset', kind: 'sell', quantity: 1000000, amountMinor: 11500, costBasisMinor: 10500, accountId: 'bank', occurredOn: '2026-10-21' } });
  assert.equal(assetPosition(book, 'asset').realizedGainMinor, 1000);
  assert.equal(assetPosition(book, 'asset').costMinor, 10500);
  assert.throws(() => apply(book, { kind: 'trade', trade: { id: 'excess', assetId: 'asset', kind: 'sell', quantity: 2000000, amountMinor: 100, costBasisMinor: 0, accountId: 'bank', occurredOn: '2026-10-21' } }));
});

test('tool cost per use is undefined for zero uses rather than infinity', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation('tool') });
  book = apply(book, { kind: 'save-tool', tool: { id: 'tool', name: 'Ferramenta', operationId: 'tool', attributedMinor: 0, residualMinor: 0, uses: 0 } });
  assert.equal(toolCostPerUse(book, 'tool'), null);
  book = apply(book, { kind: 'tool-use', toolId: 'tool', count: 10 });
  assert.equal(toolCostPerUse(book, 'tool'), 1000);
});

test('calendar recurrence ends inclusively, skips one optional occurrence and materializes idempotently', () => {
  let book = apply(initial(), { kind: 'save-recurrence', rule: rule() });
  assert.deepEqual(expandRecurrence(book.recurrenceRules[0], [], '2026-11-01', '2027-02-28').map((entry) => entry.date), ['2026-11-02', '2026-12-02', '2027-01-02']);
  book = apply(book, { kind: 'recurrence-exception', exception: { id: 'december', ruleId: 'monthly', position: 1, action: 'skip', date: null, amountMinor: null } });
  assert.deepEqual(expandRecurrence(book.recurrenceRules[0], book.recurrenceExceptions, '2026-11-01', '2027-02-28').map((entry) => entry.date), ['2026-11-02', '2027-01-02']);
  book = apply(book, { kind: 'materialize-occurrence', ruleId: 'monthly', position: 0, through: '2027-02-28' });
  book = apply(book, { kind: 'materialize-occurrence', ruleId: 'monthly', position: 0, through: '2027-02-28' });
  assert.equal(book.operations.length, 1);
  assert.equal(bookMovements(book, '2027-02-28').length, 2);
});

test('single and future recurrence changes preserve stable keys and paid history', () => {
  let book = apply(initial(), { kind: 'save-recurrence', rule: rule() });
  book = apply(book, { kind: 'materialize-occurrence', ruleId: 'monthly', position: 1, through: '2027-01-31' });
  book = apply(book, { kind: 'recurrence-exception', exception: { id: 'change', ruleId: 'monthly', position: 1, action: 'override', date: '2026-12-04', amountMinor: 2000 } });
  assert.equal(book.operations[0].amountMinor, 2000);
  assert.equal(book.operations[0].recurrenceKey, 'monthly:1');
  assert.equal(book.obligations[0].dueOn, '2026-12-02');
  assert.equal(book.obligations[0].plannedOn, '2026-12-04');
  book = apply(book, { kind: 'revise-recurrence', ruleId: 'monthly', fromPosition: 2, amountMinor: 3000, title: 'Valor revisado' });
  assert.deepEqual(expandRecurrence(book.recurrenceRules[0], book.recurrenceExceptions, '2026-11-01', '2027-01-31').map((entry) => entry.amountMinor), [1000, 2000, 3000]);
});

test('contracted recurrence cannot be skipped; cancellation requires real release and preserves payments', () => {
  let book = apply(initial(), { kind: 'save-recurrence', rule: rule({ contractual: true }) });
  assert.throws(() => apply(book, { kind: 'recurrence-exception', exception: { id: 'skip', ruleId: 'monthly', position: 1, action: 'skip', date: null, amountMinor: null } }));
  book = apply(book, { kind: 'materialize-occurrence', ruleId: 'monthly', position: 0, through: '2027-01-31' });
  book = apply(book, { kind: 'settle', settlement: { id: 'paid', obligationId: book.obligations[0].id, amountMinor: 1000, settledOn: '2026-11-02', accountId: 'bank', method: 'cash', creditRefundId: null } });
  book = apply(book, { kind: 'cancel-recurrence', ruleId: 'monthly', from: '2026-12-02', position: 1, scope: 'future', legalReleaseConfirmed: true });
  assert.equal(book.settlements.length, 1);
  assert.equal(bookMovements(book, '2027-02-28').length, 1);
});

test('completion-based maintenance reanchors to the actual execution and conditions never create payments', () => {
  let book = apply(initial(), { kind: 'save-recurrence', rule: rule({ kind: 'after-completion', anchorOn: '2026-07-15', interval: 6, endOn: null }) });
  book = apply(book, { kind: 'complete-recurrence', ruleId: 'monthly', completedOn: '2026-08-02' });
  const occurrences = expandRecurrence(book.recurrenceRules[0], [], '2026-08-01', '2027-08-01');
  assert.deepEqual(occurrences.map((entry) => entry.date), ['2027-02-02']);
  assert.equal(occurrences[0].key, 'monthly:1');
  const condition = rule({ kind: 'condition', conditionNote: 'Estoque baixo' });
  assert.deepEqual(expandRecurrence(condition, [], '2026-11-01', '2027-02-28'), []);
});

test('revising a pending total preserves baseline, and correcting a payment requires an audit reason', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation() });
  book = apply(book, { kind: 'revise-operation', operationId: 'purchase', title: 'Corrigido', amountMinor: 11000,
    occurredOn: '2026-10-20', expectedOn: null, accountId: 'bank', categoryId: null, projectId: null });
  assert.equal(book.operations[0].baselineAmountMinor, 10000);
  const settlement = { id: 'payment', obligationId: book.obligations[0].id, amountMinor: 1000, settledOn: '2026-10-25' as const, accountId: 'bank', method: 'cash' as const, creditRefundId: null };
  book = apply(book, { kind: 'settle', settlement });
  assert.throws(() => apply(book, { kind: 'correct-settlement', settlement: { ...settlement, amountMinor: 1500 } }));
  book = applyFinanceCommand(book, { kind: 'correct-settlement', settlement: { ...settlement, amountMinor: 1500 } }, { ...context('correction'), reason: 'Erro de digitação' });
  assert.equal(book.settlements[0].amountMinor, 1500);
  assert.ok(book.audit.at(-1)!.changes.some((entry) => entry.table === 'settlements'));
});

test('invalid references, future confirmations and conflicting request reuse fail without mutation', () => {
  const book = initial();
  const snapshot = JSON.stringify(book);
  assert.throws(() => apply(book, { kind: 'create-operation', operation: operation('invalid', { accountId: 'missing' }) }));
  assert.throws(() => apply(book, { kind: 'create-operation', operation: operation('future', { initialPaidMinor: 100, settledOn: '2027-01-01' }) }));
  assert.equal(JSON.stringify(book), snapshot);
  const command: FinanceCommand = { kind: 'set-cushion', amountMinor: 100 };
  const after = apply(book, command, 'same-id');
  assert.equal(applyFinanceCommand(after, command, context('same-id')), after);
  assert.throws(() => applyFinanceCommand(after, { kind: 'set-cushion', amountMinor: 101 }, context('same-id')));
  assert.equal(monthEnd('2028-02'), '2028-02-29');
});

test('simulation keeps every other occurrence in the target month and never changes the source book', () => {
  let book = apply(initial(), { kind: 'save-recurrence', rule: rule() });
  book = apply(book, { kind: 'save-plan', plan: { id: 'plan', title: 'Compra possível', currency: 'BRL', estimatedMinor: 2000,
    targetMinor: null, notes: '', projectId: null, convertedOperationId: null } });
  const before = JSON.stringify(book);
  const preview = acquisitionSimulationPreview(book, 'plan', '2027-01-01', 'bank', '2026-12-20');
  assert.equal(preview.impactMinor, -2000);
  assert.equal(preview.scenarioClosingMinor, preview.baselineClosingMinor - 2000);
  assert.equal(JSON.stringify(book), before);
});

test('a shortfall does not prevent reducing existing reserves or create a fictitious receipt', () => {
  let book = apply(initial(), { kind: 'save-reserve', reserve: { id: 'one', name: 'Primeira', accountId: 'bank', amountMinor: 10000 } });
  book = apply(book, { kind: 'save-reserve', reserve: { id: 'two', name: 'Segunda', accountId: 'bank', amountMinor: 10000 } });
  book = apply(book, { kind: 'create-operation', operation: operation('expense', { amountMinor: 600000, initialPaidMinor: 600000, settledOn: '2026-10-20' }) });
  book = apply(book, { kind: 'save-reserve', reserve: { ...book.reserves[0], amountMinor: 0 } });
  assert.equal(accountBalance(book, 'bank', '2026-10-25'), -100000);
  assert.equal(protectedMinor(book), 10000);
});

test('confirming a forecast changes only its remainder and retains the original amount for comparison', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation('forecast', { nature: 'forecast', amountMinor: 60000, occurredOn: null }) });
  book = apply(book, { kind: 'confirm-operation', operationId: 'forecast', amountMinor: 63600, occurredOn: '2026-10-25' });
  assert.equal(book.operations[0].baselineAmountMinor, 60000);
  assert.equal(book.operations[0].nature, 'commitment');
  assert.equal(book.settlements.length, 0);
  assert.equal(bookMovements(book, '2026-11-30').filter((entry) => entry.nature === 'commitment')[0].amountMinor, 63600);
});

test('daily cash keeps a temporary negative balance even when a later confirmed receipt restores it', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation('bill', { amountMinor: 600000, dueOn: '2026-10-26', occurredOn: null }) });
  book = apply(book, { kind: 'create-operation', operation: operation('receipt', { amountMinor: 200000, dueOn: '2026-10-28', direction: 'income', occurredOn: null }) });
  const days = dailyCashForecast(book, '2026-10-25', '2026-10-29', true);
  assert.equal(days.find((entry) => entry.date === '2026-10-26')!.projectedCashMinor, -100000);
  assert.equal(days.at(-1)!.projectedCashMinor, 100000);
});

test('an explicit 30-day horizon works without inventing a future salary', () => {
  let book = initial();
  assert.equal(forecastHorizon(book, [], '2026-10-25'), null);
  book = apply(book, { kind: 'set-preferences', timeZone: 'America/Sao_Paulo', horizon: '30-days' });
  assert.equal(forecastHorizon(book, [], '2026-10-25'), '2026-11-24');
  assert.equal(book.movements.length, 0);
  assert.throws(() => apply(book, { kind: 'set-preferences', timeZone: 'invalid-zone', horizon: '30-days' }));
});

test('known historical months show settled cash and retroactive corrections propagate into them', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation('past', { amountMinor: 25000, initialPaidMinor: 25000, settledOn: '2026-10-20' }) });
  assert.equal(historicalMonthSummary(book, '2026-10')!.closingBalanceMinor, 475000);
  assert.equal(historicalMonthSummary(book, '2026-11')!.openingBalanceMinor, 475000);
  book = applyFinanceCommand(book, { kind: 'correct-settlement', settlement: { ...book.settlements[0], amountMinor: 20000 } }, { ...context('history-correction'), reason: 'Valor digitado incorretamente' });
  assert.equal(historicalMonthSummary(book, '2026-10')!.closingBalanceMinor, 480000);
  assert.equal(historicalMonthSummary(book, '2026-11')!.openingBalanceMinor, 480000);
  assert.equal(historicalMonthSummary(book, '2026-09'), null);
});

test('withdrawing a pending refund removes only the expectation, preserving the original paid purchase', () => {
  let book = apply(initial(), { kind: 'create-operation', operation: operation('purchase', { amountMinor: 16900, initialPaidMinor: 16900, settledOn: '2026-10-20' }) });
  const refund = { id: 'pending', operationId: 'purchase', amountMinor: 6000, status: 'pending' as const, plannedOn: '2026-10-25' as const,
    receivedOn: null, destination: 'account' as const, accountId: 'bank', cardId: null, reason: '' };
  book = apply(book, { kind: 'request-refund', refund });
  book = apply(book, { kind: 'cancel-refund', refundId: 'pending' });
  assert.equal(book.refunds[0].status, 'cancelled');
  assert.equal(accountBalance(book, 'bank', '2026-10-25'), 483100);
  assert.equal(bookMovements(book, '2026-11-30').filter((entry) => entry.flowKind === 'refund').length, 0);
  book = apply(book, { kind: 'request-refund', refund: { ...refund, id: 'complete', amountMinor: 16900, status: 'received', receivedOn: '2026-10-25' } });
  assert.throws(() => apply(book, { kind: 'cancel-refund', refundId: 'complete' }));
});
