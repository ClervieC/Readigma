import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private router = inject(Router);
  private authService = inject(AuthService);
  
  activeRoute = 'discover';
  showNav = false;

  constructor() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      const url = e.urlAfterRedirects;
      this.showNav = !url.includes('/auth');
      this.activeRoute = url.replace('/', '').split('/')[0] || 'discover';
    });
  }

  navigate(route: string) {
    this.router.navigate([`/${route}`]);
  }
}