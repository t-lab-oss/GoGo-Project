import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { avatarFromFile } from '../trip-mode/camera/photo';

@Component({
  selector: 'app-account',
  imports: [RouterLink, AvatarComponent],
  templateUrl: './account.component.html',
})
export class AccountComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly avatarSaving = signal(false);
  readonly avatarError = signal('');
  readonly copied = signal(false);
  readonly copyFailed = signal(false);
  readonly loggingOut = signal(false);

  async onAvatarFile(event: Event): Promise<void> {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    // Xoá giá trị để chọn lại đúng ảnh đó vẫn nhận được.
    field.value = '';
    if (!file || this.avatarSaving()) return;
    this.avatarSaving.set(true);
    this.avatarError.set('');
    let image: string;
    try {
      image = await avatarFromFile(file);
    } catch {
      this.avatarError.set('Không đọc được ảnh này, hãy chọn ảnh khác.');
      this.avatarSaving.set(false);
      return;
    }
    await this.saveAvatar(image);
  }

  async removeAvatar(): Promise<void> {
    if (this.avatarSaving()) return;
    this.avatarSaving.set(true);
    this.avatarError.set('');
    await this.saveAvatar(null);
  }

  private async saveAvatar(image: string | null): Promise<void> {
    try {
      await firstValueFrom(this.auth.setAvatar(image));
    } catch (err) {
      this.avatarError.set(toApiError(err).message);
    } finally {
      this.avatarSaving.set(false);
    }
  }

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
