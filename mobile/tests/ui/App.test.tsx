import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import App from '../../App';
import { FinanceStore } from '../../src/application/financeStore';
import { createDemoBook } from '../../src/demo/demoData';
import { formatBrl } from '../../src/domain/money';

jest.mock('../../src/platform/deviceDate', () => ({
  deviceToday: () => '2026-10-25',
}));

describe('app movement journeys', () => {
  beforeEach(async () => {
    const store = new FinanceStore(createDemoBook('2026-10', '2026-10-25'));
    await render(<App store={store} />);
  });

  async function tap(testID: string): Promise<void> {
    await fireEvent.press(screen.getByTestId(testID));
  }

  async function enter(label: string, value: string): Promise<void> {
    await fireEvent.changeText(screen.getByLabelText(label), value);
  }

  async function openNewMovementForm(): Promise<void> {
    await tap('add-movement-button');
    await fireEvent(screen.getByTestId('movement-form-modal'), 'show');
    await tap('movement-details-toggle');
  }

  async function openMovement(id: string): Promise<void> {
    await tap(id);
    await fireEvent(screen.getByTestId('movement-form-modal'), 'show');
  }

  test('shows the current and following month without demo content', () => {
    expect(screen.getByText('myFinance')).toBeTruthy();
    expect(screen.queryByText('DEMONSTRAÇÃO · dados temporários')).toBeNull();
    expect(screen.getByText('Resumo')).toBeTruthy();
    const currentMonthCard = within(screen.getByTestId('month-summary-2026-10'));
    const nextMonthCard = within(screen.getByTestId('month-summary-2026-11'));
    expect(currentMonthCard.getByText('Saldo mês anterior')).toBeTruthy();
    expect(currentMonthCard.queryByText('Menor saldo diário')).toBeNull();
    expect(screen.getByText('Próximo mês')).toBeTruthy();
    expect(screen.getByText('Novembro de 2026')).toBeTruthy();
    expect(nextMonthCard.queryByText('Menor saldo diário')).toBeNull();
    expect(nextMonthCard.getByText('Saldo próximo mês')).toBeTruthy();
    for (const month of ['2026-10', '2026-11']) {
      for (const [flow, borderColor] of [['inflow', '#23834D'], ['outflow', '#D82C39']]) {
        for (const nature of ['realized', 'committed', 'forecast']) {
          expect(screen.getByTestId(`${nature}-${flow}-${month}`)).toBeTruthy();
        }
        const flowCard = screen.getByTestId(`flow-card-${flow}-${month}`);
        expect(StyleSheet.flatten(flowCard.props.style).borderColor).toBe(borderColor);
        expect(StyleSheet.flatten(flowCard.props.style).backgroundColor).toBe('#FFFFFF');
        expect(StyleSheet.flatten(screen.getByTestId(`flow-total-${flow}-${month}`).props.style).color).toBe('#1B2335');
      }
    }
    expect(StyleSheet.flatten(screen.getByTestId('month-summary-2026-10').props.style).backgroundColor).toBe('#FFFFFF');
    expect(StyleSheet.flatten(screen.getByTestId('month-summary-2026-11').props.style).backgroundColor).toBe('#FFFFFF');
    expect(screen.getByTestId('closing-balance-2026-10').props.children).toBe(formatBrl(474850));
    expect(screen.getByTestId('closing-balance-2026-11').props.children).toBe(formatBrl(653700));
    expect(screen.getByTestId('annual-income-projection').props.children).toBe(formatBrl(840000));
    expect(screen.getByTestId('realized-inflow-2026-10').props.children).toBe(formatBrl(420000));
    expect(screen.getByTestId('realized-inflow-2026-10').props.accessibilityLabel).toBe(`Realizadas ${formatBrl(420000)}`);
    expect(screen.getByTestId('committed-outflow-2026-10').props.children).toBe(formatBrl(23000));
    expect(screen.getByTestId('committed-outflow-2026-10').props.accessibilityLabel).toBe(`Compromissos ${formatBrl(23000)}`);
    expect(screen.getByTestId('forecast-outflow-2026-10').props.children).toBe(formatBrl(42000));
    expect(screen.getByTestId('forecast-outflow-2026-10').props.accessibilityLabel).toBe(`Previsões ${formatBrl(42000)}`);
  });

  test('starts manual entry with the spreadsheet fields visible and summarizes optional details', async () => {
    await tap('tab-movements');
    await tap('add-movement-button');
    await fireEvent(screen.getByTestId('movement-form-modal'), 'show');

    expect(within(screen.getByTestId('movement-form-modal')).getByText('Tipo de movimento')).toBeTruthy();
    expect(screen.getByLabelText('Data do fato')).toBeTruthy();
    expect(screen.getByLabelText('Valor em reais')).toBeTruthy();
    expect(screen.getByLabelText('Descrição')).toBeTruthy();
    expect(screen.getByText('Natureza do registro')).toBeTruthy();
    expect(screen.getByLabelText('Data do pagamento/recebimento')).toBeTruthy();
    expect(screen.getByText(/^Digital · Conta:/)).toBeTruthy();
    expect(screen.queryByText('Projeto (opcional)')).toBeNull();

    await tap('movement-details-toggle');
    expect(screen.getByText('Projeto')).toBeTruthy();
    expect(screen.queryByText(/^Digital · Conta:/)).toBeNull();
  });

  test('shows a conservative safe-spend estimate and lets the user compare the expected scenario', async () => {
    expect(screen.getByTestId('safe-spend-amount').props.children).toBe(formatBrl(244850));
    expect(screen.getByText('Até 05/11/2026')).toBeTruthy();

    await tap('safe-scenario-expected');
    expect(screen.getByTestId('safe-spend-amount').props.children).toBe(formatBrl(404850));

    await tap('safe-scenario-conservative');
    expect(screen.getByTestId('safe-spend-amount').props.children).toBe(formatBrl(244850));
  });

  test('shows card, project, and money type views without mixing investments into cash', async () => {
    await tap('tab-views');

    expect(screen.getByTestId('movement-row-demo-card-purchase')).toBeTruthy();
    expect(screen.getByText('Caixa previsto: 10/11/2026')).toBeTruthy();

    await tap('view-projects');
    expect(screen.getByTestId('movement-row-demo-market')).toBeTruthy();
    expect(screen.getByTestId('movement-row-demo-card-purchase')).toBeTruthy();

    await tap('view-money');
    expect(screen.getByTestId('money-type-digital')).toBeTruthy();
    expect(screen.getByTestId('money-type-physical')).toBeTruthy();
    expect(screen.getByText(formatBrl(533600))).toBeTruthy();
    expect(screen.getByText(formatBrl(6250))).toBeTruthy();
    expect(screen.getByTestId('money-type-investments')).toBeTruthy();
    expect(screen.getByText(formatBrl(125000))).toBeTruthy();

    await tap('tab-home');
    expect(screen.getByTestId('safe-spend-amount').props.children).toBe(formatBrl(244850));
  });

  test('saves a digital/physical source and project label on a new movement', async () => {
    await tap('tab-movements');
    await openNewMovementForm();
    await enter('Descrição', 'Material físico de teste');
    await enter('Valor em reais', '10,00');
    await tap('movement-money-physical');
    await tap('movement-project-printer-3d');
    await tap('movement-save-button');

    expect(screen.getByTestId('movement-row-movement-1')).toBeTruthy();
    expect(screen.getByText('Físico · Projeto: Impressora 3D')).toBeTruthy();
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(473850));
  });

  test('creates a named project and classifies income and expense movements under it', async () => {
    await tap('tab-views');
    await tap('view-projects');
    await tap('create-project-button');
    await fireEvent(screen.getByTestId('project-form-modal'), 'show');

    await tap('save-project-button');
    expect(screen.getByTestId('project-form-error').props.children).toBe('Informe o nome do projeto.');
    await enter('Nome do projeto', 'Freela');
    await tap('save-project-button');
    expect(screen.getByTestId('project-form-error').props.children).toBe('Informe uma descrição para o projeto.');
    await enter('Descrição do projeto', 'Serviços de design');
    await tap('save-project-button');

    expect(screen.getByTestId('project-card-project-1')).toBeTruthy();
    expect(screen.getByTestId('project-description-project-1').props.children).toBe('Serviços de design');

    await tap('create-project-button');
    await fireEvent(screen.getByTestId('project-form-modal'), 'show');
    await enter('Nome do projeto', 'freela');
    await enter('Descrição do projeto', 'Outro projeto');
    await tap('save-project-button');
    expect(screen.getByTestId('project-form-error').props.children).toBe('Já existe um projeto com esse nome.');
    await tap('close-project-form-button');

    await tap('tab-movements');
    await openNewMovementForm();
    await enter('Descrição', 'Recebimento do freela');
    await enter('Valor em reais', '500,00');
    await tap('movement-option-entrada');
    await tap('movement-project-project-1');
    await tap('movement-save-button');
    const incomeRow = screen.getByTestId('movement-row-movement-1');
    expect(within(incomeRow).getByText('Digital · Projeto: Freela')).toBeTruthy();

    await openNewMovementForm();
    await enter('Descrição', 'Material do freela');
    await enter('Valor em reais', '30,00');
    await tap('movement-project-project-1');
    await tap('movement-save-button');
    const expenseRow = screen.getByTestId('movement-row-movement-2');
    expect(within(expenseRow).getByText('Débito · Projeto: Freela')).toBeTruthy();
    await tap('tab-views');
    await tap('view-projects');
    expect(screen.getByTestId('project-flow-net-realized-project-1').props.children).toBe(formatBrl(47000));
    expect(screen.getByTestId('project-flow-net-projected-project-1').props.children).toBe(formatBrl(47000));
  });

  test('keeps a card purchase date separate from its projected cash date', async () => {
    await tap('tab-movements');
    await openNewMovementForm();
    await enter('Descrição', 'Compra de teste no cartão');
    await enter('Valor em reais', '20,00');
    await tap('movement-card-demo-card');

    expect(within(screen.getByTestId('movement-card-demo-card')).getByText('Crédito · Cartão de demonstração')).toBeTruthy();
    expect(screen.getByLabelText('Data prevista da compra')).toBeTruthy();
    expect(screen.getByLabelText('Data prevista para pagar a fatura')).toBeTruthy();
    await enter('Data prevista da compra', '30/10/2026');
    await enter('Data prevista para pagar a fatura', '15/11/2026');
    await tap('movement-save-button');

    await tap('tab-views');
    expect(screen.getByTestId('movement-row-movement-1')).toBeTruthy();
    expect(screen.getByText('Caixa previsto: 15/11/2026')).toBeTruthy();
    expect(within(screen.getByTestId('movement-row-movement-1')).getByText('Crédito · Cartão de demonstração')).toBeTruthy();
  });

  test('distinguishes cardless digital debit from credit card and physical cash', async () => {
    await tap('tab-movements');
    await openNewMovementForm();

    expect(within(screen.getByTestId('movement-card-none')).getByText('Débito')).toBeTruthy();
    await tap('movement-money-physical');
    expect(within(screen.getByTestId('movement-card-none')).getByText('Dinheiro físico')).toBeTruthy();
    expect(screen.getByTestId('movement-card-demo-card').props.accessibilityState.selected).toBe(false);

    await tap('movement-card-demo-card');
    expect(screen.getByTestId('movement-money-digital').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('movement-card-none').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('movement-card-demo-card').props.accessibilityState.selected).toBe(true);
  });

  test('uses the money type as the receipt type for income', async () => {
    await tap('tab-movements');
    await openNewMovementForm();
    await tap('movement-option-entrada');

    const form = within(screen.getByTestId('movement-form-modal'));
    expect(form.getByTestId('movement-money-digital')).toBeTruthy();
    expect(form.queryByText('Meio de recebimento')).toBeNull();
    expect(form.queryByText('Forma de pagamento')).toBeNull();
    expect(form.queryByTestId('movement-card-none')).toBeNull();
  });

  test('loads and preserves project tags when editing an existing movement', async () => {
    await tap('tab-views');
    await tap('view-projects');
    await openMovement('movement-row-demo-market');

    expect(screen.getByTestId('movement-project-food').props.accessibilityState.selected).toBe(true);
    await tap('movement-save-button');
    const marketRow = screen.getByTestId('movement-row-demo-market');
    expect(marketRow).toBeTruthy();
    expect(within(marketRow).getByText('Débito · Projeto: Alimentação')).toBeTruthy();
  });

  test('explains a negative safe-spend estimate with text and the first insufficient date', async () => {
    await tap('add-movement-button');
    await fireEvent(screen.getByTestId('movement-form-modal'), 'show');
    await enter('Descrição', 'Despesa de teste alta');
    await enter('Valor em reais', '10000,00');
    await tap('movement-save-button');
    await tap('tab-home');

    expect(screen.getByTestId('safe-spend-amount').props.children).toBe(formatBrl(-755150));
    expect(screen.getByText(/Atenção: a projeção fica abaixo da reserva e da margem em/)).toBeTruthy();
  });

  test('does not invent a safe-spend horizon when there is no future incoming movement', async () => {
    await tap('tab-movements');
    await tap('show-next-month-button');
    await openMovement('movement-row-demo-next-salary');
    await tap('movement-option-despesa');
    await tap('movement-save-button');
    await tap('tab-home');

    expect(screen.getByTestId('safe-spend-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('safe-spend-amount')).toBeNull();
  });

  test('opens the current month movement list by default and switches to next month', async () => {
    await tap('tab-movements');

    expect(screen.getByTestId('movement-closing-balance-2026-10')).toBeTruthy();
    expect(screen.getByTestId('movement-summary-inflow-2026-10')).toBeTruthy();
    expect(screen.getByTestId('movement-row-demo-salary')).toBeTruthy();
    expect(screen.queryByTestId('movement-row-demo-next-salary')).toBeNull();

    await tap('show-next-month-button');

    expect(screen.getByTestId('movement-closing-balance-2026-11')).toBeTruthy();
    expect(screen.getByTestId('movement-summary-outflow-2026-11')).toBeTruthy();
    expect(screen.getByTestId('movement-row-demo-next-salary')).toBeTruthy();
    expect(screen.queryByTestId('movement-row-demo-salary')).toBeNull();
  });

  test('creates a realized movement and updates the projected closing balance once', async () => {
    await tap('tab-movements');
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(474850));

    await openNewMovementForm();
    await enter('Descrição', 'Compra de teste');
    await enter('Valor em reais', '25,90');
    await tap('movement-save-button');

    expect(screen.getByTestId('movement-row-movement-1')).toBeTruthy();
    expect(screen.getByLabelText('Editar Compra de teste, Realizado')).toBeTruthy();
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(472260));
  });

  test('adds an income with a positive effect on the closing balance', async () => {
    await tap('tab-movements');
    await openNewMovementForm();
    await enter('Descrição', 'Entrada E2E');
    await enter('Valor em reais', '125,50');
    await tap('movement-option-entrada');
    await tap('movement-save-button');

    expect(screen.getByLabelText('Editar Entrada E2E, Realizado')).toBeTruthy();
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(487400));
  });

  test('rejects an empty description and invalid dates without adding a movement', async () => {
    await tap('tab-movements');
    await openNewMovementForm();
    await tap('movement-save-button');

    expect(screen.getByRole('alert').props.children).toBe('Informe uma descrição.');
    expect(screen.queryByTestId('movement-row-movement-1')).toBeNull();

    await enter('Descrição', 'Data inválida');
    await enter('Valor em reais', '10,999');
    await tap('movement-save-button');
    expect(screen.getByRole('alert').props.children).toBe('Digite um valor válido, por exemplo 25,90.');

    await enter('Valor em reais', '10,00');
    await enter('Data do fato', '31/02/2026');
    await tap('movement-save-button');

    expect(screen.getByRole('alert').props.children).toBe('Confira as datas no formato DD/MM/AAAA.');
    expect(screen.queryByTestId('movement-row-movement-1')).toBeNull();
  });

  test('loads saved values when editing and uses today only for a new form', async () => {
    await tap('tab-movements');
    await openMovement('movement-row-demo-rent');

    expect(screen.getByDisplayValue('Moradia')).toBeTruthy();
    expect(screen.getByDisplayValue('1600,00')).toBeTruthy();
    expect(screen.getByLabelText('Data do fato').props.value).toBe('05/10/2026');
    expect(screen.getByLabelText('Data do pagamento/recebimento').props.value).toBe('05/10/2026');

    await tap('movement-save-button');
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(474850));

    await openNewMovementForm();
    expect(screen.getByLabelText('Descrição').props.value).toBe('');
    expect(screen.getByLabelText('Valor em reais').props.value).toBe('');
    expect(screen.getByLabelText('Data do fato').props.value).toBe('25/10/2026');
    expect(screen.getByLabelText('Data do pagamento/recebimento').props.value).toBe('25/10/2026');
  });

  test('keeps forecast event and planned cash dates distinct in the saved row', async () => {
    await tap('tab-movements');
    await openNewMovementForm();
    await enter('Descrição', 'Previsão com caixa posterior');
    await enter('Valor em reais', '40,00');
    await tap('movement-option-previsão');

    expect(screen.getByLabelText('Data prevista do evento')).toBeTruthy();
    expect(screen.getByLabelText('Data prevista para o caixa')).toBeTruthy();
    await enter('Data prevista do evento', '25/10/2026');
    await enter('Data prevista para o caixa', '26/10/2026');
    await tap('movement-save-button');

    expect(screen.getByText('Previsão · 25/10/2026')).toBeTruthy();
    expect(screen.getByText('Caixa previsto: 26/10/2026')).toBeTruthy();
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(470850));
  });

  test('filters movements by status, direction, and description, then restores the defaults', async () => {
    await tap('tab-movements');
    await enter('Buscar movimentações', 'Mercado');

    expect(screen.getByTestId('movement-row-demo-market')).toBeTruthy();
    expect(screen.getByTestId('movement-row-demo-groceries')).toBeTruthy();
    expect(screen.queryByTestId('movement-row-demo-salary')).toBeNull();

    await tap('filter-nature-forecast');
    expect(screen.getByTestId('movement-row-demo-groceries')).toBeTruthy();
    expect(screen.queryByTestId('movement-row-demo-market')).toBeNull();

    await tap('filter-direction-income');
    expect(screen.getByText('Nenhum resultado')).toBeTruthy();

    await tap('reset-movement-filters-button');
    expect(screen.getByTestId('movement-row-demo-market')).toBeTruthy();
    expect(screen.getByTestId('movement-row-demo-salary')).toBeTruthy();
  });

  test('changes chronological order while keeping the newest-first default', async () => {
    await tap('tab-movements');

    const rowIds = () => screen.getAllByTestId(/^movement-row-/).map((row) => row.props.testID);
    expect(rowIds()[0]).toBe('movement-row-demo-electricity');

    await tap('movement-sort-button');
    expect(screen.getByText('Antigas ↑')).toBeTruthy();
    expect(rowIds()[0]).toBe('movement-row-demo-rent');
  });

  test('propagates a retroactive expense without inventing a historical opening balance and projects beyond next month', async () => {
    await tap('tab-movements');
    await openNewMovementForm();
    await enter('Descrição', 'Despesa retroativa de teste');
    await enter('Valor em reais', '30,00');
    await enter('Data do fato', '12/09/2026');
    await enter('Data do pagamento/recebimento', '12/09/2026');
    await tap('movement-save-button');

    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(471850));

    await tap('show-previous-month-button');
    expect(screen.getByTestId('selected-month-label').props.children).toBe('Setembro de 2026');
    expect(screen.getByTestId('movement-row-movement-1')).toBeTruthy();
    expect(screen.getByTestId('historical-balance-unavailable')).toBeTruthy();

    await tap('show-current-month-button');
    await openNewMovementForm();
    await enter('Descrição', 'Receita futura de teste');
    await enter('Valor em reais', '80,00');
    await tap('movement-option-entrada');
    await tap('movement-option-previsão');
    await enter('Data prevista do evento', '15/01/2027');
    await enter('Data prevista para o caixa', '15/01/2027');
    await tap('movement-save-button');

    await tap('show-following-month-button');
    await tap('show-following-month-button');
    await tap('show-following-month-button');
    expect(screen.getByTestId('selected-month-label').props.children).toBe('Janeiro de 2027');
    expect(screen.getByTestId('movement-row-movement-2')).toBeTruthy();
    expect(screen.getByTestId('movement-closing-balance-2027-01').props.children).toBe(formatBrl(658700));
  });

  test('rejects future effective payment dates and allows a pending forecast instead', async () => {
    await tap('tab-movements');
    await openNewMovementForm();
    await enter('Descrição', 'Pagamento futuro');
    await enter('Valor em reais', '10,00');
    await enter('Data do pagamento/recebimento', '26/10/2026');
    await tap('movement-save-button');
    expect(screen.getByRole('alert').props.children).toBe('Pagamento futuro deve ficar como compromisso ou previsão.');
    expect(screen.queryByTestId('movement-row-movement-1')).toBeNull();
    await tap('movement-option-previsão');
    await tap('movement-save-button');
    expect(screen.getByLabelText('Editar Pagamento futuro, Previsão')).toBeTruthy();
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(473850));
  });

  test('reconciles an existing forecast without keeping a second projected expense', async () => {
    await tap('tab-movements');
    await openMovement('movement-row-demo-groceries');
    await tap('movement-option-realizado');
    await enter('Valor em reais', '450,00');
    await enter('Data do fato', '25/10/2026');
    await enter('Data do pagamento/recebimento', '25/10/2026');
    await tap('movement-save-button');
    expect(screen.getAllByTestId('movement-row-demo-groceries')).toHaveLength(1);
    expect(screen.getByLabelText('Editar Mercado · previsão, Realizado')).toBeTruthy();
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(471850));
  });

  test('retroactive edits update cash by medium and future projections exactly once', async () => {
    await tap('tab-movements');
    await openMovement('movement-row-demo-rent');
    await enter('Valor em reais', '1700,00');
    await enter('Data do pagamento/recebimento', '30/09/2026');
    await tap('movement-save-button');
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(464850));
    await tap('tab-home');
    expect(screen.getByTestId('closing-balance-2026-11').props.children).toBe(formatBrl(643700));
    expect(screen.getByTestId('safe-spend-amount').props.children).toBe(formatBrl(234850));
    await tap('tab-views');
    await tap('view-money');
    expect(screen.getByText(formatBrl(523600))).toBeTruthy();
  });

  test('preserves an unknown economic event date when editing a dated cash expectation', async () => {
    await tap('tab-movements');
    await openNewMovementForm();
    await enter('Descrição', 'Expectativa de caixa sem fato conhecido');
    await enter('Valor em reais', '10,00');
    await tap('movement-option-previsão');
    await enter('Data prevista do evento', '');
    await tap('movement-save-button');
    await openMovement('movement-row-movement-1');
    expect(screen.getByLabelText('Data prevista do evento').props.value).toBe('');
    expect(screen.getByLabelText('Data prevista para o caixa').props.value).toBe('25/10/2026');
    await tap('movement-save-button');
    expect(screen.getByTestId('movement-closing-balance-2026-10').props.children).toBe(formatBrl(473850));
  });

  test('changing payment state retains the known date of the economic fact', async () => {
    await tap('tab-movements');
    await openMovement('movement-row-demo-rent');
    await tap('movement-option-compromisso');
    await enter('Data prevista para o caixa', '27/10/2026');
    await tap('movement-save-button');
    await openMovement('movement-row-demo-rent');
    expect(screen.getByLabelText('Data do fato').props.value).toBe('05/10/2026');
    expect(screen.getByLabelText('Data prevista para o caixa').props.value).toBe('27/10/2026');
  });
});
