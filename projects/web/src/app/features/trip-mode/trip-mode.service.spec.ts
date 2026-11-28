import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { TripWeather } from 'shared';
import { AuthService } from '../../core/auth/auth.service';
import { OfflineDb } from '../../core/offline/offline-db';
import { TripModeService } from './trip-mode.service';

describe('thông báo mưa', () => {
  function setup(days: { date: string; rain: boolean }[]) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: {} },
        { provide: OfflineDb, useValue: {} },
      ],
    });
    const results: boolean[] = [];
    TestBed.inject(TripModeService)
      .notifyRain('t1', '2026-11-28', { days } as TripWeather)
      .subscribe((r) => results.push(r));
    return { http: TestBed.inject(HttpTestingController), results };
  }

  it('hôm nay mưa thì tạo thông báo, khoá trùng theo chuyến và ngày', () => {
    const s = setup([{ date: '2026-11-28', rain: true }]);
    const post = s.http.expectOne('/api/trips/t1/notifications');
    expect(post.request.body).toEqual({ type: 'rain', dedupeKey: 'rain:t1:2026-11-28' });
    post.flush({});
    expect(s.results).toEqual([true]);
    s.http.verify();
  });

  it('chỉ ngày khác mưa thì không tạo', () => {
    const s = setup([
      { date: '2026-11-28', rain: false },
      { date: '2026-11-29', rain: true },
    ]);
    expect(s.results).toEqual([false]);
    s.http.verify();
  });
});
