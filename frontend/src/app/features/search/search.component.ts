import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BooksService } from '../../core/services/books.service';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div class="page-title">Chercher</div>
    </div>

    <div class="scroll-area">
      <div class="search-bar">
        <i class="ti ti-search"></i>
        <input
          type="text"
          [(ngModel)]="query"
          placeholder="Titre, auteur, ISBN..."
          (keyup.enter)="search()"
          (input)="onInput()"
        />
        @if (query) {
          <button class="clear-btn" (click)="clear()">
            <i class="ti ti-x"></i>
          </button>
        }
      </div>

      @if (loading()) {
        <div class="loading">Recherche en cours...</div>
      }

      @if (results().length > 0) {
        <div class="results-count">{{ results().length }} résultats</div>
        @for (book of results(); track book.google_books_id) {
          <div class="result-item">
            <div class="result-cover">
              @if (book.cover_url) {
                <img [src]="book.cover_url" [alt]="book.title" />
              } @else {
                📚
              }
            </div>
            <div class="result-info">
              <div class="result-title">{{ book.title }}</div>
              <div class="result-author">{{ book.author }}</div>
              @if (book.published_year) {
                <div class="result-year">{{ book.published_year }}</div>
              }
              @if (book.genres?.length) {
                <div class="result-tags">
                  @for (genre of book.genres.slice(0,2); track genre) {
                    <span class="tag">{{ genre }}</span>
                  }
                </div>
              }
            </div>
            <button class="add-btn" (click)="addBook(book)"
                    [class.added]="addedBooks().has(book.google_books_id)">
              @if (addedBooks().has(book.google_books_id)) {
                <i class="ti ti-check"></i>
              } @else {
                <i class="ti ti-plus"></i>
              }
            </button>
          </div>
        }
      }

      @if (!loading() && query && results().length === 0 && searched()) {
        <div class="empty-state">
          <span class="empty-emoji">🔍</span>
          <p>Aucun résultat pour "{{ query }}"</p>
          <p class="empty-sub">Essaie un autre titre ou auteur</p>
        </div>
      }

      @if (!query) {
        <div class="suggestions">
          <div class="section-label">Recherches populaires</div>
          @for (s of suggestions; track s) {
            <button class="suggestion-chip" (click)="setQuery(s)">{{ s }}</button>
          }
        </div>
      }

      @if (successMsg()) {
        <div class="success-toast">{{ successMsg() }}</div>
      }
    </div>
  `,
  styles: [`
    .search-bar {
      display: flex; align-items: center; gap: 10px;
      background: var(--card);
      border: 1px solid var(--divider);
      border-radius: var(--radius-md);
      padding: 12px 16px;
      margin-bottom: 16px;
      &:focus-within { border-color: var(--purple); }
      i { font-size: 18px; color: var(--gray); flex-shrink: 0; }
      input {
        flex: 1; background: none; border: none;
        color: var(--white); font-size: 15px;
        outline: none; padding: 0;
        &::placeholder { color: var(--gray); }
      }
    }
    .clear-btn {
      background: none; border: none;
      color: var(--gray); cursor: pointer;
      i { font-size: 16px; }
    }
    .loading {
      text-align: center; padding: 32px;
      color: var(--gray); font-size: 14px;
    }
    .results-count {
      font-size: 12px; color: var(--gray);
      margin-bottom: 12px;
    }
    .result-item {
      display: flex; gap: 12px;
      padding: 12px;
      background: var(--card);
      border-radius: var(--radius-md);
      margin-bottom: 8px;
      align-items: center;
      border: 1px solid var(--divider);
    }
    .result-cover {
      width: 48px; height: 64px;
      background: var(--card2);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; flex-shrink: 0; overflow: hidden;
      img { width: 100%; height: 100%; object-fit: cover; }
    }
    .result-info { flex: 1; min-width: 0; }
    .result-title {
      font-family: 'Poppins', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--white);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .result-author { font-size: 11px; color: var(--gray); margin-top: 2px; }
    .result-year { font-size: 10px; color: var(--gray); margin-top: 2px; }
    .result-tags { display: flex; gap: 4px; margin-top: 5px; }
    .add-btn {
      width: 36px; height: 36px;
      border-radius: 50%;
      border: 1px solid rgba(108,92,231,0.4);
      background: none; color: var(--lavender);
      cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
      i { font-size: 18px; }
      &.added {
        background: var(--teal);
        border-color: var(--teal);
        color: var(--bg);
      }
    }
    .empty-state {
      display: flex; flex-direction: column;
      align-items: center; padding: 48px 20px; gap: 8px;
      .empty-emoji { font-size: 48px; }
      p { color: var(--gray); font-size: 14px; }
      .empty-sub { font-size: 12px; }
    }
    .suggestions { margin-top: 8px; }
    .suggestion-chip {
      display: inline-block;
      margin: 0 8px 8px 0;
      padding: 8px 16px;
      background: var(--card);
      border: 1px solid var(--divider);
      border-radius: 20px;
      color: var(--lavender);
      font-size: 13px; cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: background 0.18s;
      &:active { background: var(--card2); }
    }
    .success-toast {
      position: fixed; bottom: 90px; left: 50%;
      transform: translateX(-50%);
      background: var(--teal); color: var(--bg);
      padding: 10px 20px; border-radius: 20px;
      font-size: 13px; font-weight: 500;
      z-index: 300;
    }
  `]
})
export class SearchComponent {
  private booksService = inject(BooksService);

  query = '';
  results = signal<any[]>([]);
  loading = signal(false);
  searched = signal(false);
  addedBooks = signal<Set<string>>(new Set());
  successMsg = signal('');

  suggestions = ['Harry Potter', 'Dune', 'The Hobbit', 'Sapiens', '1984', 'Atomic Habits'];

  onInput() {
    if (!this.query) {
      this.results.set([]);
      this.searched.set(false);
    }
  }

  setQuery(q: string) {
    this.query = q;
    this.search();
  }

  clear() {
    this.query = '';
    this.results.set([]);
    this.searched.set(false);
  }

  search() {
    if (!this.query.trim()) return;
    this.loading.set(true);
    this.searched.set(false);
    this.booksService.searchBooks(this.query).subscribe({
      next: (books) => {
        this.results.set(books);
        this.loading.set(false);
        this.searched.set(true);
      },
      error: () => {
        this.loading.set(false);
        this.searched.set(true);
      }
    });
  }

  addBook(book: any) {
    if (this.addedBooks().has(book.google_books_id)) return;
    this.booksService.addBookToDb(book).subscribe({
      next: (savedBook) => {
        this.booksService.addBook(savedBook.id, 'to_read').subscribe({
          next: () => {
            const updated = new Set(this.addedBooks());
            updated.add(book.google_books_id);
            this.addedBooks.set(updated);
            this.showSuccess(`"${book.title}" ajouté à ta pile !`);
          }
        });
      },
      error: () => this.showSuccess('Erreur lors de l\'ajout')
    });
  }

  showSuccess(msg: string) {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(''), 3000);
  }
}