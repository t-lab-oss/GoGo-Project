import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-account',
  imports: [RouterLink],
  templateUrl: './account.component.html',
})
export class AccountComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly initial = computed(() => (this.user()?.username ?? '').charAt(0).toUpperCase());
  readonly copied = signal(false);
  readonly copyFailed = signal(false);
  readonly loggingOut = signal(false);

  async copyId(): Promise<void> {
    const id = this.user()?.publicId;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      this.copyFailed.set(false);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copyFailed.set(true);
    }
  }

  async logout(): Promise<void> {
    this.loggingOut.set(true);
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
