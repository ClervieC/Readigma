import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-screen">
      <div class="auth-top">
        <div class="logo">📖 READIGMA</div>
        <div class="tagline">Stop searching. Start discovering.</div>
      </div>

      <div class="auth-card">
        <h2>Bon retour !</h2>
        <p class="subtitle">Connecte-toi pour retrouver ta pile</p>

        @if (error()) {
          <div class="error-box">{{ error() }}</div>
        }

        <div class="form-group">
          <label>Email</label>
          <input type="email" [(ngModel)]="email" placeholder="ton@email.com" />
        </div>

        <div class="form-group">
          <label>Mot de passe</label>
          <input type="password" [(ngModel)]="password" placeholder="••••••••" />
        </div>

        <button class="btn-primary" (click)="login()" [disabled]="loading()">
          @if (loading()) { Connexion... } @else { Se connecter }
        </button>

        <p class="switch-auth">
          Pas encore de compte ?
          <a routerLink="/auth/register">S'inscrire</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-screen {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      background: var(--bg);
    }
    .auth-top {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: 28px;
      color: var(--purple);
      letter-spacing: 1px;
    }
    .tagline {
      font-size: 13px;
      color: var(--gray);
      margin-top: 4px;
    }
    .auth-card {
      width: 100%;
      max-width: 400px;
      background: var(--card);
      border-radius: var(--radius-lg);
      border: 1px solid var(--divider);
      padding: 24px;
    }
    h2 {
      font-size: 22px;
      font-weight: 700;
      color: var(--white);
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: var(--gray);
      margin-bottom: 24px;
    }
    .form-group {
      margin-bottom: 16px;
      label {
        display: block;
        font-size: 12px;
        color: var(--gray);
        margin-bottom: 6px;
        font-weight: 500;
      }
    }
    .btn-primary {
      margin-top: 8px;
      &:disabled { opacity: 0.6; }
    }
    .error-box {
      background: rgba(255, 100, 100, 0.1);
      border: 1px solid rgba(255, 100, 100, 0.3);
      color: #ff6b6b;
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      margin-bottom: 16px;
    }
    .switch-auth {
      text-align: center;
      font-size: 13px;
      color: var(--gray);
      margin-top: 16px;
      a {
        color: var(--lavender);
        text-decoration: none;
        font-weight: 500;
      }
    }
  `]
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal('');

  login() {
    if (!this.email || !this.password) {
      this.error.set('Tous les champs sont requis');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.authService.login(this.email, this.password).subscribe({
      next: () => this.router.navigate(['/discover']),
      error: (err) => {
        this.error.set(err.error?.error || 'Erreur de connexion');
        this.loading.set(false);
      }
    });
  }
}