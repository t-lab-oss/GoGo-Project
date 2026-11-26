import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import type { Cluster, PlaceImage, PlaceImageResult, Trip, TripPlace, TripSummary } from 'shared';
import { zonedParts } from './trip-mode.logic';

export interface TripModeData {
  trip: Trip;
  /** Ngày đang xem "YYYY-MM-DD" theo múi giờ chuyến, nằm trong khoảng ngày của chuyến. */
  date: string;
  clusters: Cluster[];
}

/** Kết quả đọc link Google Maps (API Contract mục 7, bước 1). */
export interface PlaceCandidate {
  source: 'link';
  label: string;
  lat: number;
  lng: number;
  mapsUrl: string;
  matchedBy: 'url';
}

/**
 * Dữ liệu gửi lên khi thêm hoặc sửa quán. Địa chỉ là link thì có mapsUrl (và lat, lng nếu đọc được),
 * địa chỉ viết tay thì có address và mapsUrl, lat, lng đều null.
 */
export interface PlaceInput {
  clusterId: string;
  label: string;
  address: string;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  /** Ảnh minh hoạ lấy từ Wikimedia Commons. null để gỡ ảnh, bỏ trống thì không đổi. */
  image?: PlaceImage | null;
}

/** Lỗi nghiệp vụ của màn Trip Mode, không phải lỗi HTTP. */
export class OutsideTripDaysError extends Error {
  constructor() {
    super('OUTSIDE_TRIP_DAYS');
  }
}

@Injectable({ providedIn: 'root' })
export class TripModeService {
  private readonly http = inject(HttpClient);

  /** Chuyến đang đi gần nhất của người dùng (FR-12), hoặc null. */
  findOngoingTripId(): Observable<string | null> {
    return this.http
      .get<{ items: TripSummary[] }>('/api/trips', {
        params: { status: 'ongoing', sort: 'startDate', limit: 1 },
      })
      .pipe(map((res) => res.items[0]?.id ?? null));
  }

  /**
   * Tải dữ liệu Trip Mode. Cần múi giờ của chuyến để biết "hôm nay" nên phải lấy chuyến trước,
   * rồi mới lấy cụm của ngày đó (API Contract mục 12).
   */
  load(tripId: string, now: Date = new Date()): Observable<TripModeData> {
    return this.http.get<{ trip: Trip }>(`/api/trips/${tripId}`).pipe(
      switchMap(({ trip }) => {
        const date = zonedParts(now, trip.tz).date;
        if (!trip.days.some((d) => d.date === date)) throw new OutsideTripDaysError();
        return this.http
          .get<{ items: Cluster[] }>(`/api/trips/${tripId}/clusters`, {
            params: { date, include: 'places,checkins' },
          })
          .pipe(map((res) => ({ trip, date, clusters: res.items })));
      }),
    );
  }

  /** Đọc tên và toạ độ từ link Google Maps. Không lưu gì. */
  lookupLink(tripId: string, url: string): Observable<PlaceCandidate> {
    return this.http
      .get<{ candidate: PlaceCandidate }>(`/api/trips/${tripId}/place-candidate`, { params: { url } })
      .pipe(map((res) => res.candidate));
  }

  /** Gợi ý ảnh minh hoạ theo tên món (Wikimedia Commons, Gemini là tuỳ chọn để đổi từ khoá). Không lưu gì. */
  searchImages(tripId: string, q: string): Observable<PlaceImageResult[]> {
    return this.http
      .get<{ items: PlaceImageResult[] }>(`/api/trips/${tripId}/place-images`, { params: { q } })
      .pipe(map((res) => res.items));
  }

  createPlace(tripId: string, input: PlaceInput): Observable<TripPlace> {
    return this.http
      .post<{ place: TripPlace }>(`/api/trips/${tripId}/places`, input)
      .pipe(map((res) => res.place));
  }

  updatePlace(tripId: string, placeId: string, input: PlaceInput): Observable<TripPlace> {
    return this.http
      .patch<{ place: TripPlace }>(`/api/trips/${tripId}/places/${placeId}`, input)
      .pipe(map((res) => res.place));
  }
}
