/* Teach Clock — CSV and print export.

   Excel is offered through the same CSV payload with a BOM, which Excel opens
   natively; a real .xlsx writer is not worth a dependency for tabular exports.
   PDF goes through the browser's print pipeline against the report stylesheet,
   so what prints is what the page shows. */

export type Column<T> = { header: string; value: (row: T) => string | number };

function cell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV<T>(rows: T[], cols: Column<T>[]): string {
  const head = cols.map((c) => cell(c.header)).join(',');
  const body = rows.map((r) => cols.map((c) => cell(c.value(r))).join(',')).join('\n');
  return `${head}\n${body}`;
}

export function download(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  /* The BOM is what makes Excel read UTF-8 correctly — without it, naira signs
     and Nigerian names arrive mangled. */
  const blob = new Blob([mime.startsWith('text/csv') ? '\uFEFF' + content : content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportRows<T>(name: string, rows: T[], cols: Column<T>[], as: 'csv' | 'excel' = 'csv') {
  const stamp = new Date().toISOString().slice(0, 10);
  download(`${name}-${stamp}.csv`, toCSV(rows, cols));
  return as;
}
