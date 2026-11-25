import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import type { TripPlace } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { CheckinModel } from '../checkins/checkin.model';
import { ClusterModel, type ClusterDoc } from '../clusters/cluster.model';
import { loadTrip, param } from '../trips/trip.service';
import { parseObjectId, timeOf, TIME_RE } from '../trips/trip-utils';
import { PlaceModel, type PlaceDoc } from './place.model';

export function toPlaceDto(p: PlaceDoc): TripPlace {
  return {
    id: String(p._id),
    tripId: String(p.tripId),
    clusterId: String(p.clusterId),
    source: p.source,
    placeId: p.placeId ?? null,
    label: p.label,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    mapsUrl: p.mapsUrl ?? null,
    note: p.note ?? '',
    manualHours: p.manualHours?.open && p.manualHours?.close ? { open: p.manualHours.open, close: p.manualHours.close } : null,
    manualPrice: p.manualPrice ?? null,
    order: p.order,
    isArchived: !!p.isArchived,
  };
}

/** Chỉ nhận link thuộc các host Google Maps (API Contract mục 7). */
function isMapsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'maps.app.goo.gl' || host === 'goo.gl' || host === 'maps.google.com') return true;
    return (host === 'google.com' || host === 'www.google.com') && url.pathname.startsWith('/maps');
  } catch {
    return false;
  }
}

const hours = z
  .object({
    open: z.string().regex(TIME_RE, 'Giờ mở cửa chưa đúng định dạng HH:mm.'),
    close: z.string().regex(TIME_RE, 'Giờ đóng cửa chưa đúng định dạng HH:mm.'),
  })
  .nullable();

const createSchema = z.object({
  clusterId: z.string().optional(),
  label: z.string({ message: 'Nhập tên quán.' }).trim().min(1, 'Nhập tên quán.').max(80, 'Tên quán tối đa 80 ký tự.'),
  mapsUrl: z.string().trim().max(500).nullable().optional(),
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
  manualHours: hours.optional(),
  manualPrice: z.string().trim().max(40, 'Mức giá tối đa 40 ký tự.').nullable().optional(),
});

const patchSchema = createSchema.partial();

function checkMapsUrl(url: string | null | undefined): void {
  if (url && !isMapsUrl(url)) {
    throw new AppError(400, 'INVALID_MAPS_URL', 'Link này không phải link Google Maps, hãy dán lại link từ ứng dụng Google Maps.');
  }
}

async function loadPlace(tripId: Types.ObjectId, placeId: string): Promise<PlaceDoc> {
  const id = parseObjectId(placeId, 'PLACE_NOT_FOUND', 'Không tìm thấy quán này.');
  const place = await PlaceModel.findOne({ _id: id, tripId, isArchived: false }).lean<PlaceDoc>();
  if (!place) throw new AppError(404, 'PLACE_NOT_FOUND', 'Không tìm thấy quán này.');
  return place;
}

async function clusterOf(tripId: Types.ObjectId, clusterId: string): Promise<ClusterDoc> {
  const id = parseObjectId(clusterId, 'CLUSTER_NOT_FOUND', 'Không tìm thấy cụm này.');
  const cluster = await ClusterModel.findOne({ _id: id, tripId }).lean<ClusterDoc>();
  if (!cluster) throw new AppError(404, 'CLUSTER_NOT_FOUND', 'Không tìm thấy cụm này.');
  return cluster;
}

export const placesRouter = Router({ mergeParams: true });

placesRouter.get('/', async (req, res) => {
  const trip = await loadTrip(req);
  const { clusterId } = z.object({ clusterId: z.string().optional() }).parse(req.query);
  const filter: Record<string, unknown> = { tripId: trip._id, isArchived: false };
  if (clusterId) filter['clusterId'] = (await clusterOf(trip._id, clusterId))._id;
  const places = await PlaceModel.find(filter).sort({ order: 1 }).lean<PlaceDoc[]>();
  res.json({ items: places.map(toPlaceDto) });
});

placesRouter.post('/', async (req, res) => {
  const trip = await loadTrip(req);
  const body = createSchema.parse(req.body);
  checkMapsUrl(body.mapsUrl);

  let cluster: ClusterDoc;
  if (body.clusterId) {
    cluster = await clusterOf(trip._id, body.clusterId);
  } else {
    // "+ Quán khác": cụm có khoảng giờ chứa giờ hiện tại, không có thì cụm "Đi chơi" (FR-17)
    const clusters = await ClusterModel.find({ tripId: trip._id }).sort({ order: 1 }).lean<ClusterDoc[]>();
    const now = timeOf(new Date(), trip.tz);
    const found =
      clusters.find((c) => c.startTime <= now && now < c.endTime) ??
      clusters.find((c) => c.type === 'activity') ??
      clusters[0];
    if (!found) throw new AppError(404, 'CLUSTER_NOT_FOUND', 'Chuyến này chưa có cụm nào.');
    cluster = found;
  }

  const last = await PlaceModel.findOne({ tripId: trip._id, clusterId: cluster._id }).sort({ order: -1 }).lean<PlaceDoc>();
  const place = await PlaceModel.create({
    tripId: trip._id,
    clusterId: cluster._id,
    source: body.mapsUrl ? 'link' : 'manual',
    label: body.label,
    mapsUrl: body.mapsUrl || null,
    note: body.note ?? '',
    manualHours: body.manualHours ?? null,
    manualPrice: body.manualPrice || null,
    order: (last?.order ?? 0) + 1,
    addedBy: req.userId!,
    isArchived: false,
  });
  res.status(201).location(`/api/trips/${trip._id}/places/${place._id}`).json({ place: toPlaceDto(place.toObject() as PlaceDoc) });
});

placesRouter.get('/:placeId', async (req, res) => {
  const trip = await loadTrip(req);
  res.json({ place: toPlaceDto(await loadPlace(trip._id, param(req, 'placeId'))) });
});

placesRouter.patch('/:placeId', async (req, res) => {
  const trip = await loadTrip(req);
  const place = await loadPlace(trip._id, param(req, 'placeId'));
  const body = patchSchema.parse(req.body);
  checkMapsUrl(body.mapsUrl);

  const set: Record<string, unknown> = { ...body };
  delete set['clusterId'];
  if (body.mapsUrl !== undefined) {
    set['mapsUrl'] = body.mapsUrl || null;
    set['source'] = body.mapsUrl ? 'link' : 'manual';
  }
  if (body.manualPrice !== undefined) set['manualPrice'] = body.manualPrice || null;
  if (body.clusterId) set['clusterId'] = (await clusterOf(trip._id, body.clusterId))._id;

  const updated = await PlaceModel.findByIdAndUpdate(place._id, { $set: set }, { new: true }).lean<PlaceDoc>();
  res.json({ place: toPlaceDto(updated as PlaceDoc) });
});

// Quán đã có check-in thì lưu trữ thay vì xoá, để chi tiêu và recap vẫn dùng được
placesRouter.delete('/:placeId', async (req, res) => {
  const trip = await loadTrip(req);
  const place = await loadPlace(trip._id, param(req, 'placeId'));
  const used = await CheckinModel.exists({ tripPlaceId: place._id });
  if (used) {
    await PlaceModel.updateOne({ _id: place._id }, { $set: { isArchived: true, archivedAt: new Date() } });
  } else {
    await PlaceModel.deleteOne({ _id: place._id });
  }
  res.status(204).end();
});
