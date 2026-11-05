import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export interface EditorField {
  key: string;
  label: string;
  value?: string;
  hint?: string;
  choices?: { value: string; label: string }[];
  multiline?: boolean;
  secret?: boolean;
  readOnly?: boolean;
  maxLength?: number;
}
export interface EditorDefinition {
  id: string;
  title: string;
  note?: string;
  fields: EditorField[];
  submitLabel?: string;
  preview?(values: Record<string, string>): string;
  submit(values: Record<string, string>): void | Promise<void>;
}

export function RecordEditor({ definition, onClose }: { definition: EditorDefinition; onClose(): void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(definition.fields.map((field) => [field.key, field.value ?? ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await definition.submit(values); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar o registro.'); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} testID="record-editor">
      <View style={editorStyles.backdrop}>
        <View style={editorStyles.sheet}>
          <Text style={editorStyles.title}>{definition.title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={editorStyles.content}>
            {definition.note ? <Text style={editorStyles.hint}>{definition.note}</Text> : null}
            {definition.fields.map((field) => (
              <View key={field.key} style={editorStyles.field}>
                <Text style={editorStyles.label}>{field.label}</Text>
                {field.choices ? <View style={editorStyles.choices}>{field.choices.map((choice) => (
                  <Pressable key={choice.value} accessibilityRole="button" accessibilityLabel={`${field.label}: ${choice.label}`}
                    accessibilityState={{ selected: values[field.key] === choice.value }} disabled={field.readOnly || busy}
                    onPress={() => setValues((current) => ({ ...current, [field.key]: choice.value }))}
                    style={[editorStyles.choice, values[field.key] === choice.value && editorStyles.selected]}>
                    <Text>{choice.label}</Text>
                  </Pressable>
                ))}</View> : <TextInput accessibilityLabel={field.label} value={values[field.key]}
                  secureTextEntry={field.secret} autoCapitalize={field.secret ? 'none' : 'sentences'}
                  autoCorrect={!field.secret} multiline={field.multiline} editable={!field.readOnly && !busy}
                  onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                  style={[editorStyles.input, field.readOnly && editorStyles.readOnly]} maxLength={field.maxLength ?? (field.multiline ? 2000 : 160)} />}
                {field.hint ? <Text style={editorStyles.hint}>{field.hint}</Text> : null}
              </View>
            ))}
            {definition.preview ? <Text style={editorStyles.hint} testID="record-editor-preview">{definition.preview(values)}</Text> : null}
            {error ? <Text accessibilityRole="alert" style={editorStyles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" testID="record-editor-save" disabled={busy} onPress={save} style={editorStyles.save}>
              <Text style={editorStyles.saveText}>{busy ? 'Aguarde…' : definition.submitLabel ?? 'Salvar registro'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" testID="record-editor-close" disabled={busy} onPress={onClose} style={editorStyles.close}>
              <Text>Voltar</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const editorStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#F4F3ED', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%', padding: 20 },
  title: { color: '#182A24', fontWeight: '700', fontSize: 22, marginBottom: 16 },
  content: { paddingBottom: 30, gap: 16 }, field: { gap: 8 }, label: { color: '#182A24', fontWeight: '600' },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#DDE4DC', padding: 12, borderRadius: 12, color: '#182A24' },
  readOnly: { backgroundColor: '#E8EBE5' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#DDE4DC' },
  selected: { backgroundColor: '#D8F27A', borderColor: '#214B3D' }, hint: { color: '#586B60', fontSize: 12, lineHeight: 18 },
  save: { backgroundColor: '#214B3D', borderRadius: 12, padding: 15, alignItems: 'center' }, saveText: { color: 'white', fontWeight: '600' },
  close: { padding: 12, alignItems: 'center' }, error: { color: '#A63838', lineHeight: 20 },
});
