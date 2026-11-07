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
                    <Text style={[editorStyles.choiceText, values[field.key] === choice.value && editorStyles.selectedChoiceText]}>{choice.label}</Text>
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
              <Text style={editorStyles.closeText}>Voltar</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const editorStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 27, 49, 0.58)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#F3F5F9', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%', padding: 20 },
  title: { color: '#1B2335', fontWeight: '900', fontSize: 23, marginBottom: 16, letterSpacing: -0.4 },
  content: { paddingBottom: 30, gap: 16 }, field: { gap: 8 }, label: { color: '#1B2335', fontWeight: '800' },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE2EC', padding: 12, borderRadius: 11, color: '#1B2335' },
  readOnly: { backgroundColor: '#E9ECF3' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 11, borderWidth: 1, borderColor: '#DDE2EC' },
  choiceText: { color: '#657087', fontWeight: '700' }, selected: { backgroundColor: '#F2D65C', borderColor: '#3D59E8' }, selectedChoiceText: { color: '#1B2335', fontWeight: '900' },
  hint: { color: '#657087', fontSize: 12, lineHeight: 18 },
  save: { backgroundColor: '#3D59E8', borderRadius: 12, padding: 15, alignItems: 'center' }, saveText: { color: 'white', fontWeight: '800' },
  close: { padding: 12, alignItems: 'center' }, closeText: { color: '#657087', fontWeight: '700' }, error: { color: '#B53B4B', lineHeight: 20 },
});
