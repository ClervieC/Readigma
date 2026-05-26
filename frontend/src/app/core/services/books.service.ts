import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BooksService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  searchBooks(query: string) {
    return this.http.get<any[]>(`${this.api}/books/search?q=${query}`);
  }

  getMyBooks(status?: string) {
    const params = status ? `?status=${status}` : '';
    return this.http.get<any[]>(`${this.api}/me/books${params}`);
  }

  addBook(book_id: string, status = 'to_read') {
    return this.http.post(`${this.api}/me/books`, { book_id, status });
  }

  updateBook(bookId: string, data: { rating?: number; comment?: string; status?: string }) {
    return this.http.put(`${this.api}/me/books/${bookId}`, data);
  }

  removeBook(bookId: string) {
    return this.http.delete(`${this.api}/me/books/${bookId}`);
  }

  randomize(genre?: string, trope?: string) {
    let params = '';
    if (genre) params += `?genre=${genre}`;
    if (trope) params += `${params ? '&' : '?'}trope=${trope}`;
    return this.http.get<any>(`${this.api}/me/randomize${params}`);
  }

  addBookToDb(book: any) {
    return this.http.post<any>(`${this.api}/books`, { ...book, approved: true });
  }
}