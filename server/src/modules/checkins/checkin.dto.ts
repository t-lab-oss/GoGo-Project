import type { Checkin } from '../../../../projects/shared/src/public-api';
import type { CheckinDoc } from './checkin.model';

export function toCheckin(c: CheckinDoc): Checkin {
  return {
    id: c._id.toString(),
    tripId: c.tripId.toString(),
    clusterId: c.clusterId.toString(),
    tripPlaceId: c.tripPlaceId.toString(),
    placeLabel: c.placeLabel,
    userId: c.userId.toString(),
    dayDate: c.dayDate,
    takenAt: c.takenAt.toISOString(),
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    momentId: c.momentId ? c.momentId.toString() : null,
    rating: c.rating ?? null,
    review: c.review ?? '',
    caption: c.caption ?? '',
    expenseReminder: {
      skipCount: c.expenseReminder?.skipCount ?? 0,
      movedToBell: c.expenseReminder?.movedToBell ?? false,
    },
  };
}
