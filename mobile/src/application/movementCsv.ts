import { brlInputFromMinor, parseBrlToMinor } from '../domain/money.ts';
import { validateMovement, type CivilDate, type Movement } from '../domain/movements.ts';
import type { FinanceBook } from '../domain/book.ts';
import { bookMovements } from '../domain/bookSelectors.ts';

const COLUMNS = ['id', 'descricao', 'tipo', 'estado', 'valor_brl', 'data_fato', 'data_prevista_evento', 'data_caixa', 'hora_fato', 'hora_caixa', 'conta_id', 'categoria_id', 'projeto_id', 'cartao_id', 'moeda', 'natureza_fluxo', 'operacao_origem'] as const;
export interface CsvPreview { records: Movement[]; duplicateIds: string[]; warnings: string[] }

/** Bounded CSV parser: data only, including quoted separators/newlines; no formulas are evaluated. */
export function parseCsv(text: string): string[][] {
  if (text.length > 2 * 1024 * 1024) throw new Error('CSV acima do limite de 2 MB.');
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closedQuote = false;
  const pushCell = () => { row.push(cell); cell = ''; closedQuote = false; };
  const pushRow = () => { pushCell(); if (row.some((value) => value.length > 0)) rows.push(row); row = []; if (rows.length > 10001) throw new Error('CSV acima do limite de 10.000 registros.'); };
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') { quoted = false; closedQuote = true; }
      else cell += character;
    } else if (character === '"' && cell.length === 0 && !closedQuote) quoted = true;
    else if (character === ';') pushCell();
    else if (character === '\n' || character === '\r') { if (character === '\r' && source[index + 1] === '\n') index += 1; pushRow(); }
    else if (closedQuote) throw new Error('Texto após fechamento de aspas no CSV.');
    else if (character === '"') throw new Error('Aspas inválidas no CSV.');
    else cell += character;
    if (cell.length > 4000) throw new Error('Campo CSV acima do limite permitido.');
  }
  if (quoted) throw new Error('CSV com aspas não fechadas.');
  if (cell || row.length || closedQuote) pushRow();
  return rows;
}

function safeCell(text: string): string {
  const escaped = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${escaped.replaceAll('"', '""')}"`;
}
function importedText(text: string): string {
  // Strip only the exporter safety prefix, never execute the resulting text.
  return /^'[\s]*[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

/** Explicit plaintext report, not a backup of relationships or authentication. */
export function exportMovementsCsv(records: readonly Movement[]): string {
  return [COLUMNS.join(';'), ...records.map((record) => [record.id, record.title, record.direction, record.nature,
    brlInputFromMinor(record.amountMinor), record.occurredOn ?? '', record.expectedOn ?? '', record.settledOn ?? record.plannedSettlementOn ?? '',
    record.occurredTime ?? '', record.settledTime ?? '', record.accountId ?? '', record.categoryId ?? '', record.projectId ?? '', record.cardId ?? '', record.currency,
    record.flowKind ?? 'external', record.operationId ?? ''].map(safeCell).join(';'))].join('\r\n');
}

export function previewMovementsCsv(text: string, book: FinanceBook, today?: CivilDate): CsvPreview {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header || header.join(';') !== COLUMNS.join(';')) throw new Error('Cabeçalho CSV incompatível. Use o modelo exportado pelo aplicativo.');
  const seen = new Set<string>();
  const existingIds = new Set([...bookMovements(book, `${book.openingMonth}-01`, false).map((entry) => entry.id), ...book.operations.map((entry) => entry.id)]);
  const duplicateIds: string[] = []; const warnings = ['CSV contém movimentos, não o livro completo. Use backup cifrado para preservar operações, vínculos e histórico.'];
  const records = rows.map((cells, index): Movement => {
    if (cells.length !== COLUMNS.length) throw new Error(`Linha ${index + 2} com quantidade de colunas inválida.`);
    const values = Object.fromEntries(COLUMNS.map((column, position) => [column, importedText(cells[position])])) as Record<typeof COLUMNS[number], string>;
    if (values.natureza_fluxo !== 'external' || values.operacao_origem) throw new Error(`Linha ${index + 2}: registro derivado de operação composta. Use backup cifrado para preservar os vínculos.`);
    const account = book.accounts.find((entry) => entry.id === values.conta_id && entry.kind === 'cash');
    if (!account) throw new Error(`Linha ${index + 2}: conta de caixa inexistente.`);
    const amountMinor = parseBrlToMinor(values.valor_brl);
    if (amountMinor === null) throw new Error(`Linha ${index + 2}: valor inválido.`);
    const realized = values.estado === 'realized';
    const record: Movement = { id: values.id, title: values.descricao, currency: values.moeda as 'BRL', direction: values.tipo as Movement['direction'],
      moneyType: account.moneyType, amountMinor, nature: values.estado as Movement['nature'], occurredOn: values.data_fato as Movement['occurredOn'] || null,
      expectedOn: values.data_prevista_evento as Movement['expectedOn'] || null,
      settledOn: realized ? values.data_caixa as Movement['settledOn'] : null,
      plannedSettlementOn: realized ? null : values.data_caixa as Movement['plannedSettlementOn'], accountId: account.id,
      categoryId: values.categoria_id || null, projectId: values.projeto_id || null, cardId: values.cartao_id || null,
      occurredTime: values.hora_fato || null, settledTime: values.hora_caixa || null };
    validateMovement(record);
    if (today && ((record.nature === 'realized' && record.settledOn! > today) || (record.occurredOn && record.occurredOn > today))) throw new Error(`Linha ${index + 2}: evento futuro deve permanecer previsto.`);
    for (const [value, records, label] of [[record.categoryId, book.categories, 'categoria'], [record.projectId, book.projects, 'projeto'], [record.cardId, book.cards, 'cartão']] as const) {
      if (value && !records.some((entry) => entry.id === value)) throw new Error(`Linha ${index + 2}: ${label} inexistente.`);
    }
    if (seen.has(record.id)) throw new Error(`Linha ${index + 2}: identificador repetido dentro do arquivo.`);
    seen.add(record.id);
    if (existingIds.has(record.id) || (record.id.startsWith('recurrence:') && book.recurrenceRules.some((rule) => record.id.startsWith(`recurrence:${rule.id}:`)))) duplicateIds.push(record.id);
    if (/\bINGL[EÊ]S\s+\d+\s*\/\s*\d+/i.test(record.title)) warnings.push(`Revisar indicação de parcela na linha ${index + 2}; o texto original será conservado.`);
    return record;
  });
  return { records, duplicateIds, warnings };
}
