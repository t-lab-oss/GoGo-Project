import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, firstValueFrom, map, shareReplay, tap } from 'rxjs';
import type { AuthResponse, User } from 'shared';

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  /** Access token chỉ giữ trong bộ nhớ. Refresh token nằm trong cookie httpOnly. */
  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<User | null>(null);
  private refreshing$: Observable<string> | null = null;

  readonly accessToken = this._accessToken.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);

  login(username: string, password: string): Observable<User> {
    return this.http.post<AuthResponse>('/api/sessions', { username, password }).pipe(
      tap((res) => {
        this._accessToken.set(res.accessToken);
        this._user.set(res.user);
      }),
      map((res) => res.user),
    );
  }

  /** Làm mới access token. Nhiều request 401 cùng lúc chỉ gọi một lần. */
  refresh(): Observable<string> {
    if (!this.refreshing$) {
      this.refreshing$ = this.http.put<RefreshResponse>('/api/sessions/current', null).pipe(
        tap((res) => this._accessToken.set(res.accessToken)),
        map((res) => res.accessToken),
        finalize(() => (this.refreshing$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshing$;
  }

  /** Gọi lúc mở app: khôi phục phiên từ cookie nếu còn hạn. Không bao giờ ném lỗi. */
  async restoreSession(): Promise<void> {
    try {
      await firstValueFrom(this.refresh());
      const res = await firstValueFrom(this.http.get<{ user: User }>('/api/users/me'));
      this._user.set(res.user);
    } catch {
      this.clear();
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.delete('/api/sessions/current'));
    } catch {
      // Dù máy chủ lỗi vẫn đăng xuất ở máy này.
    }
    this.clear();
  }

  clear(): void {
    this._accessToken.set(null);
    this._user.set(null);
  }
}
