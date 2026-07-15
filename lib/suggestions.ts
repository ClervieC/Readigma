import { supabase, getCurrentUserId } from './supabase';
import { BookFormFields } from '../components/BookForm';

// Mirrors admin.ts's addBookManually shape exactly — a suggestion carries
// everything needed to add the book to the catalog directly; the admin
// reviews the card and confirms rather than re-typing it (see app/admin.tsx
// "Suggestions" tab and book_suggestions in db/schema.sql).
export async function submitSuggestion(book: BookFormFields) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  const { error } = await supabase.from('book_suggestions').insert({
    user_id: userId,
    title: book.title.trim(),
    author: book.author.trim() || null,
    cover_url: book.cover_url.trim() || null,
    description: book.description.trim() || null,
    genres: book.genres.split(',').map(g => g.trim()).filter(Boolean),
    published_year: book.published_year.trim() ? parseInt(book.published_year, 10) : null,
    series: book.series.trim() || null,
    series_index: book.series_index.trim() ? parseFloat(book.series_index) : null,
  });
  if (error) throw new Error(error.message);
}
