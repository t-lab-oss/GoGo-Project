import { Router } from 'express';
import { z } from 'zod';
import { isObjectId } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { getStorage } from '../../lib/storage';
import { dateIn } from '../../lib/trip-dates';
import { CheckinModel, type CheckinDoc } from '../checkins/checkin.model';
import { TripPlaceModel } from '../places/trip-place.model';
import { TripModel } from '../trips/trip.model';
import { toMoment, toMoments } from './moment.dto';
import { MomentModel, type MomentDoc } from './moment.model';
import { objectId, photoSchema, takenAtSchema, verifyUploaded } from './photo';

export const momentsRouter = Router({ mergeParams: true });

const idConflict = () => new AppError(409, 'ID_CONFLICT', 'ID này đã thuộc về một khoảnh khắc khác.');

const putSchema = z.object({
  // Nguồn "checkin" chỉ do route check-in tạo.
  source: z.enum(['camera', 'import'], { message: 'Nguồn ảnh chỉ nhận camera hoặc import.' }),
  photo: photoSchema,
  takenAt: takenAtSchema,
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
  mood: z.enum(['happy', 'excited', 'relaxed', 'tired', 'sad']).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  placeLabel: z.string().trim().max(80).optional(),
  tripPlaceId: objectId('Quán chưa đúng định dạng.').optional(),
  checkinId: objectId('Check-in chưa đúng định dạng.').optional(),
});

// Khoảnh khắc do client sinh ID: gửi lại cùng ID trả bản đang có (idempotent)
momentsRouter.put('/:momentId', async (req, res) => {
  const trip = req.trip!;
  const momentId = String((req.params as Record<string, string>)['momentId']);
  if (!isObjectId(momentId)) throw new AppError(400, 'VALIDATION_ERROR', 'ID khoảnh khắc chưa đúng định dạng.');
  const body = putSchema.parse(req.body);

  const isMine = (m: MomentDoc) => m.tripId.equals(trip._id) && m.userId.toString() === req.userId;
  const existing = await MomentModel.findById(momentId).lean<MomentDoc>();
  if (existing) {
    if (!isMine(existing)) throw idConflict();
    res.json({ moment: await toMoment(existing) });
    return;
  }

  let checkin: CheckinDoc | null = null;
  if (body.checkinId) {
    checkin = await CheckinModel.findOne({ _id: body.checkinId, tripId: trip._id }).lean<CheckinDoc>();
    if (!checkin) throw new AppError(404, 'CHECKIN_NOT_FOUND', 'Không tìm thấy check-in này.');
  }
  if (body.tripPlaceId && !(await TripPlaceModel.exists({ _id: body.tripPlaceId, tripId: trip._id }))) {
    throw new AppError(404, 'PLACE_NOT_FOUND', 'Không tìm thấy quán này.');
  }

  const takenAt = new Date(body.takenAt);
  const dayDate = dateIn(takenAt, trip.tz);
  if (dayDate < trip.startDate || dayDate > trip.endDate) {
    throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
  }
  const uploaded = await verifyUploaded(trip._id.toString(), momentId);

  try {
    const created = await MomentModel.create({
      _id: momentId,
      tripId: trip._id,
      userId: req.userId,
      source: body.source,
      checkinId: checkin?._id,
      tripPlaceId: body.tripPlaceId ?? checkin?.tripPlaceId,
      photo: { ...uploaded, width: body.photo.width, height: body.photo.height },
      note: body.note,
      mood: body.mood,
      takenAt,
      dayDate,
      lat: body.lat,
      lng: body.lng,
      placeLabel: body.placeLabel ?? checkin?.placeLabel,
    });
    res.status(201).json({ moment: await toMoment(created.toObject() as MomentDoc) });
  } catch (error) {
    // Hai request cùng ID chạy song song: request sau trả bản vừa tạo.
    if ((error as { code?: number }).code !== 11000) throw error;
    const raced = await MomentModel.findById(momentId).lean<MomentDoc>();
    if (!raced || !isMine(raced)) throw idConflict();
    res.json({ moment: await toMoment(raced) });
  }
});

const listSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD.')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  /** "<takenAt ISO>_<id>" lấy từ nextCursor của trang trước. */
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z_[0-9a-f]{24}$/, 'Con trỏ trang chưa hợp lệ.')
    .optional(),
});

// Album chung: mới nhất trước, chỉ các ngày còn nằm trong chuyến
momentsRouter.get('/', async (req, res) => {
  const trip = req.trip!;
  const q = listSchema.parse(req.query);
  const filter: Record<string, unknown> = {
    tripId: trip._id,
    dayDate: { $gte: trip.startDate, $lte: trip.endDate },
  };
  if (q.date) {
    if (q.date < trip.startDate || q.date > trip.endDate) {
      throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
    }
    filter['dayDate'] = q.date;
  }
  if (q.cursor) {
    const [iso, id] = q.cursor.split('_') as [string, string];
    const at = new Date(iso);
    filter['$or'] = [{ takenAt: { $lt: at } }, { takenAt: at, _id: { $lt: id } }];
  }
  const rows = await MomentModel.find(filter)
    .sort({ takenAt: -1, _id: -1 })
    .limit(q.limit + 1)
    .lean<MomentDoc[]>();
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  res.set('Cache-Control', 'no-store');
  res.json({
    items: await toMoments(page),
    nextCursor: rows.length > q.limit && last ? `${last.takenAt.toISOString()}_${last._id.toString()}` : null,
  });
});

async function loadMoment(tripId: MomentDoc['tripId'], params: unknown): Promise<MomentDoc> {
  const id = String((params as Record<string, string>)['momentId']);
  const moment = isObjectId(id) ? await MomentModel.findOne({ _id: id, tripId }).lean<MomentDoc>() : null;
  if (!moment) throw new AppError(404, 'MOMENT_NOT_FOUND', 'Không tìm thấy khoảnh khắc này.');
  return moment;
}

momentsRouter.get('/:momentId', async (req, res) => {
  res.json({ moment: await toMoment(await loadMoment(req.trip!._id, req.params)) });
});

const patchSchema = z.object({
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
  mood: z.enum(['happy', 'excited', 'relaxed', 'tired', 'sad']).nullable().optional(),
  takenAt: takenAtSchema.optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  placeLabel: z.string().trim().max(80).optional(),
  isPrivate: z.boolean().optional(),
  isHighlight: z.boolean().optional(),
});

// Mọi thành viên sửa được (API Contract mục 9)
momentsRouter.patch('/:momentId', async (req, res) => {
  const trip = req.trip!;
  const moment = await loadMoment(trip._id, req.params);
  const body = patchSchema.parse(req.body);

  const set: Record<string, unknown> = { ...body };
  if (body.mood === null) delete set['mood'];
  let dayDate = moment.dayDate;
  if (body.takenAt) {
    const takenAt = new Date(body.takenAt);
    dayDate = dateIn(takenAt, trip.tz);
    if (dayDate < trip.startDate || dayDate > trip.endDate) {
      throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
    }
    set['takenAt'] = takenAt;
    set['dayDate'] = dayDate;
  }
  // Mỗi ngày tối đa một ảnh nổi bật.
  const highlighted = body.isHighlight ?? moment.isHighlight;
  if (highlighted && (body.isHighlight || dayDate !== moment.dayDate)) {
    await MomentModel.updateMany({ tripId: trip._id, dayDate, _id: { $ne: moment._id } }, { isHighlight: false });
  }
  const updated = await MomentModel.findByIdAndUpdate(
    moment._id,
    { $set: set, ...(body.mood === null ? { $unset: { mood: 1 } } : {}) },
    { returnDocument: 'after' },
  ).lean<MomentDoc>();
  res.json({ moment: await toMoment(updated!) });
});

// Chỉ tác giả hoặc chủ chuyến xoá được
momentsRouter.delete('/:momentId', async (req, res) => {
  const trip = req.trip!;
  const moment = await loadMoment(trip._id, req.params);
  if (moment.userId.toString() !== req.userId && trip.ownerId.toString() !== req.userId) {
    throw new AppError(403, 'FORBIDDEN', 'Chỉ người đăng hoặc chủ chuyến xoá được ảnh này.');
  }
  await MomentModel.deleteOne({ _id: moment._id });
  await Promise.all([
    CheckinModel.updateMany({ tripId: trip._id, momentId: moment._id }, { momentId: null }),
    TripModel.updateOne({ _id: trip._id, coverMomentId: moment._id }, { $unset: { coverMomentId: 1 } }),
  ]);
  // Lỗi xoá file chỉ ghi log để dọn sau, không chặn việc xoá (Database Design mục 7).
  await getStorage()
    .remove([moment.photo.path, moment.photo.thumbPath])
    .catch(() => console.error('Chưa xoá được file của khoảnh khắc', moment._id.toString()));
  res.status(204).end();
});

