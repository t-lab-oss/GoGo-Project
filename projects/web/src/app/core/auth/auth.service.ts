import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, firstValueFrom, map, shareReplay, tap } from 'rxjs';
import type { AuthResponse, User } from 'shared';
import { isNetworkError } from '../offline/network';
import { OfflineDb } from '../offline/offline-db';

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

/** Chỉ nhớ tên và ID để mở app lúc offline, không lưu token. */
const USER_KEY = 'gogo.user';

function readUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Không lưu được thì chỉ mất khả năng mở app khi offline.
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly offline = inject(OfflineDb);

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
        this.setUser(res.user);
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
      this.setUser(res.user);
    } catch (err) {
      // Mất mạng thì vẫn mở app bằng người dùng đã đăng nhập; có mạng lại sẽ xin token mới.
      const remembered = isNetworkError(err) ? readUser() : null;
      if (remembered) this._user.set(remembered);
      else this.clear();
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.delete('/api/sessions/current'));
    } catch {
      // Dù máy chủ lỗi vẫn đăng xuất ở máy này.
    }
    this.clear();
    // Đăng xuất thì xoá dữ liệu chuyến đã lưu trên máy. Hàng đợi chưa gửi được giữ lại.
    await this.offline.clearCache();
  }

  clear(): void {
    this._accessToken.set(null);
    this._user.set(null);
    writeUser(null);
  }

  private setUser(user: User): void {
    this._user.set(user);
    writeUser(user);
  }
}
