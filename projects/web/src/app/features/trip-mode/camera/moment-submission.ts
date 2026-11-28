import { firstValueFrom } from 'rxjs';
import { newClientId } from 'shared';
import type { Mood } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import type { CheckinApi, CheckinOutcome, Location } from './checkin-submission';
import type { CapturedPhoto } from './photo';

/** Một lần lưu khoảnh khắc (FR-20). ID và ảnh cố định từ lúc chụp nên gửi lại là idempotent. */
export class MomentSubmission {
  readonly momentId = newClientId();
  note = '';
  mood: Mood | null = null;
  placeLabel = '';
  private uploaded = false;

  constructor(
    private readonly api: CheckinApi,
    private readonly data: {
      tripId: string;
      /** Quán gần chỗ chụp, null nếu không có. */
      place: { id: string; label: string } | null;
      takenAt: Date;
      photo: CapturedPhoto;
      location: Promise<Location | null>;
    },
  ) {}

  async submit(): Promise<CheckinOutcome> {
    const { tripId, photo, takenAt, place } = this.data;
    try {
      if (!this.uploaded) {
        const tickets = await firstValueFrom(this.api.requestUpload(tripId, this.momentId));
        const ticket = tickets.items[0];
        if (!ticket) throw new Error('NO_UPLOAD_TICKET');
        await Promise.all([
          this.api.uploadFile(ticket.photo.uploadUrl, photo.photo),
          this.api.uploadFile(ticket.thumb.uploadUrl, photo.thumb),
        ]);
        this.uploaded = true;
      }
      const location = await this.data.location;
      const moment = await firstValueFrom(
        this.api.putMoment(tripId, this.momentId, {
          source: 'camera',
          photo: { width: photo.width, height: photo.height, bytes: photo.photo.size },
          takenAt: takenAt.toISOString(),
          ...(this.note ? { note: this.note } : {}),
          ...(this.mood ? { mood: this.mood } : {}),
          ...(this.placeLabel ? { placeLabel: this.placeLabel } : {}),
          // Chỉ gắn quán khi người dùng giữ nguyên địa điểm tự nhận.
          ...(place && this.placeLabel === place.label ? { tripPlaceId: place.id } : {}),
          ...(location ?? {}),
        }),
      );
      return { kind: 'moment', checkin: null, moment };
    } catch (err) {
      if (toApiError(err).code === 'PHOTO_NOT_FOUND') this.uploaded = false;
      throw err;
    }
  }
}
