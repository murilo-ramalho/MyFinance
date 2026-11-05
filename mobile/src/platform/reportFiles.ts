export async function readCsvFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,text/csv';
    input.onchange = () => { const file = input.files?.[0]; if (!file) { resolve(null); return; }
      if (file.size > 2 * 1024 * 1024) { reject(new Error('CSV acima do limite de 2 MB.')); return; }
      void file.text().then(resolve, () => reject(new Error('Não foi possível ler o arquivo.')));
    };
    input.oncancel = () => resolve(null); input.click();
  });
}
export async function shareCsvFile(text: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'myfinance-movimentos.csv'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
