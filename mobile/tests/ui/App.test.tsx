import { fireEvent, render, screen } from '@testing-library/react-native';

import App from '../../App';
import { formatBrl } from '../../src/domain/money';

jest.mock('../../src/platform/deviceDate', () => ({
  deviceToday: () => '2026-10-25',
}));

describe('app movement journeys', () => {
  beforeEach(async () => {
    await render(<App />);
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
  }

  async function openMovement(id: string): Promise<void> {
    await tap(id);
    await fireEvent(screen.getByTestId('movement-form-modal'), 'show');
  }

  test('shows the demo warning and current plus following month on home', () => {
    expect(screen.getByText('myFinance')).toBeTruthy();
    expect(screen.getByText('TESTE · dados fictícios, só na memória')).toBeTruthy();
    expect(screen.getByText('Mês atual · inclui previsões')).toBeTruthy();
    expect(screen.getByText('Próximo mês · projeção')).toBeTruthy();
    expect(screen.getByTestId('closing-balance-2026-10').props.children).toBe(formatBrl(474850));
    expect(screen.getByTestId('closing-balance-2026-11').props.children).toBe(formatBrl(656950));
  });

  test('opens the current month movement list by default and switches to next month', async () => {
    await tap('tab-movements');

    expect(screen.getByTestId('movement-closing-balance-2026-10')).toBeTruthy();
    expect(screen.getByTestId('movement-row-demo-salary')).toBeTruthy();
    expect(screen.queryByTestId('movement-row-demo-next-salary')).toBeNull();

    await tap('show-next-month-button');

    expect(screen.getByTestId('movement-closing-balance-2026-11')).toBeTruthy();
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

    expect(screen.getByTestId('movement-row-test-1')).toBeTruthy();
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
    expect(screen.queryByTestId('movement-row-test-1')).toBeNull();

    await enter('Descrição', 'Data inválida');
    await enter('Valor em reais', '10,999');
    await tap('movement-save-button');
    expect(screen.getByRole('alert').props.children).toBe('Digite um valor válido, por exemplo 25,90.');

    await enter('Valor em reais', '10,00');
    await enter('Data do fato', '31/02/2026');
    await tap('movement-save-button');

    expect(screen.getByRole('alert').props.children).toBe('Confira as datas no formato DD/MM/AAAA.');
    expect(screen.queryByTestId('movement-row-test-1')).toBeNull();
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
});
