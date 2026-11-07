import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import AppEntry from '../../AppEntry';
import { FinanceStore } from '../../src/application/financeStore';
import { createDemoBook } from '../../src/demo/demoData';
import { emptyBook } from '../../src/domain/book';

const mockHasVault = jest.fn();
const mockUnlock = jest.fn();
const mockCreateVault = jest.fn();
const mockPreventCapture = jest.fn();
jest.mock('../../src/platform/vault', () => ({ hasVault: (...args: unknown[]) => mockHasVault(...args), unlockVault: (...args: unknown[]) => mockUnlock(...args), createVault: (...args: unknown[]) => mockCreateVault(...args) }));
jest.mock('expo-screen-capture', () => ({ preventScreenCaptureAsync: (...args: unknown[]) => mockPreventCapture(...args) }));
jest.mock('../../src/platform/deviceDate', () => ({ deviceToday: () => '2026-10-25' }));

// These tests cover UI lifecycle only. Native key protection is a separate device proof.
describe('protected-session host', () => {
  let onState: ((state: AppStateStatus) => void) | undefined;
  beforeEach(() => {
    mockHasVault.mockReset().mockResolvedValue(true); mockUnlock.mockReset(); mockCreateVault.mockReset(); mockPreventCapture.mockReset().mockResolvedValue(undefined);
    AppState.currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { onState = listener; return { remove: jest.fn() }; });
  });
  afterEach(() => { jest.restoreAllMocks(); });
  async function press(label: string) { await fireEvent.press(screen.getByLabelText(label)); }
  async function enter(label: string, value: string) { await fireEvent.changeText(screen.getByLabelText(label), value); }
  async function enterNewProfile(biometrics: 'yes' | 'no' = 'yes') {
    await waitFor(() => expect(screen.getByLabelText('Criar perfil local')).toBeTruthy());
    await press('Criar perfil local');
    expect(screen.getByLabelText('Nome da conta principal').props.value).toBe('');
    expect(screen.getByLabelText('Saldo de abertura').props.value).toBe('');
    await enter('Seu nome', 'Ana');
    await enter('Nova senha local', 'Senha forte 123!');
    await enter('Confirmar nova senha local', 'Senha forte 123!');
    await enter('Nome da conta principal', 'Conta corrente');
    await press('Tipo da conta principal: Digital / bancária');
    await enter('Saldo de abertura', '2450,00');
    if (biometrics === 'no') await press('Biometria do Android (digital se disponível): Agora não');
    await fireEvent.press(screen.getByTestId('record-editor-save'));
  }

  test('a rejected unlock never exposes the financial UI or silently switches to demo', async () => {
    mockUnlock.mockRejectedValue(new Error('Desbloqueio recusado pelo provedor'));
    await render(<AppEntry />); await waitFor(() => expect(screen.getByLabelText('Desbloquear com senha')).toBeTruthy()); await press('Desbloquear com senha');
    await fireEvent.press(screen.getByTestId('record-editor-save'));
    expect(screen.getByRole('alert').props.children).toBe('Desbloqueio recusado pelo provedor');
    expect(screen.queryByTestId('closing-balance-2026-10')).toBeNull();
    expect(screen.queryByText('DEMONSTRAÇÃO · dados temporários')).toBeNull();
    expect(mockPreventCapture).not.toHaveBeenCalled();
  });

  test('startup offers only protected local records and no mock-data route', async () => {
    await render(<AppEntry />);
    await waitFor(() => expect(screen.getByLabelText('Desbloquear com senha')).toBeTruthy());
    expect(screen.queryByLabelText('Abrir demonstração')).toBeNull();
    expect(screen.queryByText('DEMONSTRAÇÃO · dados temporários')).toBeNull();
    expect(mockHasVault).toHaveBeenCalled();
  });

  test('new profiles save the user account and offer Android biometric unlock', async () => {
    mockHasVault.mockResolvedValue(false);
    const localStore = new FinanceStore(emptyBook('2026-10'));
    const enableBiometrics = jest.fn().mockResolvedValue(undefined);
    mockCreateVault.mockResolvedValue({ username: 'Ana', store: localStore, lock: jest.fn(), enableBiometrics });
    await render(<AppEntry />);
    await enterNewProfile();

    const created = mockCreateVault.mock.calls[0][2];
    expect(created.movements).toHaveLength(0);
    expect(created.categories).toHaveLength(0);
    expect(created.accounts).toEqual([{
      id: 'primary-cash-account', name: 'Conta corrente', currency: 'BRL', kind: 'cash', moneyType: 'digital',
      openingOn: '2026-10-01', openingMinor: 245000, eligible: true,
    }]);
    expect(enableBiometrics).toHaveBeenCalledTimes(1);
  });

  test('a cancelled or unavailable biometric keeps the new profile usable with its password', async () => {
    mockHasVault.mockResolvedValue(false);
    const localStore = new FinanceStore(emptyBook('2026-10'));
    const enableBiometrics = jest.fn().mockRejectedValue(new Error('Biometric prompt cancelled'));
    mockCreateVault.mockResolvedValue({ username: 'Ana', store: localStore, lock: jest.fn(), enableBiometrics });
    await render(<AppEntry />);
    await enterNewProfile();

    expect(enableBiometrics).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').props.children).toContain('a senha local continua funcionando');
    expect(screen.getByText('Seu livro está vazio')).toBeTruthy();
  });

  test('the user can skip biometric setup and keep password access', async () => {
    mockHasVault.mockResolvedValue(false);
    const enableBiometrics = jest.fn();
    mockCreateVault.mockResolvedValue({ username: 'Ana', store: new FinanceStore(emptyBook('2026-10')), lock: jest.fn(), enableBiometrics });
    await render(<AppEntry />);
    await enterNewProfile('no');

    expect(enableBiometrics).not.toHaveBeenCalled();
    expect(screen.getByText('Seu livro está vazio')).toBeTruthy();
  });

  test('protected content appears after provider authorization and is unmounted when backgrounded', async () => {
    const lock = jest.fn();
    mockUnlock.mockResolvedValue({ username: 'Perfil fictício', store: new FinanceStore(createDemoBook('2026-10', '2026-10-25')), lock });
    await render(<AppEntry />); await waitFor(() => expect(screen.getByLabelText('Desbloquear com senha')).toBeTruthy()); await press('Desbloquear com senha');
    await fireEvent.press(screen.getByTestId('record-editor-save'));
    expect(mockPreventCapture).toHaveBeenCalledWith('myfinance-local');
    expect(screen.getByTestId('closing-balance-2026-10')).toBeTruthy();
    expect(screen.queryByText('DEMONSTRAÇÃO · dados temporários')).toBeNull();
    expect(screen.queryByLabelText('Abrir demonstração')).toBeNull();
    await act(() => { onState?.('background'); });
    expect(lock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('closing-balance-2026-10')).toBeNull();
    expect(screen.getByLabelText('Desbloquear com senha')).toBeTruthy();
  });
});
