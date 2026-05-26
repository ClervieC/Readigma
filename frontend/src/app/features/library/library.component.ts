import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BooksService } from '../../core/services/books.service';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div class="page-title">Ma Bibliothèque</div>
      <button class="icon-btn" (click)="router.navigate(['/search'])">
        <i class="ti ti-plus"></i>
      </button>
    </div>

    <div class="lib-tabs">
      @for (tab of tabs; track tab.value) {
        <button class="lib-tab" [class.active]="activeTab === tab.value"
                (click)="setTab(tab.value)">
          {{ tab.label }}
          @if (getCounts()[tab.value]) {
            <span class="tab-count">{{ getCounts()[tab.value] }}</span>
          }
        </button>
      }
    </div>

    <div class="scroll-area">
      @if (loading()) {
        <div class="loading">Chargement...</div>
      } @else if (filteredBooks().length === 0) {
        <div class="empty-state">
          <span class="empty-emoji">📚</span>
          <p>Aucun livre ici</p>
          <button class="btn-secondary" (click)="router.navigate(['/search'])">
            Ajouter un livre
          </button>
        </div>
      } @else {
        @for (book of filteredBooks(); track book.id) {
          <div class="book-item">
            <div class="book-cover">{{ book.cover_emoji || '📚' }}</div>
            <div class="book-info">
              <div class="book-title">{{ book.title }}</div>
              <div class="book-author">{{ book.author }}</div>
              <div class="book-tags">
                @for (genre of book.genres?.slice(0,2); track genre) {
                  <span class="tag">{{ genre }}</span>
                }
              </div>
            </div>
            <div class="book-right">
              @if (book.rating) {
                <div class="rating">
                  <i class="ti ti-star-filled"></i>
                  {{ book.rating }}
                </div>
              }
              <button class="more-btn" (click)="openActions(book)">
                <i class="ti ti-dots-vertical"></i>
              </button>
            </div>
          </div>
        }
      }
    </div>

    @if (selectedBook()) {
      <div class="bottom-sheet-overlay" (click)="closeActions()">
        <div class="bottom-sheet" (click)="$event.stopPropagation()">
          <div class="sheet-handle"></div>
          <div class="sheet-book-title">{{ selectedBook().title }}</div>

          <div class="rating-section">
            <div class="rating-label">Note</div>
            <div class="stars-row">
              @for (star of [1,2,3,4,5]; track star) {
                <button class="star-btn" (click)="setRating(star)">
                  <i class="ti" [class.ti-star-filled]="currentRating() >= star"
                     [class.ti-star]="currentRating() < star"></i>
                </button>
              }
              <span class="rating-value">{{ currentRating() }}/5</span>
            </div>
          </div>

          <div class="sheet-actions">
            @for (status of statusOptions; track status.value) {
              <button class="sheet-btn" (click)="changeStatus(status.value)">
                <i class="ti {{ status.icon }}"></i>
                {{ status.label }}
              </button>
            }
            <button class="sheet-btn danger" (click)="removeBook()">
              <i class="ti ti-trash"></i> Retirer de ma liste
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .icon-btn {
      width: 38px; height: 38px;
      border-radius: 12px;
      background: var(--card);
      border: 1px solid var(--divider);
      color: var(--lavender);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      i { font-size: 18px; }
    }
    .lib-tabs {
      display: flex;
      background: var(--card);
      border-radius: var(--radius-md);
      padding: 4px;
      margin: 0 16px 8px;
    }
    .lib-tab {
      flex: 1; padding: 8px 4px;
      border-radius: 12px;
      font-size: 11px; text-align: center;
      cursor: pointer; border: none;
      background: none; color: var(--gray);
      font-family: 'Inter', sans-serif; font-weight: 500;
      transition: all 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 4px;
      &.active { background: var(--purple); color: white; }
    }
    .tab-count {
      background: rgba(255,255,255,0.2);
      border-radius: 10px;
      padding: 0 5px;
      font-size: 9px;
    }
    .loading {
      text-align: center; padding: 40px;
      color: var(--gray); font-size: 14px;
    }
    .empty-state {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 60px 20px; gap: 12px;
      .empty-emoji { font-size: 48px; }
      p { color: var(--gray); font-size: 14px; }
    }
    .book-item {
      display: flex; gap: 12px;
      padding: 12px;
      background: var(--card);
      border-radius: var(--radius-md);
      margin-bottom: 8px;
      align-items: center;
      border: 1px solid var(--divider);
    }
    .book-cover {
      width: 42px; height: 58px;
      background: var(--card2);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; flex-shrink: 0;
    }
    .book-info { flex: 1; min-width: 0; }
    .book-title {
      font-family: 'Poppins', sans-serif;
      font-size: 13px; font-weight: 700;
      color: var(--white);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .book-author { font-size: 11px; color: var(--gray); margin-top: 2px; }
    .book-tags { display: flex; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
    .book-right {
      display: flex; flex-direction: column;
      align-items: flex-end; gap: 6px; flex-shrink: 0;
    }
    .rating {
      display: flex; align-items: center; gap: 3px;
      font-size: 11px; color: var(--purple);
      i { font-size: 11px; }
    }
    .more-btn {
      background: none; border: none;
      color: var(--gray); cursor: pointer;
      i { font-size: 18px; }
    }
    .bottom-sheet-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 200;
      display: flex; align-items: flex-end;
    }
    .bottom-sheet {
      width: 100%; max-width: 430px;
      margin: 0 auto;
      background: var(--card);
      border-radius: 24px 24px 0 0;
      padding: 12px 20px 40px;
    }
    .sheet-handle {
      width: 40px; height: 4px;
      background: var(--divider);
      border-radius: 4px;
      margin: 0 auto 16px;
    }
    .sheet-book-title {
      font-family: 'Poppins', sans-serif;
      font-weight: 700; font-size: 16px;
      color: var(--white); margin-bottom: 20px;
      text-align: center;
    }
    .rating-section { margin-bottom: 20px; }
    .rating-label { font-size: 12px; color: var(--gray); margin-bottom: 8px; }
    .stars-row {
      display: flex; align-items: center; gap: 8px;
    }
    .star-btn {
      background: none; border: none; cursor: pointer;
      i { font-size: 28px; color: var(--purple); }
      .ti-star { color: var(--gray); }
    }
    .rating-value { font-size: 13px; color: var(--gray); margin-left: 4px; }
    .sheet-actions { display: flex; flex-direction: column; gap: 8px; }
    .sheet-btn {
      padding: 14px 16px;
      background: var(--card2);
      border: 1px solid var(--divider);
      border-radius: var(--radius-md);
      color: var(--white);
      font-size: 14px; font-weight: 500;
      cursor: pointer; font-family: 'Inter', sans-serif;
      display: flex; align-items: center; gap: 10px;
      transition: background 0.18s;
      i { font-size: 18px; color: var(--lavender); }
      &.danger { color: #ff6b6b; i { color: #ff6b6b; } }
      &:active { background: var(--bg); }
    }
  `]
})
export class LibraryComponent implements OnInit {
  private booksService = inject(BooksService);
  router = inject(Router);

  tabs = [
    { label: 'À lire', value: 'to_read' },
    { label: 'En cours', value: 'reading' },
    { label: 'Lus', value: 'done' },
    { label: 'DNF', value: 'dnf' },
  ];

  statusOptions = [
    { label: 'À lire', value: 'to_read', icon: 'ti-bookmark' },
    { label: 'En cours', value: 'reading', icon: 'ti-book' },
    { label: 'Lu', value: 'done', icon: 'ti-check' },
    { label: 'Pas fini (DNF)', value: 'dnf', icon: 'ti-x' },
  ];

  activeTab = 'to_read';
  allBooks = signal<any[]>([]);
  filteredBooks = signal<any[]>([]);
  loading = signal(true);
  selectedBook = signal<any>(null);
  currentRating = signal(0);

  ngOnInit() { this.loadBooks(); }

  loadBooks() {
    this.loading.set(true);
    this.booksService.getMyBooks().subscribe({
      next: (books) => {
        this.allBooks.set(books);
        this.filterBooks();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  setTab(tab: string) {
    this.activeTab = tab;
    this.filterBooks();
  }

  filterBooks() {
    this.filteredBooks.set(this.allBooks().filter(b => b.status === this.activeTab));
  }

  getCounts() {
    const counts: any = {};
    this.allBooks().forEach(b => {
      counts[b.status] = (counts[b.status] || 0) + 1;
    });
    return counts;
  }

  openActions(book: any) {
    this.selectedBook.set(book);
    this.currentRating.set(book.rating || 0);
  }

  closeActions() { this.selectedBook.set(null); }

  setRating(star: number) {
    this.currentRating.set(star);
    this.booksService.updateBook(this.selectedBook().book_id, { rating: star }).subscribe();
  }

  changeStatus(status: string) {
    this.booksService.updateBook(this.selectedBook().book_id, { status }).subscribe({
      next: () => { this.closeActions(); this.loadBooks(); }
    });
  }

  removeBook() {
    this.booksService.removeBook(this.selectedBook().book_id).subscribe({
      next: () => { this.closeActions(); this.loadBooks(); }
    });
  }
}