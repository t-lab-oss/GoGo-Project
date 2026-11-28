import type { TripPlace } from '../../../../projects/shared/src/public-api';
import { toCommonsImage } from '../../lib/commons-image';
import type { TripPlaceDoc } from './trip-place.model';

export function toTripPlace(p: TripPlaceDoc): TripPlace {
  const hours = p.manualHours;
  return {
    id: p._id.toString(),
    tripId: p.tripId.toString(),
    clusterId: p.clusterId.toString(),
    source: p.source as TripPlace['source'],
    placeId: p.placeId ?? null,
    label: p.label,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    address: p.address ?? '',
    mapsUrl: p.mapsUrl ?? null,
    note: p.note ?? '',
    manualHours: hours?.open && hours?.close ? { open: hours.open, close: hours.close } : null,
    manualPrice: p.manualPrice ?? null,
    image: toCommonsImage(p.image),
    order: p.order ?? 0,
    isArchived: p.isArchived ?? false,
  };
}
