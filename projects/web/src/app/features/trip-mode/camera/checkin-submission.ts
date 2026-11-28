import { Observable, firstValueFrom } from 'rxjs';
import { newClientId } from 'shared';
import type { Checkin, CheckinInput, CheckinResult, Moment, MomentInput, UploadTickets } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import type { CapturedPhoto } from './photo';

export interface Location {
  lat: number;
  lng: number;
}

export interface CheckinApi {
  requestUpload(tripId: string, momentId: string): Observable<UploadTickets>;
  uploadFile(url: string, file: Blob): Promise<void>;
  putCheckin(tripId: string, checkinId: string, body: CheckinInput): Observable<CheckinResult>;
  putMoment(tripId: string, momentId: string, body: MomentInput): Observable<Moment>;
}

/**
 * created: check-in mới. joined: người khác đã check-in quán hôm nay, ảnh của mình vào album.
 * already: đã có check-in và mình không gửi ảnh.
 */
export type CheckinOutcome =
  | { kind: 'created'; checkin: Checkin; moment: Moment | null }
  | { kind: 'joined'; checkin: null; moment: Moment }
  | { kind: 'already'; checkin: null; moment: null }
  /** Lưu khoảnh khắc (không check-in). */
  | { kind: 'moment'; checkin: null; moment: Moment };

/**
 * Một lần check-in. ID, ảnh, giờ và vị trí cố định từ lúc chụp, nên gửi lại sau lỗi là idempotent
 * (API Contract mục 1): cùng ID thì server trả bản đã có.
 */
export class CheckinSubmission {
  readonly checkinId = newClientId();
  readonly momentId: string | null;
  /** Số sao chọn ở màn xem ảnh, đặt trước lần gửi đầu tiên. */
  rating: number | null = null;
  /** Câu đánh giá viết ở màn xem ảnh. */
  review = '';
  /** Mô tả ảnh. */
  caption = '';
  private uploaded = false;
  /** Check-in của người khác cho quán này hôm nay (nhận từ 409 ALREADY_CHECKED_IN). */
  private existingCheckinId: string | null = null;

  constructor(
    private readonly api: CheckinApi,
    private readonly data: {
      tripId: string;
      placeId: string;
      takenAt: Date;
      photo: CapturedPhoto | null;
      location: Promise<Location | null>;
    },
  ) {
    this.momentId = data.photo ? newClientId() : null;
  }

  async submit(): Promise<CheckinOutcome> {
    try {
      await this.upload();
      if (this.existingCheckinId) return await this.join(this.existingCheckinId);
      return await this.create();
    } catch (err) {
      // Server không thấy file: lần thử lại sẽ tải lên lại.
      if (toApiError(err).code === 'PHOTO_NOT_FOUND') this.uploaded = false;
      throw err;
    }
  }

  private async upload(): Promise<void> {
    const { photo, tripId } = this.data;
    if (!photo || !this.momentId || this.uploaded) return;
    const tickets = await firstValueFrom(this.api.requestUpload(tripId, this.momentId));
    const ticket = tickets.items[0];
    if (!ticket) throw new Error('NO_UPLOAD_TICKET');
    await Promise.all([
      this.api.uploadFile(ticket.photo.uploadUrl, photo.photo),
      this.api.uploadFile(ticket.thumb.uploadUrl, photo.thumb),
    ]);
    this.uploaded = true;
  }

  private photoMeta() {
    const p = this.data.photo!;
    return { width: p.width, height: p.height, bytes: p.photo.size };
  }

  private async create(): Promise<CheckinOutcome> {
    const { tripId, placeId, takenAt } = this.data;
    const location = await this.data.location;
    const body: CheckinInput = {
      tripPlaceId: placeId,
      takenAt: takenAt.toISOString(),
      ...(location ?? {}),
      ...(this.rating ? { rating: this.rating } : {}),
      ...(this.review ? { review: this.review } : {}),
      ...(this.caption ? { caption: this.caption } : {}),
      ...(this.momentId ? { momentId: this.momentId, photo: this.photoMeta() } : {}),
    };
    try {
      const res = await firstValueFrom(this.api.putCheckin(tripId, this.checkinId, body));
      return { kind: 'created', checkin: res.checkin, moment: res.moment };
    } catch (err) {
      const e = toApiError(err);
      if (e.code !== 'ALREADY_CHECKED_IN') throw err;
      if (!this.momentId) return { kind: 'already', checkin: null, moment: null };
      const id = (e.details as { checkinId?: string } | undefined)?.checkinId;
      if (!id) throw err;
      this.existingCheckinId = id;
      return this.join(id);
    }
  }

  /** Coi như cùng tham gia: ảnh thành khoảnh khắc camera gắn với check-in đã có. */
  private async join(checkinId: string): Promise<CheckinOutcome> {
    const { tripId, placeId, takenAt } = this.data;
    const location = await this.data.location;
    const moment = await firstValueFrom(
      this.api.putMoment(tripId, this.momentId!, {
        source: 'camera',
        photo: this.photoMeta(),
        takenAt: takenAt.toISOString(),
        ...(this.caption || this.review ? { note: this.caption || this.review } : {}),
        ...(location ?? {}),
        tripPlaceId: placeId,
        checkinId,
      }),
    );
    return { kind: 'joined', checkin: null, moment };
  }
}

/** Vị trí lúc chụp, không bắt buộc: từ chối, lỗi hoặc chờ quá lâu thì null. */
export function currentLocation(waitMs = 5000): Promise<Location | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    // timeout của geolocation không tính lúc chờ người dùng cấp quyền nên cần hẹn giờ riêng.
    const timer = setTimeout(() => resolve(null), waitMs);
    const done = (value: Location | null) => {
      clearTimeout(timer);
      resolve(value);
    };
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => done(null),
      { maximumAge: 60_000, timeout: waitMs, enableHighAccuracy: false },
    );
  });
}
