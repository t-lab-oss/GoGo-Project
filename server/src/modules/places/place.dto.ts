import type { TripPlace } from '../../../../projects/shared/src/public-api';
import type { TripPlaceDoc } from './trip-place.model';

export function toTripPlace(p: TripPlaceDoc): TripPlace {
  const hours = p.manualHours;
  const image = p.image;
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
    image:
      // Quán đã lưu ảnh dạng cũ (thiếu tác giả/giấy phép/nguồn) thì coi như chưa có ảnh, không lỗi.
      image?.url && image.author && image.license && image.sourceUrl
        ? {
            url: image.url,
            author: image.author,
            license: image.license,
            ...(image.licenseUrl ? { licenseUrl: image.licenseUrl } : {}),
            sourceUrl: image.sourceUrl,
          }
        : null,
    order: p.order ?? 0,
    isArchived: p.isArchived ?? false,
  };
}
