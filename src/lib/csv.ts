export type ImportedActual = { period: string; category: string; description: string; amount: number; direction: 'inflow' | 'outflow'; source: string };

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') {
      if (cell.length) throw new Error('CSV contains an unexpected quote');
      quoted = true;
    } else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); if (row.some(v => v.trim())) rows.push(row); }
  if (rows.some(r => r.length !== rows[0].length)) throw new Error('CSV rows have inconsistent column counts');
  return rows;
}

function parseAmount(raw: string, rowNumber: number): number {
  let value = raw.trim().replace(/[€$£\s]/g, '');
  if (!value) throw new Error(`Missing amount on CSV row ${rowNumber}`);
  // Accept standard decimal-dot values and common European decimal-comma values.
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(value)) value = value.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(value)) value = value.replace(/,/g, '');
  else if (/^-?\d+,\d{1,2}$/.test(value)) value = value.replace(',', '.');
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error(`Invalid amount on CSV row ${rowNumber}`);
  return amount;
}

export function normalizeActuals(text: string, source = 'CSV import'): ImportedActual[] {
  if (text.length > 2_000_000) throw new Error('CSV exceeds the 2 MB limit');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one data row');
  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[ _-]+/g, ''));
  const find = (...names: string[]) => headers.findIndex(h => names.includes(h));
  const dateIdx = find('date', 'period', 'transactiondate');
  const amountIdx = find('amount', 'value', 'total');
  const descIdx = find('description', 'memo', 'name', 'label');
  const categoryIdx = find('category', 'account', 'type');
  if (dateIdx < 0 || amountIdx < 0) throw new Error('CSV needs Date and Amount columns');
  const output: ImportedActual[] = [];
  for (const [i, r] of rows.slice(1).entries()) {
    const rowNumber = i + 2;
    const rawDate = (r[dateIdx] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) throw new Error(`Date on CSV row ${rowNumber} must use YYYY-MM-DD`);
    const [year, month, day] = rawDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`Invalid date on CSV row ${rowNumber}`);
    const amount = parseAmount(r[amountIdx] ?? '', rowNumber);
    output.push({ period: rawDate, category: (r[categoryIdx] ?? 'Uncategorised').trim() || 'Uncategorised', description: (r[descIdx] ?? '').trim(), amount: Math.abs(amount), direction: amount >= 0 ? 'inflow' : 'outflow', source });
  }
  if (!output.length) throw new Error('CSV contains no financial records');
  if (output.length > 10_000) throw new Error('Maximum 10,000 rows per import');
  return output;
}
