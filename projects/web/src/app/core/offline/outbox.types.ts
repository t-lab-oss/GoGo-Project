import type { Mood } from 'shared';

export interface QueuedPhoto {
  photo: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

interface GeoPoint {
  lat: number;
  lng: number;
}

export interface QueuedCheckin {
  kind: 'checkin';
  checkinId: string;
  momentId: string | null;
  placeId: string;
  placeLabel: string;
  clusterId: string;
  takenAt: string;
  location: GeoPoint | null;
  photo: QueuedPhoto | null;
  rating: number | null;
  review: string;
  caption: string;
}

export interface QueuedMoment {
  kind: 'moment';
  momentId: string;
  place: { id: string; label: string } | null;
  takenAt: string;
  location: GeoPoint | null;
  photo: QueuedPhoto;
  note: string;
  mood: Mood | null;
  placeLabel: string;
}

export interface QueuedExpense {
  kind: 'expense';
  checkinId: string;
  placeLabel: string;
  amount: number;
  note: string;
}

export interface QueuedSkip {
  kind: 'skip';
  checkinId: string;
  placeLabel: string;
  skipCount: number;
}

export type OutboxOp = QueuedCheckin | QueuedMoment | QueuedExpense | QueuedSkip;

export interface OutboxItem {
  /** Thứ tự tạo, do IndexedDB cấp. Gửi theo đúng thứ tự này. */
  seq: number;
  userId: string;
  tripId: string;
  createdAt: string;
  /** Máy chủ từ chối: không tự gửi lại, chờ người dùng quyết định. */
  error: string | null;
  op: OutboxOp;
}
