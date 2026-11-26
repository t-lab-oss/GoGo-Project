import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { TripModeService } from '../../trip-mode/trip-mode.service';

/**
 * Tạm thời: có chuyến đang đi thì mở thẳng Trip Mode làm trang chủ (FR-12).
 * Logo trong Trip Mode về đây kèm `?list=1` để không bị chuyển hướng lại. Danh sách chuyến làm ở bước sau (FR-4).
 */
@Component({
  selector: 'app-trip-list',
  imports: [RouterLink],
  templateUrl: './trip-list.component.html',
})
export class TripListComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly tripMode = inject(TripModeService);

  readonly username = computed(() => this.auth.user()?.username ?? '');
  readonly initial = computed(() => this.username().charAt(0).toUpperCase());

  constructor() {
    if (inject(ActivatedRoute).snapshot.queryParamMap.has('list')) return;
    this.tripMode.findOngoingTripId().subscribe({
      next: (id) => {
        if (id) void this.router.navigate(['/trips', id, 'mode'], { replaceUrl: true });
      },
      error: () => {
        // Không tìm được chuyến đang đi thì ở lại trang tạm này.
      },
    });
  }
}
