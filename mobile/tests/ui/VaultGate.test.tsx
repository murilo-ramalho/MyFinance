import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import AppEntry from '../../AppEntry';
import { FinanceStore } from '../../src/application/financeStore';
import { createDemoBook } from '../../src/demo/demoData';

const mockHasVault = jest.fn();
const mockUnlock = jest.fn();
const mockPreventCapture = jest.fn();
jest.mock('../../src/platform/vault', () => ({ hasVault: (...args: unknown[]) => mockHasVault(...args), unlockVault: (...args: unknown[]) => mockUnlock(...args) }));
jest.mock('expo-screen-capture', () => ({ preventScreenCaptureAsync: (...args: unknown[]) => mockPreventCapture(...args) }));
jest.mock('../../src/platform/deviceDate', () => ({ deviceToday: () => '2026-10-25' }));

// These tests cover UI lifecycle only. Native key protection is a separate device proof.
describe('protected-session host', () => {
  let onState: ((state: AppStateStatus) => void) | undefined;
  beforeEach(() => {
    mockHasVault.mockReset().mockResolvedValue(true); mockUnlock.mockReset(); mockPreventCapture.mockReset().mockResolvedValue(undefined);
    AppState.currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { onState = listener; return { remove: jest.fn() }; });
  });
  afterEach(() => { jest.restoreAllMocks(); });
  async function press(label: string) { await fireEvent.press(screen.getByLabelText(label)); }

  test('a rejected unlock never exposes the financial UI or silently switches to demo', async () => {
    mockUnlock.mockRejectedValue(new Error('Desbloqueio recusado pelo provedor'));
    await render(<AppEntry />); await press('Consultar perfil local'); await press('Desbloquear com senha');
    await fireEvent.press(screen.getByTestId('record-editor-save'));
    expect(screen.getByRole('alert').props.children).toBe('Desbloqueio recusado pelo provedor');
    expect(screen.queryByTestId('closing-balance-2026-10')).toBeNull();
    expect(screen.queryByText('TESTE · dados fictícios, só na memória')).toBeNull();
    expect(mockPreventCapture).not.toHaveBeenCalled();
  });

  test('demo is a separate explicit choice and does not request or read a protected session', async () => {
    await render(<AppEntry />); await press('Usar demonstração em memória');
    expect(screen.getByText('TESTE · dados fictícios, só na memória')).toBeTruthy();
    expect(mockUnlock).not.toHaveBeenCalled();
    expect(mockHasVault).not.toHaveBeenCalled();
  });

  test('protected content appears after provider authorization and is unmounted when backgrounded', async () => {
    const lock = jest.fn();
    mockUnlock.mockResolvedValue({ username: 'Perfil fictício', store: new FinanceStore(createDemoBook('2026-10', '2026-10-25')), lock });
    await render(<AppEntry />); await press('Consultar perfil local'); await press('Desbloquear com senha');
    await fireEvent.press(screen.getByTestId('record-editor-save'));
    expect(mockPreventCapture).toHaveBeenCalledWith('myfinance-local');
    expect(screen.getByTestId('closing-balance-2026-10')).toBeTruthy();
    await act(() => { onState?.('background'); });
    expect(lock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('closing-balance-2026-10')).toBeNull();
    expect(screen.getByLabelText('Desbloquear com senha')).toBeTruthy();
  });
});
