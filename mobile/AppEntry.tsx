import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import App from './App';
import { emptyBook, type FinanceBook } from './src/domain/book';
import { monthOf } from './src/domain/movements';
import { parseBrlToMinor } from './src/domain/money';
import { deviceToday } from './src/platform/deviceDate';
import type { VaultSession } from './src/platform/vaultTypes';
import { RecordEditor, type EditorDefinition } from './src/ui/RecordEditor';
import type { NativeProofResult } from './src/platform/nativeProof';
import { previewMovementsCsv, type CsvPreview } from './src/application/movementCsv';
import { bookTimeZone } from './src/domain/bookSelectors';

function Button({ label, onPress }: { label: string; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={gate.button}><Text style={gate.buttonText}>{label}</Text></Pressable>;
}

/** Demo and encrypted local sessions have different stores; demo never grants access to local data. */
export default function AppEntry() {
  const [demo, setDemo] = useState(Platform.OS === 'web');
  const [session, setSession] = useState<VaultSession | null>(null);
  const current = useRef<VaultSession | null>(null);
  const [existing, setExisting] = useState<boolean | null>(null);
  const [editor, setEditor] = useState<EditorDefinition | null>(null);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState('');
  const [restoreCandidate, setRestoreCandidate] = useState<FinanceBook | null>(null);
  const [proof, setProof] = useState<NativeProofResult[]>([]);
  const [proofBusy, setProofBusy] = useState(false);
  const [csvCandidate, setCsvCandidate] = useState<CsvPreview | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const formCount = useRef(1);
  const lock = () => {
    const active = current.current;
    current.current = null;
    try { active?.lock(); } finally { setSession(null); setSettings(false); setEditor(null); setRestoreCandidate(null); setCsvCandidate(null); }
  };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active' && current.current) lock(); });
    return () => { subscription.remove(); current.current?.lock(); current.current = null; };
  }, []);
  const acceptSession = async (active: VaultSession) => {
    try {
      if (AppState.currentState !== 'active') throw new Error('Volte ao aplicativo para desbloquear.');
      const capture = await import('expo-screen-capture');
      await capture.preventScreenCaptureAsync('myfinance-local');
      if (AppState.currentState !== 'active') throw new Error('Volte ao aplicativo para desbloquear.');
      current.current?.lock(); current.current = active; setSession(active); setDemo(false); setExisting(true); setError('');
    } catch { active.lock(); throw new Error('Não foi possível proteger a tela neste build. A sessão permaneceu bloqueada.'); }
  };
  const openEditor = (definition: Omit<EditorDefinition, 'id'>) => setEditor({ id: `vault-form-${formCount.current++}`, ...definition });
  const probe = async () => {
    setDemo(false); setError('');
    try { setExisting(await (await import('./src/platform/vault')).hasVault()); }
    catch { setError('Este modo exige um build Android próprio com os módulos de segurança. A demonstração continua disponível.'); }
  };
  const unlock = () => openEditor({ title: 'Desbloquear registros locais', fields: [{ key: 'password', label: 'Senha local', secret: true }],
    submit: async (values) => acceptSession(await (await import('./src/platform/vault')).unlockVault(values.password)) });
  const create = (fromBackup = false) => openEditor({ title: fromBackup ? 'Criar perfil a partir de backup' : 'Criar perfil local',
    note: 'Build de validação: use dados fictícios até concluir a revisão e os testes nativos. A senha local deve ter pelo menos 12 caracteres.',
    fields: [{ key: 'username', label: 'Seu nome' }, { key: 'password', label: 'Nova senha local', secret: true }, { key: 'confirm', label: 'Confirmar nova senha local', secret: true },
      ...(fromBackup ? [{ key: 'recovery', label: 'Senha de recuperação do backup', secret: true }] : [
        { key: 'opening', label: `Abertura do controle em 01/${deviceToday().slice(5, 7)}/${deviceToday().slice(0, 4)}`, value: '0,00', hint: 'Base inicial do livro, não uma conciliação automática de extrato. Lançamentos retroativos anteriores ajustam essa base. Aceita negativo.' },
      ])], submit: async (values) => {
      if (values.password !== values.confirm) throw new Error('A confirmação de senha não confere.');
      const platform = await import('./src/platform/vault');
      let book: FinanceBook;
      if (fromBackup) { const candidate = await platform.readBackupFile(values.recovery); if (!candidate) return; book = candidate; }
      else {
        const text = values.opening.trim(); const sign = text.startsWith('-') ? -1 : 1;
        const parsed = /^(?:0|0,0{1,2})$/.test(text) ? 0 : parseBrlToMinor(sign < 0 ? text.slice(1) : text);
        if (parsed === null) throw new Error('Informe um saldo de abertura válido.');
        book = emptyBook(monthOf(deviceToday()));
        book.accounts = [
          { id: 'digital', name: 'Minha conta', currency: 'BRL', kind: 'cash', moneyType: 'digital', openingOn: `${book.openingMonth}-01`, openingMinor: parsed * sign, eligible: true },
          { id: 'physical', name: 'Minha carteira', currency: 'BRL', kind: 'cash', moneyType: 'physical', openingOn: `${book.openingMonth}-01`, openingMinor: 0, eligible: true },
        ];
        book.categories = [{ id: 'food', name: 'Alimentação' }, { id: 'income', name: 'Renda' }];
      }
      await acceptSession(await platform.createVault(values.username, values.password, book));
    } });
  const backup = () => openEditor({ title: 'Backup cifrado portátil', note: 'Use uma senha de recuperação independente da senha local. Ela será necessária em outro aparelho.',
    fields: [{ key: 'password', label: 'Senha de recuperação', secret: true }, { key: 'confirm', label: 'Confirmar senha de recuperação', secret: true }],
    submit: async (values) => {
      if (values.password !== values.confirm) throw new Error('A confirmação de senha não confere.');
      if (!current.current) throw new Error('Desbloqueie os registros novamente.');
      await current.current.exportBackup(values.password);
    } });
  const restore = () => openEditor({ title: 'Abrir backup para revisão', note: 'O arquivo será validado antes de substituir os dados. Você precisará confirmar a substituição.',
    fields: [{ key: 'recovery', label: 'Senha de recuperação', secret: true }, { key: 'local', label: 'Senha local para confirmar acesso', secret: true }],
    submit: async (values) => {
      const platform = await import('./src/platform/vault');
      const candidate = await platform.readBackupFile(values.recovery);
      if (!candidate) return;
      // File pickers may background and lock the app. Obtain the key again before showing/replacing local data.
      await acceptSession(await platform.unlockVault(values.local));
      setRestoreCandidate(candidate);
    } });
  const importCsv = () => openEditor({ title: 'Selecionar CSV para revisão', note: 'O seletor de arquivos pode bloquear a sessão. Sua senha será conferida novamente antes da prévia.',
    fields: [{ key: 'local', label: 'Senha local', secret: true }], submit: async (values) => {
      const text = await (await import('./src/platform/reportFiles')).readCsvFile();
      if (text === null) return;
      const active = await (await import('./src/platform/vault')).unlockVault(values.local);
      await acceptSession(active);
      setCsvCandidate(previewMovementsCsv(text, active.store.snapshot(), deviceToday(bookTimeZone(active.store.snapshot()))));
    } });
  return <>
    {demo ? <>
      <App />
      {Platform.OS !== 'web' ? <View style={gate.demoSwitch}><Button label="Abrir registros locais protegidos" onPress={() => { void probe(); }} /></View> : null}
    </> : session ? <App key={`local-${session.username}-${sessionEpoch}`} store={session.store} protectedSession onSettings={() => setSettings(true)} /> : (
      <SafeAreaView style={gate.page}><ScrollView contentContainerStyle={gate.content} keyboardShouldPersistTaps="handled">
        <Text style={gate.title}>myFinance</Text><Text style={gate.lead}>Seus registros ficam neste aparelho.</Text>
        <Text style={gate.note}>Modo nativo em validação. Use dados fictícios até a revisão de segurança e os testes em aparelho serem concluídos.</Text>
        {error ? <Text accessibilityRole="alert" style={gate.error}>{error}</Text> : null}
        <Button label="Consultar perfil local" onPress={() => { void probe(); }} />
        <Button label={proofBusy ? 'Validando este build…' : 'Executar validação nativa com dados fictícios'} onPress={() => { if (proofBusy) return; setProofBusy(true); void (async () => {
          try { setProof(await (await import('./src/platform/nativeProof')).runNativeProof()); }
          catch { setError('Módulos de segurança indisponíveis. Use um build nativo próprio.'); }
          finally { setProofBusy(false); }
        })(); }} />
        {proof.map((entry) => <Text style={gate.note} key={entry.id}>{entry.status === 'passed' ? 'Validado' : entry.status === 'failed' ? 'Falhou' : 'Verificação manual pendente'}: {entry.detail}</Text>)}
        {existing === true ? <>
          <Button label="Desbloquear com senha" onPress={unlock} />
          <Button label="Desbloquear com biometria" onPress={() => { void (async () => {
            try { await acceptSession(await (await import('./src/platform/vault')).unlockWithBiometrics()); }
            catch { setError('Biometria cancelada, indisponível ou alterada. Use a senha local.'); }
          })(); }} />
        </> : existing === false ? <>
          <Button label="Criar perfil local" onPress={() => create()} />
          <Button label="Restaurar backup em novo perfil" onPress={() => create(true)} />
        </> : null}
        <Button label="Usar demonstração em memória" onPress={() => setDemo(true)} />
      </ScrollView></SafeAreaView>
    )}
    {settings && session ? <Modal visible={!editor && !restoreCandidate && !csvCandidate} transparent onRequestClose={() => setSettings(false)}>
      <View style={gate.overlay}><View style={gate.settings}>
        <Text style={gate.title}>Segurança e backup</Text>
        <Button label="Exportar backup cifrado" onPress={backup} />
        <Button label="Restaurar backup" onPress={restore} />
        <Button label="Selecionar arquivo CSV para importação" onPress={importCsv} />
        <Button label="Ativar biometria" onPress={() => openEditor({ title: 'Proteger a chave com biometria', fields: [{ key: 'password', label: 'Senha local atual', secret: true }], submit: async (values) => {
          const verified = await (await import('./src/platform/vault')).unlockVault(values.password);
          try { await verified.enableBiometrics(); } finally { verified.lock(); }
        } })} />
        <Button label="Trocar senha local" onPress={() => openEditor({ title: 'Trocar senha', fields: [{ key: 'current', label: 'Senha atual', secret: true }, { key: 'next', label: 'Nova senha', secret: true }, { key: 'confirm', label: 'Confirmar nova senha', secret: true }], submit: async (values) => {
          if (values.next !== values.confirm) throw new Error('A confirmação de senha não confere.');
          if (!current.current) throw new Error('Sessão bloqueada.');
          await current.current.changePassword(values.current, values.next);
        } })} />
        <Button label="Bloquear agora" onPress={lock} />
        <Button label="Voltar aos registros" onPress={() => setSettings(false)} />
      </View></View>
    </Modal> : null}
    {restoreCandidate && session ? <Modal visible transparent onRequestClose={() => setRestoreCandidate(null)}>
      <View style={gate.overlay}><View style={gate.settings}>
        <Text style={gate.title}>Confirmar restauração</Text>
        <Text>O backup contém {restoreCandidate.movements.length + restoreCandidate.operations.length} registros e {restoreCandidate.accounts.length} contas. Ele substituirá o livro local inteiro, incluindo vínculos e histórico.</Text>
        <Button label="Substituir pelo backup validado" onPress={() => {
          try { if (!current.current) throw new Error('Sessão bloqueada.'); current.current.restore(restoreCandidate); }
          catch { setError('Não foi possível restaurar. A transação preservou os dados anteriores.'); setRestoreCandidate(null); return; }
          try { lock(); }
          catch { setError('Backup restaurado. Feche o aplicativo e desbloqueie novamente para conferir os registros.'); }
        }} />
        <Button label="Manter meus registros" onPress={() => setRestoreCandidate(null)} />
      </View></View>
    </Modal> : null}
    {csvCandidate && session ? <Modal visible transparent onRequestClose={() => setCsvCandidate(null)}>
      <View style={gate.overlay}><View style={gate.settings}>
        <Text style={gate.title}>Revisar importação CSV</Text>
        <Text>{csvCandidate.records.length} movimentos; {csvCandidate.duplicateIds.length} IDs já existentes serão ignorados. Valores e dias iguais não serão mesclados.</Text>
        {csvCandidate.warnings.map((warning, index) => <Text style={gate.note} key={index}>{warning}</Text>)}
        <Button label="Conferi os gastos: importar IDs novos" onPress={() => {
          try {
            if (!current.current) throw new Error('Sessão bloqueada.');
            const existingIds = new Set(csvCandidate.duplicateIds);
            const records = csvCandidate.records.filter((entry) => !existingIds.has(entry.id));
            current.current.store.execute({ kind: 'import-movements', movements: records }, { requestId: `csv-${Date.now()}`, recordedAt: new Date().toISOString(), today: deviceToday(bookTimeZone(current.current.store.snapshot())) });
            setCsvCandidate(null); setSettings(false); setSessionEpoch((epoch) => epoch + 1);
          } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível importar.'); setCsvCandidate(null); }
        }} />
        <Button label="Cancelar importação" onPress={() => setCsvCandidate(null)} />
      </View></View>
    </Modal> : null}
    {editor ? <RecordEditor key={editor.id} definition={editor} onClose={() => setEditor(null)} /> : null}
    {error && session && !editor ? <Modal visible transparent onRequestClose={() => setError('')}>
      <View style={gate.overlay}><View style={gate.settings}><Text accessibilityRole="alert" style={gate.error}>{error}</Text><Button label="Entendi" onPress={() => setError('')} /></View></View>
    </Modal> : null}
  </>;
}

const gate = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4F3ED' }, content: { padding: 24, paddingTop: 70, gap: 14 },
  title: { color: '#182A24', fontWeight: '700', fontSize: 26, marginBottom: 10 }, lead: { fontSize: 18, color: '#214B3D' },
  note: { color: '#586B60', lineHeight: 21 }, error: { color: '#A63838', lineHeight: 22 },
  button: { backgroundColor: '#214B3D', padding: 15, borderRadius: 12, marginVertical: 5 }, buttonText: { color: 'white', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: '#0007', justifyContent: 'center', padding: 20 }, settings: { backgroundColor: '#F4F3ED', padding: 20, borderRadius: 20, gap: 9 },
  demoSwitch: { backgroundColor: '#F4F3ED', paddingHorizontal: 20, paddingBottom: 4 },
});
