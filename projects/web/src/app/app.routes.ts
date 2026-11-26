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
  // Route cụ thể ('new') đặt trước ':tripId'
  {
    path: 'trips/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/trips/trip-form/trip-form.component').then((m) => m.TripFormComponent),
  },
  {
    path: 'trips/:tripId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/trips/trip-detail/trip-detail.component').then(
        (m) => m.TripDetailComponent,
      ),
  },
  {
    path: 'trips/:tripId/edit',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/trips/trip-form/trip-form.component').then((m) => m.TripFormComponent),
  },
  {
    path: 'trips/:tripId/members',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/trips/trip-members/trip-members.component').then(
        (m) => m.TripMembersComponent,
      ),
  },
  {
    path: 'trips/:tripId/clusters/:clusterId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/trips/cluster-detail/cluster-detail.component').then(
        (m) => m.ClusterDetailComponent,
      ),
  },
  {
    path: 'trips/:tripId/expenses',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/expenses/expense-list/expense-list.component').then(
        (m) => m.ExpenseListComponent,
      ),
  },
  {
    path: 'trips/:tripId/expenses/:checkinId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/expenses/expense-entry/expense-entry.component').then(
        (m) => m.ExpenseEntryComponent,
      ),
  },
  {
    path: 'trips/:tripId/recap',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/recap/trip-recap/trip-recap.component').then((m) => m.TripRecapComponent),
  },
  {
    path: 'trips/:tripId/recap/:date',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/recap/day-recap/day-recap.component').then((m) => m.DayRecapComponent),
  },
  {
    path: 'trips/:id/mode',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/trip-mode/trip-mode.component').then((m) => m.TripModeComponent),
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
