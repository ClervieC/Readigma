import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { BooksService } from '../../core/services/books.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div class="page-title">Profil</div>
      <button class="icon-btn" (click)="logout()">
        <i class="ti ti-logout"></i>
      </button>
    </div>

    <div class="scroll-area">
      <div class="profile-hero">
        <div class="avatar">{{ getInitials() }}</div>
        <div class="profile-name">{{ user()?.username }}</div>
        <div class="profile-handle">@{{ user()?.username?.toLowerCase() }}</div>
      </div>

      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-num">{{ getCounts().done }}</div>
          <div class="stat-label">Lus</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">{{ getCounts().to_read }}</div>
          <div class="stat-label">À lire</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">{{ getAvgRating() }}</div>
          <div class="stat-label">Moy.</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">{{ getCounts().reading }}</div>
          <div class="stat-label">En cours</div>
        </div>
      </div>

      <div class="section-label">Mes amis lecteurs</div>

      @if (friends().length === 0) {
        <div class="empty-friends">
          <span>👥</span>
          <p>Pas encore d'amis</p>
          <p class="empty-sub">Cherche des lecteurs pour les ajouter</p>
        </div>
      } @else {
        @for (friend of friends(); track friend.id) {
          <div class="friend-row">
            <div class="friend-avatar">{{ friend.username?.slice(0,2).toUpperCase() }}</div>
            <div>
              <div class="friend-name">{{ friend.username }}</div>
              <div class="friend-sub">{{ friend.books_count }} livres lus</div>
            </div>
            <button class="btn-secondary">Voir profil</button>
          </div>
        }
      }

      <div class="section-label" style="margin-top: 24px">Paramètres</div>
      <div class="settings-list">
        <div class="settings-item">
          <i class="ti ti-bell"></i>
          <span>Notifications</span>
          <i class="ti ti-chevron-right"></i>
        </div>
        <div class="settings-item">
          <i class="ti ti-lock"></i>
          <span>Confidentialité</span>
          <i class="ti ti-chevron-right"></i>
        </div>
        <div class="settings-item">
          <i class="ti ti-bulb"></i>
          <span>Suggérer un livre</span>
          <i class="ti ti-chevron-right"></i>
        </div>
        <div class="settings-item danger" (click)="logout()">
          <i class="ti ti-logout"></i>
          <span>Se déconnecter</span>
          <i class="ti ti-chevron-right"></i>
        </div>
      </div>
    </div>
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
    .profile-hero {
      display: flex; flex-direction: column;
      align-items: center; padding: 8px 0 20px;
    }
    .avatar {
      width: 72px; height: 72px;
      border-radius: 50%;
      background: var(--purple);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Poppins', sans-serif;
      font-weight: 700; font-size: 26px; color: white;
      margin-bottom: 10px;
    }
    .profile-name {
      font-family: 'Poppins', sans-serif;
      font-weight: 700; font-size: 18px; color: var(--white);
    }
    .profile-handle { font-size: 12px; color: var(--gray); margin-top: 3px; }
    .stats-grid {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 8px; margin: 4px 0 20px;
    }
    .stat-box {
      background: var(--card);
      border-radius: var(--radius-md);
      padding: 12px 6px; text-align: center;
      border: 1px solid var(--divider);
    }
    .stat-num {
      font-family: 'Poppins', sans-serif;
      font-weight: 700; font-size: 18px; color: var(--purple);
    }
    .stat-label { font-size: 9px; color: var(--gray); margin-top: 2px; }
    .empty-friends {
      display: flex; flex-direction: column;
      align-items: center; padding: 32px 20px; gap: 6px;
      span { font-size: 40px; }
      p { color: var(--gray); font-size: 14px; }
      .empty-sub { font-size: 12px; }
    }
    .friend-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid var(--divider);
    }
    .friend-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: rgba(108,92,231,0.2);
      color: var(--lavender);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700;
      font-family: 'Poppins', sans-serif; flex-shrink: 0;
    }
    .friend-name { font-size: 13px; font-weight: 500; color: var(--white); }
    .friend-sub { font-size: 10px; color: var(--gray); }
    .settings-list {
      background: var(--card);
      border-radius: var(--radius-md);
      border: 1px solid var(--divider);
      overflow: hidden;
      margin-bottom: 32px;
    }
    .settings-item {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--divider);
      cursor: pointer;
      transition: background 0.18s;
      &:last-child { border-bottom: none; }
      &:active { background: var(--card2); }
      i:first-child { font-size: 18px; color: var(--lavender); }
      span { flex: 1; font-size: 14px; color: var(--white); }
      i:last-child { font-size: 16px; color: var(--gray); }
      &.danger {
        i:first-child { color: #ff6b6b; }
        span { color: #ff6b6b; }
      }
    }
  `]
})
export class ProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private booksService = inject(BooksService);
  private http = inject(HttpClient);

  user = this.authService.currentUser;
  allBooks = signal<any[]>([]);
  friends = signal<any[]>([]);

  ngOnInit() {
    this.booksService.getMyBooks().subscribe({
      next: (books) => this.allBooks.set(books),
      error: () => {}
    });
    this.http.get<any[]>(`${environment.apiUrl}/friends`).subscribe({
      next: (friends) => this.friends.set(friends),
      error: () => {}
    });
  }

  getInitials() {
    const name = this.user()?.username || '';
    return name.slice(0, 2).toUpperCase();
  }

  getCounts() {
    const counts: any = { done: 0, to_read: 0, reading: 0, dnf: 0 };
    this.allBooks().forEach(b => {
      if (counts[b.status] !== undefined) counts[b.status]++;
    });
    return counts;
  }

  getAvgRating() {
    const rated = this.allBooks().filter(b => b.rating);
    if (!rated.length) return '—';
    const avg = rated.reduce((sum, b) => sum + parseFloat(b.rating), 0) / rated.length;
    return avg.toFixed(1) + '★';
  }

  logout() { this.authService.logout(); }
}