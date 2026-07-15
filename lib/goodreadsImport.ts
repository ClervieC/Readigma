import { supabase, getCurrentUserId } from './supabase';

// Minimal RFC4180 CSV parser (handles quoted fields with embedded commas,
// quotes, and newlines) — Goodreads' export needs exactly this, and pulling
// in a full CSV library for one screen isn't worth the weight.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip — paired \n below ends the row
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Goodreads titles carry the series inline, e.g. "Harry Potter and the
// Chamber of Secrets (Harry Potter, #2)".
const SERIES_PAT = /^(.*?)\s*\(([^,()]+),\s*#([\d.]+)\)$/;
const STATUS_MAP: Record<string, string> = { 'to-read': 'to_read', read: 'done', 'currently-reading': 'reading' };

function cleanIsbn(v: string): string | null {
  const trimmed = v.trim();
  // Goodreads wraps ISBN cells as ="9780000000000" to stop spreadsheet apps
  // from mangling them as numbers.
  const m = trimmed.match(/^="?(.*?)"?$/);
  const cleaned = (m ? m[1] : trimmed).trim();
  return cleaned || null;
}

function cleanDate(v: string): string | null {
  const trimmed = v.trim();
  return trimmed ? trimmed.replace(/\//g, '-') : null;
}

export type ImportProgress =
  | { phase: 'books'; current: number; total: number }
  | { phase: 'user_books'; current: number; total: number };

export type ImportResult = { booksCount: number; importedCount: number };

const CHUNK = 40;

export async function importGoodreadsCsv(csvText: string, onProgress?: (p: ImportProgress) => void): Promise<ImportResult> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');

  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error('Fichier CSV vide ou invalide');
  const header = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1).filter(r => r.length > 1);
  const records = dataRows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])) as Record<string, string>);

  const seen = new Set<string>();
  const books: any[] = [];
  const meta: { external_id: string; shelf: string; rating: string; review: string; dateRead: string }[] = [];

  for (const row of records) {
    const bookId = row['Book Id']?.trim();
    if (!bookId) continue;
    const external_id = `goodreads_${bookId}`;
    if (seen.has(external_id)) continue;
    seen.add(external_id);

    let title = (row['Title'] || '').trim();
    let series: string | null = null;
    let series_index: number | null = null;
    const m = title.match(SERIES_PAT);
    if (m) {
      title = m[1].trim();
      series = m[2].trim();
      series_index = parseFloat(m[3]);
    }

    const isbn13 = cleanIsbn(row['ISBN13'] || '');
    const cover_url = isbn13 ? `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg` : null;

    let published_year: number | null = null;
    for (const key of ['Original Publication Year', 'Year Published']) {
      const v = (row[key] || '').trim();
      if (/^\d+$/.test(v)) { published_year = parseInt(v, 10); break; }
    }

    if (!title) continue;
    books.push({
      external_id, title,
      author: (row['Author'] || '').trim() || null,
      cover_url, description: null, genres: [], published_year, approved: true,
      series, series_index,
    });
    meta.push({
      external_id,
      shelf: (row['Exclusive Shelf'] || '').trim(),
      rating: (row['My Rating'] || '').trim(),
      review: (row['My Review'] || '').trim(),
      dateRead: row['Date Read'] || '',
    });
  }

  const idByExternal = new Map<string, string>();
  for (let i = 0; i < books.length; i += CHUNK) {
    const chunk = books.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('books')
      .upsert(chunk, { onConflict: 'external_id' })
      .select('id,external_id');
    if (error) throw new Error(error.message);
    for (const r of data ?? []) idByExternal.set(r.external_id, r.id);
    onProgress?.({ phase: 'books', current: Math.min(i + CHUNK, books.length), total: books.length });
  }

  const userBooksPayload = meta
    .map(m => {
      const book_id = idByExternal.get(m.external_id);
      if (!book_id) return null;
      const status = STATUS_MAP[m.shelf] ?? 'to_read';
      const ratingNum = m.rating ? parseFloat(m.rating) : 0;
      return {
        user_id: userId,
        book_id,
        status,
        format: 'ereader',
        rating: ratingNum > 0 ? ratingNum : null,
        comment: m.review || null,
        finished_at: status === 'done' ? cleanDate(m.dateRead) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  let done = 0;
  for (let i = 0; i < userBooksPayload.length; i += CHUNK) {
    const chunk = userBooksPayload.slice(i, i + CHUNK);
    const { error } = await supabase.from('user_books').upsert(chunk, { onConflict: 'user_id,book_id' });
    if (error) throw new Error(error.message);
    done += chunk.length;
    onProgress?.({ phase: 'user_books', current: done, total: userBooksPayload.length });
  }

  return { booksCount: books.length, importedCount: userBooksPayload.length };
}
