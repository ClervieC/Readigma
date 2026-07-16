import { supabase, getCurrentUserId } from './supabase';
import { BookFormFields } from '../components/BookForm';
import { findCoverByIsbn } from './books';

// Mirrors admin.ts's addBookManually shape exactly — a suggestion carries
// everything needed to add the book to the catalog directly; the admin
// reviews the card and confirms rather than re-typing it (see app/admin.tsx
// "Suggestions" tab and book_suggestions in db/schema.sql).
export async function submitSuggestion(book: BookFormFields) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  // A suggester who filled in the ISBN but skipped the (optional, more
  // fiddly) cover URL field still ends up with a real cover most of the
  // time — same multi-source lookup as the form's own "Trouver via ISBN"
  // button, just run automatically here as a last resort before saving.
  const coverUrl = book.cover_url.trim() || (book.isbn.trim() ? await findCoverByIsbn(book.isbn.trim()) : null);
  const { error } = await supabase.from('book_suggestions').insert({
    user_id: userId,
    title: book.title.trim(),
    author: book.author.trim() || null,
    isbn: book.isbn.trim() || null,
    cover_url: coverUrl,
    description: book.description.trim() || null,
    genres: book.genres.split(',').map(g => g.trim()).filter(Boolean),
    published_year: book.published_year.trim() ? parseInt(book.published_year, 10) : null,
    series: book.series.trim() || null,
    series_index: book.series_index.trim() ? parseFloat(book.series_index) : null,
  });
  if (error) throw new Error(error.message);
}
