import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'trips',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/trips/trip-list/trip-list.component').then((m) => m.TripListComponent),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account/account.component').then((m) => m.AccountComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'trips' },
  { path: '**', redirectTo: 'trips' },
];
