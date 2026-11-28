import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap, timeout } from 'rxjs';
import type {
  Checkin,
  Expense,
  ExpensesByDay,
  CheckinInput,
  CheckinResult,
  Cluster,
  Moment,
  MomentInput,
  PlaceImage,
  PlaceImageResult,
  Trip,
  TripPlace,
  TripSummary,
  UploadTickets,
} from 'shared';
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

/** Quá thời gian này thì coi là lỗi mạng để người dùng bấm thử lại. */
const API_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;

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

  /** Xin signed URL để tải ảnh và thumbnail của một khoảnh khắc. */
  requestUpload(tripId: string, momentId: string): Observable<UploadTickets> {
    return this.http
      .post<UploadTickets>(`/api/trips/${tripId}/uploads`, {
        momentIds: [momentId],
        contentType: 'image/jpeg',
      })
      .pipe(timeout(API_TIMEOUT_MS));
  }

  /** Tải thẳng lên kho ảnh. Dùng fetch để token đăng nhập không bị gửi sang máy chủ khác. */
  async uploadFile(url: string, file: Blob): Promise<void> {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': file.type, 'x-upsert': 'true' },
      body: file,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`UPLOAD_FAILED_${res.status}`);
  }

  putCheckin(tripId: string, checkinId: string, body: CheckinInput): Observable<CheckinResult> {
    return this.http
      .put<CheckinResult>(`/api/trips/${tripId}/checkins/${checkinId}`, body)
      .pipe(timeout(API_TIMEOUT_MS));
  }

  putMoment(tripId: string, momentId: string, body: MomentInput): Observable<Moment> {
    return this.http.put<{ moment: Moment }>(`/api/trips/${tripId}/moments/${momentId}`, body).pipe(
      timeout(API_TIMEOUT_MS),
      map((res) => res.moment),
    );
  }

  /** Ảnh mới nhất của album cho ô nhỏ ở Trip Mode (API Contract mục 12). */
  latestMoment(tripId: string): Observable<Moment | null> {
    return this.http
      .get<{ items: Moment[] }>(`/api/trips/${tripId}/moments`, { params: { limit: 1 } })
      .pipe(map((res) => res.items[0] ?? null));
  }

  /** Ảnh trong một ngày (mới nhất trước), dùng làm ảnh thẻ cho quán đã check-in. */
  momentsOfDay(tripId: string, date: string): Observable<Moment[]> {
    return this.http
      .get<{ items: Moment[] }>(`/api/trips/${tripId}/moments`, { params: { date, limit: 100 } })
      .pipe(map((res) => res.items));
  }

  /** Album chung, mới nhất trước, phân trang bằng con trỏ. */
  album(tripId: string, cursor: string | null): Observable<{ items: Moment[]; nextCursor: string | null }> {
    return this.http.get<{ items: Moment[]; nextCursor: string | null }>(`/api/trips/${tripId}/moments`, {
      params: { limit: 30, ...(cursor ? { cursor } : {}) },
    });
  }

  updateMoment(tripId: string, momentId: string, changes: { note: string; placeLabel: string }): Observable<Moment> {
    return this.http
      .patch<{ moment: Moment }>(`/api/trips/${tripId}/moments/${momentId}`, changes)
      .pipe(map((res) => res.moment));
  }

  deleteMoment(tripId: string, momentId: string): Observable<unknown> {
    return this.http.delete(`/api/trips/${tripId}/moments/${momentId}`);
  }

  /** Check-in mới nhất chưa nhập tiền và chưa bị chuyển vào chuông (FR-16). */
  pendingExpense(tripId: string): Observable<Checkin | null> {
    return this.http
      .get<{ items: Checkin[] }>(`/api/trips/${tripId}/checkins`, {
        params: { expenseStatus: 'missing', reminder: 'active', sort: '-takenAt', limit: 1 },
      })
      .pipe(map((res) => res.items[0] ?? null));
  }

  /** Gửi số lần bỏ qua tuyệt đối nên gửi lại không đếm dư. */
  skipExpenseReminder(tripId: string, checkinId: string, skipCount: number): Observable<Checkin> {
    return this.http
      .patch<{ checkin: Checkin }>(`/api/trips/${tripId}/checkins/${checkinId}`, {
        expenseReminder: { skipCount },
      })
      .pipe(map((res) => res.checkin));
  }

  putExpense(tripId: string, checkinId: string, amount: number, note: string): Observable<Expense> {
    return this.http
      .put<{ expense: Expense }>(`/api/trips/${tripId}/checkins/${checkinId}/expense`, { amount, note })
      .pipe(
        timeout(API_TIMEOUT_MS),
        map((res) => res.expense),
      );
  }

  expensesByDay(tripId: string): Observable<ExpensesByDay> {
    return this.http.get<ExpensesByDay>(`/api/trips/${tripId}/expenses`, { params: { groupBy: 'day' } });
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
