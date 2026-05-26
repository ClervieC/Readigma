import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BooksService } from '../../core/services/books.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div>
        <div class="greeting-sub">Bonsoir,</div>
        <div class="logo-text">Readigma</div>
      </div>
      <button class="icon-btn">
        <i class="ti ti-bell"></i>
      </button>
    </div>

    <div class="scroll-area">
      <p class="subtitle">Quel sera ton prochain livre ?</p>

      <div class="filter-row">
        @for (f of filters; track f.value) {
          <button class="chip" [class.active]="activeFilter === f.value"
                  (click)="setFilter(f.value)">
            {{ f.label }}
          </button>
        }
      </div>

      <div class="rand-card" [class.revealed]="currentBook()">
        @if (!currentBook()) {
          <div class="rand-placeholder">
            <span class="rand-emoji">🎲</span>
            <p>Lance le dé pour découvrir<br>ton prochain livre !</p>
          </div>
        } @else {
          <div class="rand-result">
            <div class="book-cover-big">{{ currentBook().cover_emoji || '📚' }}</div>
            <div class="book-details">
              <div class="book-title">{{ currentBook().title }}</div>
              <div class="book-author">{{ currentBook().author }}</div>
              <div class="book-genre-badge">{{ currentBook().genres?.[0] || 'Fiction' }}</div>
            </div>
          </div>
        }
      </div>

      <button class="btn-primary spin-btn" (click)="spin()" [disabled]="spinning()">
        <span class="dice-emoji" [class.spinning]="spinning()">🎲</span>
        {{ spinning() ? 'En cours...' : 'Choisir pour moi !' }}
      </button>

      @if (currentBook()) {
        <div class="actions-row">
          <button class="act-btn teal" (click)="addToReading()">
            <i class="ti ti-book"></i> Je lis ça !
          </button>
          <button class="act-btn" (click)="spin()">
            <i class="ti ti-refresh"></i> Autre livre
          </button>
        </div>
      }

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }

      <div class="section-label">
        Récemment ajoutés
        <span class="see-all" (click)="router.navigate(['/library'])">Voir tout</span>
      </div>
      <div class="h-scroll">
        @for (book of recentBooks(); track book.id) {
          <div class="mini-card">
            <div class="mini-cover">{{ book.cover_emoji || '📚' }}</div>
            <div class="mini-title">{{ book.title }}</div>
            <div class="mini-author">{{ book.author?.split(' ').slice(-1)[0] }}</div>
          </div>
        }
        @if (recentBooks().length === 0) {
          <div class="empty-hint">Ajoute des livres à ta pile !</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .greeting-sub { font-size: 11px; color: var(--gray); }
    .logo-text {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 20px;
      color: var(--purple);
    }
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
    .subtitle { font-size: 12px; color: var(--gray); margin-bottom: 12px; }
    .filter-row {
      display: flex; gap: 8px;
      overflow-x: auto; padding-bottom: 4px;
      scrollbar-width: none; margin-bottom: 16px;
      &::-webkit-scrollbar { display: none; }
    }
    .rand-card {
      background: var(--card);
      border-radius: var(--radius-lg);
      border: 2px solid var(--divider);
      padding: 24px;
      margin-bottom: 14px;
      min-height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.3s;
      &.revealed { border-color: var(--teal); }
    }
    .rand-placeholder {
      text-align: center;
      .rand-emoji { font-size: 48px; display: block; margin-bottom: 12px; }
      p { font-size: 14px; color: var(--gray); line-height: 1.5; }
    }
    .rand-result {
      display: flex; gap: 16px; align-items: center; width: 100%;
    }
    .book-cover-big {
      width: 72px; height: 100px;
      background: var(--card2);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 40px; flex-shrink: 0;
    }
    .book-details { flex: 1; }
    .book-title {
      font-family: 'Poppins', sans-serif;
      font-weight: 700; font-size: 15px;
      color: var(--white); margin-bottom: 4px;
    }
    .book-author { font-size: 12px; color: var(--gray); margin-bottom: 8px; }
    .book-genre-badge {
      display: inline-block;
      font-size: 10px; color: var(--teal);
      background: rgba(0,206,201,0.1);
      padding: 3px 10px; border-radius: 20px;
    }
    .spin-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
    }
    .dice-emoji {
      font-size: 20px;
      display: inline-block;
    }
    @keyframes wiggle {
      0%,100% { transform: rotate(0deg); }
      25% { transform: rotate(-20deg); }
      75% { transform: rotate(20deg); }
    }
    .dice-emoji.spinning { animation: wiggle 0.25s ease-in-out infinite; }
    .actions-row {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 10px; margin-top: 12px;
    }
    .act-btn {
      padding: 13px;
      border-radius: var(--radius-md);
      border: 1px solid rgba(108,92,231,0.3);
      background: var(--card);
      color: var(--lavender);
      font-size: 13px; font-weight: 500;
      cursor: pointer; font-family: 'Inter', sans-serif;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      transition: background 0.18s;
      i { font-size: 16px; }
      &.teal {
        border-color: rgba(0,206,201,0.3);
        color: var(--teal);
      }
      &:active { background: var(--card2); }
    }
    .error-msg {
      text-align: center; font-size: 13px;
      color: #ff6b6b; margin: 8px 0;
    }
    .h-scroll {
      display: flex; gap: 10px;
      overflow-x: auto;
      margin: 0 -16px; padding: 0 16px 6px;
      scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }
    .mini-card {
      flex-shrink: 0; width: 110px;
      background: var(--card);
      border-radius: var(--radius-md);
      padding: 12px;
      display: flex; flex-direction: column;
      align-items: center; gap: 6px;
      border: 1px solid var(--divider);
    }
    .mini-cover {
      width: 44px; height: 60px;
      background: var(--card2);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px;
    }
    .mini-title {
      font-size: 11px; font-weight: 500;
      color: var(--white); text-align: center;
      line-height: 1.3;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .mini-author { font-size: 10px; color: var(--gray); text-align: center; }
    .empty-hint { font-size: 12px; color: var(--gray); padding: 20px 0; }
  `]
})
export class DiscoverComponent implements OnInit {
  private booksService = inject(BooksService);
  router = inject(Router);

  filters = [
    { label: 'Tout', value: 'all' },
    { label: 'Fantasy', value: 'Fantasy' },
    { label: 'Thriller', value: 'Thriller' },
    { label: 'Romance', value: 'Romance' },
    { label: 'Sci-Fi', value: 'Science Fiction' },
    { label: 'Classiques', value: 'Fiction' },
  ];

  activeFilter = 'all';
  spinning = signal(false);
  currentBook = signal<any>(null);
  recentBooks = signal<any[]>([]);
  error = signal('');

  ngOnInit() {
    this.booksService.getMyBooks('to_read').subscribe({
      next: (books) => this.recentBooks.set(books.slice(0, 6)),
      error: () => {}
    });
  }

  setFilter(value: string) {
    this.activeFilter = value;
    this.currentBook.set(null);
    this.error.set('');
  }

  spin() {
    this.spinning.set(true);
    this.error.set('');
    this.currentBook.set(null);
    const genre = this.activeFilter !== 'all' ? this.activeFilter : undefined;
    setTimeout(() => {
      this.booksService.randomize(genre).subscribe({
        next: (book) => {
          this.currentBook.set(book);
          this.spinning.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.error || 'Aucun livre trouvé avec ce filtre');
          this.spinning.set(false);
        }
      });
    }, 1500);
  }

  addToReading() {
    if (!this.currentBook()) return;
    this.booksService.updateBook(this.currentBook().id, { status: 'reading' }).subscribe({
      next: () => {
        this.error.set('');
        this.router.navigate(['/library']);
      },
      error: () => this.error.set('Erreur lors de l\'ajout')
    });
  }
}