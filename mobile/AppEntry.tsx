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

export default function AppEntry() {
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
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let mounted = true;
    void (async () => {
      try { const found = await (await import('./src/platform/vault')).hasVault(); if (mounted) setExisting(found); }
      catch { if (mounted) setError('Não foi possível acessar o cofre local neste aparelho.'); }
    })();
    return () => { mounted = false; };
  }, []);
  const acceptSession = async (active: VaultSession) => {
    try {
      if (AppState.currentState !== 'active') throw new Error('Volte ao aplicativo para desbloquear.');
      const capture = await import('expo-screen-capture');
      await capture.preventScreenCaptureAsync('myfinance-local');
      if (AppState.currentState !== 'active') throw new Error('Volte ao aplicativo para desbloquear.');
      current.current?.lock(); current.current = active; setSession(active); setExisting(true); setError('');
    } catch { active.lock(); throw new Error('Não foi possível proteger a tela. A sessão permaneceu bloqueada.'); }
  };
  const openEditor = (definition: Omit<EditorDefinition, 'id'>) => setEditor({ id: `vault-form-${formCount.current++}`, ...definition });
  const unlock = () => openEditor({ title: 'Desbloquear registros locais', fields: [{ key: 'password', label: 'Senha local', secret: true }],
    submit: async (values) => acceptSession(await (await import('./src/platform/vault')).unlockVault(values.password)) });
  const create = (fromBackup = false) => {
    const openingDate = deviceToday();
    const openingMonth = monthOf(openingDate);
    return openEditor({ title: fromBackup ? 'Criar perfil a partir de backup' : 'Criar perfil local',
    note: fromBackup
      ? 'Escolha uma senha local com pelo menos 12 caracteres. O backup será validado antes de criar o perfil; você pode ativar a biometria do Android.'
      : 'Escolha uma senha com pelo menos 12 caracteres, informe o saldo real na data-base e escolha se quer ativar a biometria do Android.',
    fields: [{ key: 'username', label: 'Seu nome' }, { key: 'password', label: 'Nova senha local', secret: true }, { key: 'confirm', label: 'Confirmar nova senha local', secret: true },
      ...(fromBackup ? [{ key: 'recovery', label: 'Senha de recuperação do backup', secret: true }] : [
        { key: 'accountName', label: 'Nome da conta principal' },
        { key: 'moneyType', label: 'Tipo da conta principal', choices: [{ value: 'digital', label: 'Digital / bancária' }, { value: 'physical', label: 'Dinheiro físico' }] },
        { key: 'opening', label: 'Saldo de abertura', hint: `Data-base: 01/${openingDate.slice(5, 7)}/${openingDate.slice(0, 4)}. Use o saldo real dessa data. Não importe novamente movimentos já refletidos nele.` },
      ]),
      { key: 'biometrics', label: 'Biometria do Android (digital se disponível)', value: 'yes', choices: [{ value: 'yes', label: 'Ativar' }, { value: 'no', label: 'Agora não' }] },
    ], submit: async (values) => {
      if (values.password !== values.confirm) throw new Error('A confirmação de senha não confere.');
      const platform = await import('./src/platform/vault');
      let book: FinanceBook;
      if (fromBackup) { const candidate = await platform.readBackupFile(values.recovery); if (!candidate) return; book = candidate; }
      else {
        if (!values.accountName.trim()) throw new Error('Informe o nome da conta principal.');
        if (values.moneyType !== 'digital' && values.moneyType !== 'physical') throw new Error('Escolha o tipo da conta principal.');
        const text = values.opening.trim(); const sign = text.startsWith('-') ? -1 : 1;
        const parsed = /^(?:0|0,0{1,2})$/.test(text) ? 0 : parseBrlToMinor(sign < 0 ? text.slice(1) : text);
        if (parsed === null) throw new Error('Informe um saldo de abertura válido.');
        book = emptyBook(openingMonth);
        book.accounts = [
          { id: 'primary-cash-account', name: values.accountName.trim(), currency: 'BRL', kind: 'cash', moneyType: values.moneyType as 'digital' | 'physical', openingOn: `${openingMonth}-01`, openingMinor: parsed * sign, eligible: true },
        ];
      }
      const active = await platform.createVault(values.username, values.password, book);
      let biometricsUnavailable = false;
      if (values.biometrics === 'yes') {
        try { await active.enableBiometrics(); }
        catch { biometricsUnavailable = true; }
      }
      await acceptSession(active);
      if (biometricsUnavailable) setError('Perfil criado. Não foi possível ativar a biometria; a senha local continua funcionando. Você pode tentar novamente em Segurança e backup.');
    } });
  };
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
    {session ? <App key={`local-${session.username}-${sessionEpoch}`} store={session.store} onSettings={() => setSettings(true)} /> : Platform.OS === 'web' ? (
      <SafeAreaView style={gate.page}><ScrollView contentContainerStyle={gate.content}>
        <Text style={gate.title}>myFinance</Text><Text style={gate.lead}>Seus registros ficam protegidos no aparelho.</Text>
        <Text style={gate.note}>Para acessar ou criar seu cofre, use o aplicativo instalado em um aparelho compatível.</Text>
        {error ? <Text accessibilityRole="alert" style={gate.error}>{error}</Text> : null}
      </ScrollView></SafeAreaView>
    ) : (
      <SafeAreaView style={gate.page}><ScrollView contentContainerStyle={gate.content} keyboardShouldPersistTaps="handled">
        <Text style={gate.title}>myFinance</Text><Text style={gate.lead}>Suas finanças, no seu aparelho.</Text>
        <Text style={gate.note}>Crie ou desbloqueie seu cofre local para acessar seus registros.</Text>
        {error ? <Text accessibilityRole="alert" style={gate.error}>{error}</Text> : null}
        {existing === null && !error ? <Text style={gate.note}>Verificando o cofre local…</Text> : null}
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
        {__DEV__ ? <>
          <Button label={proofBusy ? 'Verificando proteção…' : 'Verificar proteção do aparelho'} onPress={() => { if (proofBusy) return; setProofBusy(true); void (async () => {
            try { setProof(await (await import('./src/platform/nativeProof')).runNativeProof()); }
            catch { setError('Não foi possível verificar o armazenamento protegido.'); }
            finally { setProofBusy(false); }
          })(); }} />
          {proof.map((entry) => <Text style={gate.note} key={entry.id}>{entry.status === 'passed' ? 'Validado' : entry.status === 'failed' ? 'Falhou' : 'Verificação manual pendente'}: {entry.detail}</Text>)}
        </> : null}
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
});
