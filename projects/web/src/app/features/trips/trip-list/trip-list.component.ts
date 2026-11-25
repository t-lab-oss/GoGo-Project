import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

/** Tạm thời: chỉ là trang đích sau đăng nhập. Danh sách chuyến làm ở bước sau (FR-4). */
@Component({
  selector: 'app-trip-list',
  imports: [RouterLink],
  templateUrl: './trip-list.component.html',
})
export class TripListComponent {
  private readonly auth = inject(AuthService);
  readonly username = computed(() => this.auth.user()?.username ?? '');
  readonly initial = computed(() => this.username().charAt(0).toUpperCase());
}
