import type { Moment, MomentSource, Mood } from '../../../../projects/shared/src/public-api';
import { now } from '../../lib/clock';
import { getStorage } from '../../lib/storage';
import { UserModel } from '../users/user.model';
import type { MomentDoc } from './moment.model';

/** Signed URL xem ảnh sống khoảng 1 giờ (API Contract mục 3). */
export const PHOTO_URL_TTL_SECONDS = 60 * 60;

/** Đổi document thành Moment kèm signed URL (ký một lượt cho cả danh sách). */
export async function toMoments(docs: MomentDoc[]): Promise<Moment[]> {
  if (docs.length === 0) return [];
  const paths = docs.flatMap((m) => [m.photo.path, m.photo.thumbPath]);
  const [urls, users] = await Promise.all([
    getStorage().createDownloadUrls(paths, PHOTO_URL_TTL_SECONDS),
    UserModel.find({ _id: { $in: docs.map((m) => m.userId) } }),
  ]);
  const names = new Map(users.map((u) => [u._id.toString(), u.username]));
  const urlExpiresAt = new Date(now().getTime() + PHOTO_URL_TTL_SECONDS * 1000).toISOString();
  return docs.map((m) => {
    const userId = m.userId.toString();
    return {
      id: m._id.toString(),
      tripId: m.tripId.toString(),
      user: { id: userId, username: names.get(userId) ?? '' },
      source: m.source as MomentSource,
      checkinId: m.checkinId?.toString() ?? null,
      tripPlaceId: m.tripPlaceId?.toString() ?? null,
      photoUrl: urls.get(m.photo.path) ?? '',
      thumbUrl: urls.get(m.photo.thumbPath) ?? '',
      urlExpiresAt,
      width: m.photo.width ?? 0,
      height: m.photo.height ?? 0,
      note: m.note ?? '',
      mood: (m.mood as Mood | undefined) ?? null,
      takenAt: m.takenAt.toISOString(),
      dayDate: m.dayDate,
      lat: m.lat ?? null,
      lng: m.lng ?? null,
      placeLabel: m.placeLabel ?? null,
      isPrivate: m.isPrivate,
      isHighlight: m.isHighlight,
    };
  });
}

export async function toMoment(doc: MomentDoc): Promise<Moment> {
  return (await toMoments([doc]))[0]!;
}
