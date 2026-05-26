import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  
  currentUser = signal<any>(null);

  constructor() {
    const user = localStorage.getItem('readigma_user');
    if (user) this.currentUser.set(JSON.parse(user));
  }

  register(username: string, email: string, password: string) {
    return this.http.post<any>(`${environment.apiUrl}/auth/register`, { username, email, password })
      .pipe(tap(res => this.saveSession(res)));
  }

  login(email: string, password: string) {
    return this.http.post<any>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap(res => this.saveSession(res)));
  }

  private saveSession(res: any) {
    localStorage.setItem('readigma_token', res.token);
    localStorage.setItem('readigma_user', JSON.stringify(res.user));
    this.currentUser.set(res.user);
  }

  logout() {
    localStorage.removeItem('readigma_token');
    localStorage.removeItem('readigma_user');
    this.currentUser.set(null);
    this.router.navigate(['/auth/login']);
  }

  isLoggedIn() {
    return !!localStorage.getItem('readigma_token');
  }
}