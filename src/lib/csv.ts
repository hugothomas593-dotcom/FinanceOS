export type ImportedActual = { period: string; category: string; description: string; amount: number; direction: 'inflow' | 'outflow'; source: string; currency?: string };

function detectDelimiter(text: string): string {
  const delimiters = [',', ';', '\t'];
  const counts = new Map(delimiters.map((delimiter) => [delimiter, 0]));
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === '\n') break;
    if (!quoted && counts.has(character)) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }

  return delimiters.reduce(
    (best, delimiter) => (counts.get(delimiter)! > counts.get(best)! ? delimiter : best),
    ',',
  );
}

export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      if (cell.length) throw new Error('CSV contains an unexpected quote');
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some((value) => value.trim())) rows.push(row);
  }
  if (rows.length && rows.some((csvRow) => csvRow.length !== rows[0].length)) {
    throw new Error('CSV rows have inconsistent column counts');
  }
  return rows;
}

function parseAmount(raw: string, rowNumber: number): number {
  let value = raw.trim().replace(/[€$£\\s]/g, '');
  if (!value) throw new Error(`Missing amount on CSV row ${rowNumber}`);
  // Accept standard decimal-dot values and common European decimal-comma values.
  if (/^-?\\d{1,3}(\\.\\d{3})+,\\d{1,2}$/.test(value)) value = value.replace(/\\./g, '').replace(',', '.');
  else if (/^-?\\d{1,3}(,\\d{3})+(\\.\\d{1,2})?$/.test(value)) value = value.replace(/,/g, '');
  else if (/^-?\\d+,\\d{1,2}$/.test(value)) value = value.replace(',', '.');
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error(`Invalid amount on CSV row ${rowNumber}`);
  return amount;
}

function normalizeDate(raw: string, rowNumber: number): string {
  const value = raw.trim().replace(/^\\uFEFF/, '');
  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);
  if (iso) {
    [, year, month, day] = [iso[0], Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    // Ambiguous numeric dates are interpreted day-first for French/European bank exports.
    const european = /^(\\d{1,2})[\\/.\\-](\\d{1,2})[\\/.\\-](\\d{4})$/.exec(value);
    if (!european) {
      throw new Error(`Date on CSV row ${rowNumber} must use YYYY-MM-DD or DD/MM/YYYY`);
    }
    day = Number(european[1]);
    month = Number(european[2]);
    year = Number(european[3]);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid date on CSV row ${rowNumber}`);
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeActuals(text: string, source = 'CSV import'): ImportedActual[] {
  if (text.length > 2_000_000) throw new Error('CSV exceeds the 2 MB limit');
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one data row');

  const headers = rows[0].map((header) =>
    header.trim().replace(/^\\uFEFF/, '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[ _-]+/g, ''),
  );
  const find = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const dateIdx = find('date', 'period', 'transactiondate', 'dateoperation', 'datevaleur');
  const amountIdx = find('amount', 'value', 'total', 'montant');
  const debitIdx = find('debit', 'debitamount', 'withdrawal', 'withdrawals', 'sortie');
  const creditIdx = find('credit', 'creditamount', 'deposit', 'deposits', 'entree');
  const descIdx = find('description', 'memo', 'name', 'label', 'libelle', 'intitule');
  const categoryIdx = find('category', 'account', 'type', 'categorie');
  const currencyIdx = find('currency', 'devise', 'monnaie');

  if (dateIdx < 0 || (amountIdx < 0 && debitIdx < 0 && creditIdx < 0)) {
    throw new Error('CSV needs a Date and Amount column, or Date with Debit/Credit columns');
  }

  const output: ImportedActual[] = [];
  for (const [index, row] of rows.slice(1).entries()) {
    const rowNumber = index + 2;
    const period = normalizeDate(row[dateIdx] ?? '', rowNumber);
    let signedAmount: number;

    if (amountIdx >= 0) {
      signedAmount = parseAmount(row[amountIdx] ?? '', rowNumber);
    } else {
      const debitRaw = debitIdx >= 0 ? (row[debitIdx] ?? '').trim() : '';
      const creditRaw = creditIdx >= 0 ? (row[creditIdx] ?? '').trim() : '';
      const debitAmount = debitRaw ? parseAmount(debitRaw, rowNumber) : 0;
      const creditAmount = creditRaw ? parseAmount(creditRaw, rowNumber) : 0;
      if (Math.abs(debitAmount) > 0 && Math.abs(creditAmount) > 0) {
        throw new Error(`CSV row ${rowNumber} contains both a debit and a credit amount`);
      }
      if (!debitRaw && !creditRaw) throw new Error(`Missing amount on CSV row ${rowNumber}`);
      signedAmount = Math.abs(debitAmount) > 0 ? -Math.abs(debitAmount) : Math.abs(creditAmount);
    }

    const rawCurrency = currencyIdx >= 0 ? (row[currencyIdx] ?? '').trim().toUpperCase() : '';
    if (rawCurrency && !/^[A-Z]{3}$/.test(rawCurrency)) {
      throw new Error(`Currency on CSV row ${rowNumber} must be a three-letter currency code`);
    }

    output.push({
      period,
      category: (categoryIdx >= 0 ? row[categoryIdx] : '')?.trim() || 'Uncategorised',
      description: (descIdx >= 0 ? row[descIdx] : '')?.trim() || '',
      amount: Math.abs(signedAmount),
      direction: signedAmount >= 0 ? 'inflow' : 'outflow',
      source,
      ...(rawCurrency ? { currency: rawCurrency } : {}),
    });
  }

  if (!output.length) throw new Error('CSV contains no financial records');
  if (output.length > 10_000) throw new Error('Maximum 10,000 rows per import');
  return output;
}

