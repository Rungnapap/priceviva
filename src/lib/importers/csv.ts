/**
 * Streaming RFC 4180 CSV parser (no dependencies).
 * Handles quoted fields, escaped quotes (""), delimiters and newlines inside quotes,
 * CRLF/LF line endings and a UTF-8 BOM. Memory use stays bounded by one record.
 */
export interface CsvOptions {
  delimiter?: string; // default ","
  maxFieldLength?: number; // guards against malformed files (default 200 kB)
}

export async function* parseCsv(chunks: AsyncIterable<string> | Iterable<string>, opts: CsvOptions = {}): AsyncGenerator<string[]> {
  const delim = opts.delimiter ?? ",";
  const maxField = opts.maxFieldLength ?? 200_000;
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let quotePending = false; // saw a quote inside a quoted field; next char decides
  let first = true;
  let sawAny = false;

  for await (let chunk of chunks as AsyncIterable<string>) {
    if (first) {
      if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
      first = false;
    }
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]!;
      sawAny = true;
      if (inQuotes) {
        if (quotePending) {
          quotePending = false;
          if (c === '"') {
            field += '"';
            continue;
          }
          inQuotes = false; // closing quote; fall through to handle c normally
        } else if (c === '"') {
          quotePending = true;
          continue;
        } else {
          field += c;
          if (field.length > maxField) throw new Error(`CSV field exceeds ${maxField} characters (malformed file?)`);
          continue;
        }
      }
      if (c === '"' && field.length === 0) {
        inQuotes = true;
      } else if (c === delim) {
        record.push(field);
        field = "";
      } else if (c === "\n") {
        record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
        field = "";
        if (!(record.length === 1 && record[0] === "")) yield record;
        record = [];
      } else {
        field += c;
        if (field.length > maxField) throw new Error(`CSV field exceeds ${maxField} characters (malformed file?)`);
      }
    }
  }
  if (inQuotes && !quotePending) throw new Error("CSV ended inside a quoted field (truncated download?)");
  if (sawAny && (field.length > 0 || record.length > 0)) {
    record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    if (!(record.length === 1 && record[0] === "")) yield record;
  }
}

/** Pair each record with the header row, producing objects keyed by column name. */
export async function* csvObjects(
  chunks: AsyncIterable<string> | Iterable<string>,
  opts: CsvOptions = {},
): AsyncGenerator<{ row: number; values: Record<string, string>; header: string[] }> {
  let header: string[] | null = null;
  let n = 0;
  for await (const rec of parseCsv(chunks, opts)) {
    if (!header) {
      header = rec.map((h) => h.trim());
      continue;
    }
    n++;
    const values: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) values[header[i]!] = rec[i] ?? "";
    yield { row: n, values, header };
  }
}
