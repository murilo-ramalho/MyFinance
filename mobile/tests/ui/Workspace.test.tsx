import { fireEvent, render, screen, within } from '@testing-library/react-native';
import App from '../../App';
import { FinanceStore } from '../../src/application/financeStore';
import { createDemoBook } from '../../src/demo/demoData';
import { formatBrl } from '../../src/domain/money';

jest.mock('../../src/platform/deviceDate', () => ({ deviceToday: () => '2026-10-25' }));

async function tap(id: string) { await fireEvent.press(screen.getByTestId(id)); }
async function action(label: string) { await fireEvent.press(screen.getByLabelText(label)); }
async function enter(label: string, value: string) { await fireEvent.changeText(screen.getByLabelText(label), value); }
async function save() { await tap('record-editor-save'); }

describe('manual financial record journeys', () => {
  beforeEach(async () => { await render(<App />); });

  test('an undated acquisition preserves balances and converts into a single linked commitment', async () => {
    await tap('tab-workspace'); await tap('workspace-plans'); await tap('workspace-new-plan');
    await enter('Compra desejada', 'Peça em promoção'); await enter('Preço estimado, opcional', '200,00'); await save();
    await tap('tab-home');
    expect(screen.getByTestId('closing-balance-2026-10').props.children).toBe(formatBrl(474850));
    await tap('tab-workspace'); await tap('workspace-plans'); await action('Converter Peça em promoção em registro');
    await enter('Valor total em reais', '180,00'); await save();
    expect(screen.getByTestId('operation-details')).toBeTruthy();
    await tap('operation-details-close'); await tap('tab-home');
    expect(screen.getByTestId('closing-balance-2026-10').props.children).toBe(formatBrl(456850));
    await tap('tab-workspace'); await tap('workspace-plans');
    expect(screen.getByText('Convertida em registro')).toBeTruthy();
    expect(screen.queryByLabelText('Converter Peça em promoção em registro')).toBeNull();
  });

  test('partial installment payment changes settled cash once and retains the unpaid remainder', async () => {
    await tap('tab-workspace'); await tap('workspace-new-operation');
    await enter('Descrição do registro', 'Compra parcelada'); await enter('Valor total em reais', '1200,00');
    await enter('Número de parcelas', '12'); await save();
    await action('Registrar pagamento da parcela 1'); await enter('Valor efetivo', '40,00'); await save();
    const details = within(screen.getByTestId('operation-details'));
    expect(details.getByText(['Liquidado ', formatBrl(4000), ' · aberto ', formatBrl(6000)].join(''))).toBeTruthy();
    await tap('operation-details-close'); await tap('tab-home');
    expect(screen.getByTestId('closing-balance-2026-10').props.children).toBe(formatBrl(464850));
    expect(screen.getByTestId('closing-balance-2026-11').props.children).toBe(formatBrl(633700));
    await tap('tab-views'); await tap('view-money');
    expect(screen.getByText(formatBrl(529600))).toBeTruthy();
  });

  test('promoting a paid record preserves its effect and a pending refund does not credit settled cash', async () => {
    await tap('tab-movements'); await tap('movement-row-demo-market');
    await fireEvent(screen.getByTestId('movement-form-modal'), 'show'); await tap('movement-actions');
    await action('Registrar reembolso ou devolução'); await enter('Valor do reembolso', '60,00'); await save();
    await tap('operation-details-close'); await tap('tab-views'); await tap('view-money');
    expect(screen.getByText(formatBrl(533600))).toBeTruthy();
    await tap('tab-workspace'); await action('Abrir Mercado');
    await action(`Confirmar recebimento de ${formatBrl(6000)}`); await save();
    await tap('operation-details-close'); await tap('tab-views'); await tap('view-money');
    expect(screen.getByText(formatBrl(539600))).toBeTruthy();
  });

  test('manual production cost affects the project result and never creates a new payment', async () => {
    await tap('tab-workspace'); await tap('workspace-production'); await tap('workspace-production-cost');
    await enter('Descrição do custo', 'Custo tido na peça'); await action('Projeto: Impressora 3D');
    await enter('Custo total tido', '84,87'); await save();
    expect(screen.getByText(`Custos informados ${formatBrl(8487)}`)).toBeTruthy();
    await action('Editar custo Custo tido na peça');
    expect(screen.getByLabelText('Custo total tido').props.value).toBe('84,87');
    expect(screen.getByLabelText('Data do custo').props.value).toBe('25/10/2026');
    await enter('Custo total tido', '90,32'); await save();
    expect(screen.getByText(`Custos informados ${formatBrl(9032)}`)).toBeTruthy();
    await tap('tab-home');
    expect(screen.getByTestId('closing-balance-2026-10').props.children).toBe(formatBrl(474850));
    expect(screen.getByTestId('safe-spend-amount').props.children).toBe(formatBrl(244850));
  });

  test('internal transfers conserve the home balance while changing the recorded locations', async () => {
    await tap('tab-workspace'); await tap('workspace-accounts'); await action('Registrar transferência');
    await action('Conta de origem: Conta digital de teste'); await action('Conta de destino: Carteira de teste');
    await enter('Valor da transferência', '300,00'); await save();
    await tap('tab-home');
    expect(screen.getByTestId('closing-balance-2026-10').props.children).toBe(formatBrl(474850));
    await tap('tab-views'); await tap('view-money');
    expect(screen.getByText(formatBrl(503600))).toBeTruthy();
    expect(screen.getByText(formatBrl(36250))).toBeTruthy();
  });

  test('monthly recurrence appears in projections and skipping one date preserves the other cycles', async () => {
    await tap('tab-workspace'); await tap('workspace-series'); await action('Nova recorrência');
    await enter('Nome da série', 'Compra mensal opcional'); await enter('Valor por ocorrência', '100,00');
    await enter('Data inicial', '02/11/2026'); await enter('Data final, opcional', '31/01/2027'); await save();
    await action('Cancelar a partir de 02/12/2026'); await save();
    await tap('tab-home');
    expect(screen.getByTestId('closing-balance-2026-11').props.children).toBe(formatBrl(643700));
    await tap('tab-workspace'); await tap('workspace-series');
    expect(screen.getByLabelText('Abrir ocorrência 02/11/2026')).toBeTruthy();
    expect(screen.queryByLabelText('Abrir ocorrência 02/12/2026')).toBeNull();
  });

  test('a chosen 30-day horizon works without creating a future income', async () => {
    await tap('tab-movements'); await tap('show-next-month-button'); await tap('movement-row-demo-next-salary');
    await fireEvent(screen.getByTestId('movement-form-modal'), 'show'); await tap('movement-option-despesa'); await tap('movement-save-button');
    await tap('tab-home'); expect(screen.getByTestId('safe-spend-unavailable')).toBeTruthy();
    await tap('tab-workspace'); await tap('workspace-accounts'); await action('Configurar horizonte e fuso');
    await action('Horizonte do disponível: Próximos 30 dias'); await save(); await tap('tab-home');
    expect(screen.getByTestId('safe-spend-amount')).toBeTruthy();
    expect(screen.getByText('Até 24/11/2026')).toBeTruthy();
  });

  test('observed fact and payment times remain distinct and unknown times are not replaced by midnight', async () => {
    await tap('tab-movements'); await tap('add-movement-button');
    await fireEvent(screen.getByTestId('movement-form-modal'), 'show');
    expect(screen.getByLabelText('Hora do fato, opcional').props.value).toBe('');
    await enter('Descrição', 'Horários conhecidos'); await enter('Valor em reais', '10,00');
    await enter('Hora do fato, opcional', '14:35'); await enter('Hora do pagamento, opcional', '15:10'); await tap('movement-save-button');
    expect(screen.getByText('Realizado · 25/10/2026 14:35')).toBeTruthy();
    expect(screen.getByText('Caixa efetivo: 25/10/2026 15:10')).toBeTruthy();
    await tap('movement-row-test-1'); await fireEvent(screen.getByTestId('movement-form-modal'), 'show');
    expect(screen.getByLabelText('Hora do fato, opcional').props.value).toBe('14:35');
    expect(screen.getByLabelText('Hora do pagamento, opcional').props.value).toBe('15:10');
  });
});

test('a persistence failure keeps the editor open and never publishes a partially changed book', async () => {
  const seed = createDemoBook('2026-10', '2026-10-25');
  const store = new FinanceStore(seed, () => { throw new Error('Falha de gravação simulada'); });
  await render(<App store={store} />);
  await tap('tab-workspace'); await tap('workspace-new-operation');
  await enter('Descrição do registro', 'Não deve ser gravado'); await enter('Valor total em reais', '10,00'); await save();
  expect(screen.getByRole('alert').props.children).toBe('Falha de gravação simulada');
  expect(store.snapshot()).toEqual(seed);
  await tap('record-editor-close'); await tap('tab-home');
  expect(screen.getByTestId('closing-balance-2026-10').props.children).toBe(formatBrl(474850));
});
