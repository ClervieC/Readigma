import api from './api';

export const booksService = {
  search: (q: string) => api.get(`/books/search?q=${q}`),
  
  getMyBooks: (status?: string) => {
    const params = status ? `?status=${status}` : '';
    return api.get(`/me/books${params}`);
  },

  addBook: (book_id: string, status = 'to_read') =>
    api.post('/me/books', { book_id, status }),

  updateBook: (bookId: string, data: any) =>
    api.put(`/me/books/${bookId}`, data),

  removeBook: (bookId: string) =>
    api.delete(`/me/books/${bookId}`),

  randomize: (genre?: string) => {
    const params = genre ? `?genre=${genre}` : '';
    return api.get(`/me/randomize${params}`);
  },
  updateProgress: (bookId: string, data: { current_page?: number; total_pages?: number; progress_percent?: number }) =>
    api.put(`/me/books/${bookId}/progress`, data),

  addReaction: (bookId: string, data: { emoji: string; note?: string; progress_percent?: number; page_number?: number; is_public?: boolean }) =>
    api.post(`/me/books/${bookId}/reactions`, data),

  getReactions: (bookId: string) =>
    api.get(`/me/books/${bookId}/reactions`),

  addBookToDb: (book: any) =>
    api.post('/books', { ...book, approved: true }),

  getTrending: () => api.get('/books/trending'),
  getPopular: () => api.get('/books/popular'),
};