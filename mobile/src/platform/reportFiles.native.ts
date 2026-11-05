import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

export async function readCsvFile(): Promise<string | null> {
  const selected = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
  if (selected.canceled) return null;
  const file = new File(selected.assets[0].uri);
  try { if (file.size > 2 * 1024 * 1024) throw new Error('CSV acima do limite de 2 MB.'); return await file.text(); }
  finally { if (file.exists) file.delete(); }
}
export async function shareCsvFile(text: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('Compartilhamento indisponível.');
  const file = new File(Paths.cache, `myfinance-relatorio-${Date.now()}.csv`);
  file.write(text);
  try { await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar relatório sem cifra' }); }
  finally { if (file.exists) file.delete(); }
}
