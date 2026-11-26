import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { isObjectId } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { now } from '../../lib/clock';
import { parseAllowedMapsUrl } from '../../lib/maps-url';
import {
  hasNoHtml,
  isCommonsImageUrl,
  isCommonsSourceUrl,
  isLicenseUrl,
} from '../../lib/place-images';
import { timeIn } from '../../lib/trip-dates';
import { ClusterModel, type ClusterDoc } from '../clusters/cluster.model';
import { toTripPlace } from './place.dto';
import { TripPlaceModel, type TripPlaceDoc } from './trip-place.model';

export const placesRouter = Router({ mergeParams: true });

const querySchema = z.object({
  clusterId: z
    .string()
    .refine(isObjectId, 'clusterId phải là ID 24 ký tự hex.')
    .optional(),
});

// Danh sách quán của chuyến (bỏ quán đã archive).
placesRouter.get('/', async (req, res) => {
  const query = querySchema.parse(req.query);
  const filter: Record<string, unknown> = { tripId: req.trip!._id, isArchived: false };
  if (query.clusterId) filter['clusterId'] = query.clusterId;
  const places = await TripPlaceModel.find(filter).sort({ clusterId: 1, order: 1 }).lean();
  res.json({ items: places.map(toTripPlace) });
});

// ---------- Kiểm tra dữ liệu ----------

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = z.string().regex(TIME, 'Giờ phải có dạng HH:mm, ví dụ 07:30.');

const hours = z.object({ open: time, close: time });

const objectId = (what: string) => z.string().refine(isObjectId, `${what} không hợp lệ.`);

/** Chuỗi rỗng coi như không nhập. */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const image = z.object({
  url: z.string().refine(isCommonsImageUrl, 'Ảnh phải là link https của Wikimedia.').pipe(z.string().max(500)),
  author: z
    .string()
    .trim()
    .min(1, 'Thiếu tên tác giả ảnh.')
    .max(80, 'Tên tác giả tối đa 80 ký tự.')
    .refine((v) => hasNoHtml(v), 'Tên tác giả không được chứa thẻ HTML.'),
  license: z
    .string()
    .trim()
    .min(1, 'Thiếu giấy phép của ảnh.')
    .max(60, 'Giấy phép tối đa 60 ký tự.')
    .refine((v) => hasNoHtml(v), 'Giấy phép không được chứa thẻ HTML.'),
  licenseUrl: z
    .string()
    .refine(isLicenseUrl, 'Link giấy phép phải là link https của Creative Commons hoặc Wikimedia Commons.')
    .pipe(z.string().max(500))
    .optional(),
  sourceUrl: z
    .string()
    .refine(isCommonsSourceUrl, 'Link nguồn ảnh phải là link https của Wikimedia Commons.')
    .pipe(z.string().max(500)),
});

const fields = {
  label: z.string().trim().min(1, 'Hãy nhập tên quán.').max(80, 'Tên quán tối đa 80 ký tự.'),
  clusterId: objectId('Cụm'),
  address: z.string().trim().max(200, 'Địa chỉ tối đa 200 ký tự.'),
  lat: z.number('Vĩ độ phải là một số.').min(-90, 'Vĩ độ từ -90 đến 90.').max(90, 'Vĩ độ từ -90 đến 90.'),
  lng: z.number('Kinh độ phải là một số.').min(-180, 'Kinh độ từ -180 đến 180.').max(180, 'Kinh độ từ -180 đến 180.'),
  mapsUrl: z.preprocess(emptyToNull, z.string().max(2000, 'Link quá dài.').nullable()),
  // Giờ, giá, ghi chú không còn dùng trên giao diện nhưng vẫn nhận để khỏi đụng dữ liệu cũ.
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự.'),
  manualHours: hours.nullable(),
  manualPrice: z.preprocess(emptyToNull, z.string().trim().max(40, 'Mức giá tối đa 40 ký tự.').nullable()),
  image: image.nullable(),
};

const createSchema = z.object({
  source: z.enum(['link', 'manual']).optional(),
  label: fields.label,
  clusterId: fields.clusterId.optional(),
  address: fields.address.optional(),
  lat: fields.lat.nullable().optional(),
  lng: fields.lng.nullable().optional(),
  mapsUrl: fields.mapsUrl.optional(),
  note: fields.note.optional(),
  manualHours: fields.manualHours.optional(),
  manualPrice: fields.manualPrice.optional(),
  image: fields.image.optional(),
});

const patchSchema = z.object({
  label: fields.label.optional(),
  clusterId: fields.clusterId.optional(),
  address: fields.address.optional(),
  lat: fields.lat.nullable().optional(),
  lng: fields.lng.nullable().optional(),
  mapsUrl: fields.mapsUrl.optional(),
  note: fields.note.optional(),
  manualHours: fields.manualHours.optional(),
  manualPrice: fields.manualPrice.optional(),
  image: fields.image.optional(),
});

const MISSING_ADDRESS = 'Hãy nhập địa chỉ hoặc dán link Google Maps.';
const HALF_COORDS = 'Vĩ độ và kinh độ phải đi cùng nhau.';

/** Phải có địa chỉ viết tay hoặc link Google Maps. */
function assertHasAddress(address: string | null | undefined, mapsUrl: string | null | undefined): void {
  if (!address?.trim() && !mapsUrl) throw fieldError('address', MISSING_ADDRESS);
}

/** Toạ độ đi theo cặp: có cả hai hoặc không có cái nào. */
function assertCoordsPair(lat: number | null | undefined, lng: number | null | undefined): void {
  if ((lat == null) !== (lng == null)) throw fieldError(lat == null ? 'lat' : 'lng', HALF_COORDS);
}

function fieldError(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', [{ field, message }]);
}

/** mapsUrl sẽ được mở trong tab mới nên chỉ nhận link Google Maps (chặn javascript:, trang lạ). */
function checkMapsUrl(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  return parseAllowedMapsUrl(value).toString();
}

type Id = Types.ObjectId | string;

async function findCluster(tripId: Id, clusterId: string): Promise<ClusterDoc> {
  const filter: Record<string, unknown> = { _id: clusterId, tripId };
  const cluster = await ClusterModel.findOne(filter).lean<ClusterDoc>();
  if (!cluster) throw new AppError(404, 'CLUSTER_NOT_FOUND', 'Không tìm thấy cụm này trong chuyến.');
  return cluster;
}

/**
 * Không chọn cụm (FR-17): lấy cụm có khoảng giờ chứa giờ hiện tại theo múi giờ chuyến
 * (nhiều cụm cùng chứa thì lấy cụm bắt đầu muộn nhất, tức cụ thể nhất), không có thì cụm "Đi chơi".
 */
async function autoCluster(trip: NonNullable<Express.Request['trip']>): Promise<ClusterDoc> {
  const clusters = await ClusterModel.find({ tripId: trip._id }).sort({ order: 1 }).lean<ClusterDoc[]>();
  const t = timeIn(now(), trip.tz);
  const containing = clusters
    .filter((c) => c.startTime <= t && t < c.endTime)
    .sort((a, b) => b.startTime.localeCompare(a.startTime));
  const found = containing[0] ?? clusters.find((c) => c.type === 'activity') ?? clusters[clusters.length - 1];
  if (!found) throw new AppError(404, 'CLUSTER_NOT_FOUND', 'Chuyến này chưa có cụm nào để thêm quán.');
  return found;
}

async function nextOrder(tripId: Id, clusterId: Id): Promise<number> {
  const filter: Record<string, unknown> = { tripId, clusterId, isArchived: false };
  const last = await TripPlaceModel.findOne(filter).sort({ order: -1 }).lean<TripPlaceDoc>();
  return (last?.order ?? 0) + 1;
}

interface Identity {
  label: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  mapsUrl?: string | null;
}

const sameText = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.trim().toLocaleLowerCase('vi-VN') === b.trim().toLocaleLowerCase('vi-VN');

/**
 * Cùng tên (không phân biệt hoa thường) thì coi là một quán khi toạ độ gần như trùng. Quán chưa có
 * toạ độ (địa chỉ viết tay) so theo địa chỉ hoặc link. Một bên có toạ độ, một bên không thì khác nhau.
 */
function isSamePlace(a: Identity, b: Identity): boolean {
  if (!sameText(a.label, b.label)) return false;
  const aHas = a.lat != null && a.lng != null;
  const bHas = b.lat != null && b.lng != null;
  if (aHas && bHas) {
    return Math.abs(a.lat! - b.lat!) <= 0.0002 && Math.abs(a.lng! - b.lng!) <= 0.0002;
  }
  if (aHas !== bHas) return false;
  return sameText(a.address, b.address) || (!!a.mapsUrl && a.mapsUrl === b.mapsUrl);
}

async function assertNotDuplicate(
  tripId: Id,
  clusterId: Id,
  wanted: Identity,
  exceptId?: Id,
): Promise<void> {
  const filter: Record<string, unknown> = { tripId, clusterId, isArchived: false };
  const inCluster = await TripPlaceModel.find(filter).lean<TripPlaceDoc[]>();
  const same = inCluster.find((p) => String(p._id) !== String(exceptId) && isSamePlace(p, wanted));
  if (same) {
    throw new AppError(409, 'PLACE_ALREADY_IN_CLUSTER', 'Quán này đã có trong cụm rồi.', {
      existingPlaceId: String(same._id),
    });
  }
}

async function loadPlace(req: Express.Request): Promise<TripPlaceDoc> {
  const id = String((req as unknown as { params: Record<string, string> }).params['tripPlaceId']);
  const filter: Record<string, unknown> = { _id: id, tripId: req.trip!._id, isArchived: false };
  const place = isObjectId(id) ? await TripPlaceModel.findOne(filter).lean<TripPlaceDoc>() : null;
  if (!place) throw new AppError(404, 'PLACE_NOT_FOUND', 'Không tìm thấy quán này.');
  return place;
}

// ---------- Thêm, xem, sửa ----------

placesRouter.post('/', async (req, res) => {
  const trip = req.trip!;
  const body = createSchema.parse(req.body);
  const mapsUrl = checkMapsUrl(body.mapsUrl) ?? null;
  const address = body.address ?? '';
  const lat = body.lat ?? null;
  const lng = body.lng ?? null;
  assertHasAddress(address, mapsUrl);
  assertCoordsPair(lat, lng);

  const cluster = body.clusterId ? await findCluster(trip._id, body.clusterId) : await autoCluster(trip);
  await assertNotDuplicate(trip._id, cluster._id, { label: body.label, lat, lng, address, mapsUrl });

  const created = await TripPlaceModel.create({
    tripId: trip._id,
    clusterId: cluster._id,
    source: body.source ?? (mapsUrl ? 'link' : 'manual'),
    label: body.label,
    lat,
    lng,
    address,
    mapsUrl,
    note: body.note ?? '',
    manualHours: body.manualHours ?? undefined,
    manualPrice: body.manualPrice ?? undefined,
    image: body.image ?? undefined,
    order: await nextOrder(trip._id, cluster._id),
    addedBy: req.userId,
    isArchived: false,
  });
  const place = toTripPlace(created.toObject() as unknown as TripPlaceDoc);
  res.status(201).location(`/api/trips/${place.tripId}/places/${place.id}`).json({ place });
});

placesRouter.get('/:tripPlaceId', async (req, res) => {
  res.json({ place: toTripPlace(await loadPlace(req)) });
});

placesRouter.patch('/:tripPlaceId', async (req, res) => {
  const trip = req.trip!;
  const current = await loadPlace(req);
  const body = patchSchema.parse(req.body);

  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};

  if (body.label !== undefined) set['label'] = body.label;
  if (body.lat !== undefined) set['lat'] = body.lat;
  if (body.lng !== undefined) set['lng'] = body.lng;
  if (body.address !== undefined) set['address'] = body.address;
  if (body.note !== undefined) set['note'] = body.note;
  if (body.mapsUrl !== undefined) set['mapsUrl'] = checkMapsUrl(body.mapsUrl);
  // null nghĩa là xoá giá trị đã nhập
  if (body.manualHours !== undefined) {
    if (body.manualHours === null) unset['manualHours'] = 1;
    else set['manualHours'] = body.manualHours;
  }
  if (body.manualPrice !== undefined) {
    if (body.manualPrice === null) unset['manualPrice'] = 1;
    else set['manualPrice'] = body.manualPrice;
  }
  if (body.image !== undefined) {
    if (body.image === null) unset['image'] = 1;
    else set['image'] = body.image;
  }

  // Kiểm tra theo giá trị sau khi gộp với bản đang có.
  const merged: Identity = {
    label: body.label ?? current.label,
    lat: body.lat !== undefined ? body.lat : current.lat,
    lng: body.lng !== undefined ? body.lng : current.lng,
    address: body.address !== undefined ? body.address : current.address,
    mapsUrl: body.mapsUrl !== undefined ? (set['mapsUrl'] as string | null) : current.mapsUrl,
  };
  if (body.address !== undefined || body.mapsUrl !== undefined) assertHasAddress(merged.address, merged.mapsUrl);
  if (body.lat !== undefined || body.lng !== undefined) assertCoordsPair(merged.lat, merged.lng);

  let clusterId: Id = current.clusterId;
  if (body.clusterId !== undefined && body.clusterId !== String(current.clusterId)) {
    const cluster = await findCluster(trip._id, body.clusterId);
    clusterId = cluster._id;
    set['clusterId'] = cluster._id;
    set['order'] = await nextOrder(trip._id, cluster._id);
  }

  if (['label', 'lat', 'lng', 'address', 'mapsUrl', 'clusterId'].some((k) => body[k as keyof typeof body] !== undefined)) {
    await assertNotDuplicate(trip._id, clusterId, merged, current._id);
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length) update['$set'] = set;
  if (Object.keys(unset).length) update['$unset'] = unset;
  const saved = Object.keys(update).length
    ? await TripPlaceModel.findOneAndUpdate({ _id: current._id }, update, {
        returnDocument: 'after',
        runValidators: true,
      }).lean<TripPlaceDoc>()
    : current;
  res.json({ place: toTripPlace(saved ?? current) });
});
