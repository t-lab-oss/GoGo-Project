import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type { Trip } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { AuthService } from '../../../core/auth/auth.service';
import { AvatarComponent } from '../../../ui/avatar.component';
import { BackLinkComponent } from '../../../ui/back-link.component';

@Component({
  selector: 'app-trip-members',
  imports: [FormsModule, AvatarComponent, BackLinkComponent],
  templateUrl: './trip-members.component.html',
})
export class TripMembersComponent {
  private readonly api = inject(TripsApi);
  private readonly auth = inject(AuthService);
  readonly tripId = inject(ActivatedRoute).snapshot.paramMap.get('tripId') ?? '';

  readonly trip = signal<Trip | null>(null);
  readonly error = signal('');
  readonly inviteError = signal('');
  readonly inviting = signal(false);
  readonly justAdded = signal('');
  identifier = '';

  constructor() {
    this.reload();
  }

  isMe(userId: string): boolean {
    return this.auth.user()?.id === userId;
  }

  isOwner(): boolean {
    const t = this.trip();
    return !!t && t.ownerId === this.auth.user()?.id;
  }

  invite(): void {
    const value = this.identifier.trim();
    if (!value) return;
    this.inviting.set(true);
    this.inviteError.set('');
    this.justAdded.set('');
    this.api.addMember(this.tripId, value).subscribe({
      next: (member) => {
        this.inviting.set(false);
        this.identifier = '';
        this.justAdded.set(member.username);
        this.reload();
      },
      error: (err) => {
        this.inviting.set(false);
        this.inviteError.set(toApiError(err).message);
      },
    });
  }

  remove(userId: string): void {
    this.api.removeMember(this.tripId, userId).subscribe({
      next: () => this.reload(),
      error: (err) => this.error.set(toApiError(err).message),
    });
  }

  private reload(): void {
    this.api.getTrip(this.tripId).subscribe({
      next: (trip) => this.trip.set(trip),
      error: (err) => this.error.set(toApiError(err).message),
    });
  }
}
