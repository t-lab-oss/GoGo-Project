import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toApiError } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly username = signal('');
  readonly password = signal('');
  readonly usernameError = signal('');
  readonly passwordError = signal('');
  readonly formError = signal('');
  readonly loading = signal(false);

  submit(): void {
    if (this.loading()) return;
    this.formError.set('');
    this.usernameError.set(this.username().trim() ? '' : 'Nhập tên đăng nhập.');
    this.passwordError.set(this.password() ? '' : 'Nhập mật khẩu.');
    if (this.usernameError() || this.passwordError()) return;

    this.loading.set(true);
    this.auth.login(this.username().trim(), this.password()).subscribe({
      next: () => void this.router.navigateByUrl(this.returnUrl()),
      error: (err) => {
        this.loading.set(false);
        this.formError.set(toApiError(err).message);
      },
    });
  }

  /** Chỉ chấp nhận đường dẫn nội bộ, tránh chuyển hướng sang trang lạ. */
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl');
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/trips';
  }
}
