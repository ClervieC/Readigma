import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'discover', pathMatch: 'full' },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
  {
    path: 'discover',
    loadComponent: () => import('./features/discover/discover.component').then(m => m.DiscoverComponent),
    canActivate: [authGuard]
  },
  {
    path: 'library',
    loadComponent: () => import('./features/library/library.component').then(m => m.LibraryComponent),
    canActivate: [authGuard]
  },
  {
    path: 'search',
    loadComponent: () => import('./features/search/search.component').then(m => m.SearchComponent),
    canActivate: [authGuard]
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard]
  },
  { path: '**', redirectTo: 'discover' }
];