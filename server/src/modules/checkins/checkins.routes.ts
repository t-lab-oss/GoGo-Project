import { Router, type Request } from 'express';
import { z } from 'zod';
import { isObjectId } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { dateIn, isValidDate } from '../../lib/trip-dates';
import { toExpense } from '../expenses/expense.dto';
import { ExpenseModel, type ExpenseDoc } from '../expenses/expense.model';
import { toMoment } from '../moments/moment.dto';
import { MomentModel, type MomentDoc } from '../moments/moment.model';
import { objectId, photoSchema, takenAtSchema, verifyUploaded } from '../moments/photo';
import { TripPlaceModel } from '../places/trip-place.model';
import { toCheckin } from './checkin.dto';
import { CheckinModel, type CheckinDoc } from './checkin.model';

export const checkinsRouter = Router({ mergeParams: true });

const idConflict = (what: string) =>
  new AppError(409, 'ID_CONFLICT', `ID này đã thuộc về một ${what} khác.`);

const putSchema = z
  .object({
    tripPlaceId: z.string({ message: 'Chọn quán để check-in.' }),
    takenAt: takenAtSchema,
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    momentId: objectId('ID ảnh chưa đúng định dạng.').optional(),
    photo: photoSchema.optional(),
    rating: z
      .number()
      .multipleOf(0.5, 'Số sao từ 0,5 đến 5, bước nửa sao.')
      .min(0.5, 'Số sao từ 0,5 đến 5, bước nửa sao.')
      .max(5, 'Số sao từ 0,5 đến 5, bước nửa sao.')
      .optional(),
    review: z.string().trim().max(100, 'Đánh giá tối đa 100 ký tự.').optional(),
    caption: z.string().trim().max(100, 'Mô tả tối đa 100 ký tự.').optional(),
  })
  .refine((b) => (b.momentId === undefined) === (b.photo === undefined), {
    message: 'momentId và photo phải đi cùng nhau.',
    path: ['photo'],
  });

/** Ảnh của check-in (nếu có). Lỗi kho ảnh không làm hỏng phản hồi gửi lại. */
async function momentOf(checkin: CheckinDoc) {
  if (!checkin.momentId) return null;
  const doc = await MomentModel.findById(checkin.momentId).lean<MomentDoc>();
  if (!doc) return null;
  return toMoment(doc).catch(() => null);
}

// Check-in do client sinh ID: gửi lại cùng ID cho kết quả như lần đầu (idempotent)
checkinsRouter.put('/:checkinId', async (req, res) => {
  const trip = req.trip!;
  const checkinId = String((req.params as Record<string, string>)['checkinId']);
  if (!isObjectId(checkinId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ID check-in chưa đúng định dạng.');
  }
  const body = putSchema.parse(req.body);

  const isMine = (c: CheckinDoc) => c.tripId.equals(trip._id) && c.userId.toString() === req.userId;
  const resend = async (c: CheckinDoc) => {
    if (!isMine(c)) throw idConflict('check-in');
    res.json({ checkin: toCheckin(c), moment: await momentOf(c) });
  };

  const existing = await CheckinModel.findById(checkinId).lean<CheckinDoc>();
  if (existing) return resend(existing);

  const place = isObjectId(body.tripPlaceId)
    ? await TripPlaceModel.findOne({ _id: body.tripPlaceId, tripId: trip._id, isArchived: false })
    : null;
  if (!place) throw new AppError(404, 'PLACE_NOT_FOUND', 'Không tìm thấy quán này.');

  const takenAt = new Date(body.takenAt);
  const dayDate = dateIn(takenAt, trip.tz);
  if (dayDate < trip.startDate || dayDate > trip.endDate) {
    throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
  }

  const sameDay = await CheckinModel.findOne({ tripPlaceId: place._id, dayDate }).lean<CheckinDoc>();
  if (sameDay) {
    // Request song song cùng ID vừa ghi xong: đây là gửi lại, không phải trùng.
    if (sameDay._id.toString() === checkinId) return resend(sameDay);
    throw new AppError(409, 'ALREADY_CHECKED_IN', 'Quán này đã có check-in trong ngày.', {
      checkinId: sameDay._id.toString(),
    });
  }

  // Có ảnh thì tạo khoảnh khắc trước, check-in sau (Database Design mục 7).
  let moment: MomentDoc | null = null;
  if (body.momentId && body.photo) {
    // Ảnh đã ghi (lần trước dở dang, hoặc request song song) chỉ dùng lại nếu đúng của check-in này.
    const reuse = (m: MomentDoc) => {
      const reusable =
        m.tripId.equals(trip._id) &&
        m.userId.toString() === req.userId &&
        m.source === 'checkin' &&
        m.checkinId?.toString() === checkinId;
      if (!reusable) throw idConflict('khoảnh khắc');
      return m;
    };
    const prior = await MomentModel.findById(body.momentId).lean<MomentDoc>();
    if (prior) {
      moment = reuse(prior);
    } else {
      const uploaded = await verifyUploaded(trip._id.toString(), body.momentId);
      const doc = {
        _id: body.momentId,
        tripId: trip._id,
        userId: req.userId,
        source: 'checkin',
        checkinId,
        tripPlaceId: place._id,
        photo: { ...uploaded, width: body.photo.width, height: body.photo.height },
        takenAt,
        dayDate,
        lat: body.lat,
        lng: body.lng,
        placeLabel: place.label,
        note: body.caption || body.review,
      };
      try {
        moment = (await new MomentModel(doc).save()).toObject() as MomentDoc;
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const raced = await MomentModel.findById(body.momentId).lean<MomentDoc>();
        if (!raced) throw error;
        moment = reuse(raced);
      }
    }
  }

  let saved: CheckinDoc;
  try {
    const created = await CheckinModel.create({
      _id: checkinId,
      tripId: trip._id,
      clusterId: place.clusterId,
      tripPlaceId: place._id,
      placeLabel: place.label,
      userId: req.userId,
      dayDate,
      takenAt,
      lat: body.lat,
      lng: body.lng,
      momentId: moment?._id ?? null,
      rating: body.rating ?? null,
      review: body.review ?? '',
      caption: body.caption ?? '',
    });
    saved = created.toObject() as CheckinDoc;
  } catch (error) {
    // Hai request cùng ID chạy song song: request sau trả bản vừa tạo.
    if ((error as { code?: number }).code !== 11000) throw error;
    const raced = await CheckinModel.findById(checkinId).lean<CheckinDoc>();
    if (!raced) throw error;
    return resend(raced);
  }

  res.status(201).json({
    checkin: toCheckin(saved),
    moment: moment ? await toMoment(moment).catch(() => null) : null,
  });
});

// ---------- Xem check-in ----------

const listQuery = z.object({
  date: z.string().refine(isValidDate, 'Ngày chưa đúng định dạng.').optional(),
  expenseStatus: z.enum(['missing', 'entered']).optional(),
  include: z.string().optional(),
  sort: z.enum(['takenAt', '-takenAt']).default('takenAt'),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

async function loadCheckin(req: Request): Promise<CheckinDoc> {
  const id = String((req.params as Record<string, string>)['checkinId']);
  const checkin = isObjectId(id)
    ? await CheckinModel.findOne({ _id: id, tripId: req.trip!._id }).lean<CheckinDoc>()
    : null;
  if (!checkin) throw new AppError(404, 'CHECKIN_NOT_FOUND', 'Không tìm thấy check-in này.');
  return checkin;
}

checkinsRouter.get('/', async (req, res) => {
  const trip = req.trip!;
  const query = listQuery.parse(req.query);
  if (query.date && (query.date < trip.startDate || query.date > trip.endDate)) {
    throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
  }

  const checkins = await CheckinModel.find({
    tripId: trip._id,
    dayDate: query.date ?? { $gte: trip.startDate, $lte: trip.endDate },
  })
    .sort({ takenAt: query.sort === 'takenAt' ? 1 : -1 })
    .lean<CheckinDoc[]>();
  const expenses = await ExpenseModel.find({ checkinId: { $in: checkins.map((c) => c._id) } }).lean<ExpenseDoc[]>();
  const byCheckin = new Map(expenses.map((e) => [e.checkinId.toString(), e]));

  let rows = checkins;
  if (query.expenseStatus) {
    const entered = query.expenseStatus === 'entered';
    rows = rows.filter((c) => byCheckin.has(c._id.toString()) === entered);
  }
  if (query.limit) rows = rows.slice(0, query.limit);

  const withExpense = query.include?.split(',').includes('expense');
  res.json({
    items: rows.map((c) => {
      if (!withExpense) return toCheckin(c);
      const expense = byCheckin.get(c._id.toString());
      return { ...toCheckin(c), expense: expense ? toExpense(expense) : null };
    }),
  });
});

checkinsRouter.get('/:checkinId', async (req, res) => {
  res.json({ checkin: toCheckin(await loadCheckin(req)) });
});

// ---------- Khoản chi của check-in (mỗi check-in tối đa một khoản) ----------

const expenseSchema = z.object({
  amount: z
    .number({ message: 'Nhập số tiền.' })
    .int('Số tiền phải là số nguyên.')
    .min(0, 'Số tiền không được âm.')
    .max(1_000_000_000, 'Số tiền quá lớn.'),
  note: z.string().trim().max(200, 'Ghi chú tối đa 200 ký tự.').optional(),
});

checkinsRouter.put('/:checkinId/expense', async (req, res) => {
  const checkin = await loadCheckin(req);
  const body = expenseSchema.parse(req.body);

  const existed = await ExpenseModel.exists({ checkinId: checkin._id });
  const saved = await ExpenseModel.findOneAndUpdate(
    { checkinId: checkin._id },
    {
      $set: { amount: body.amount, note: body.note ?? '', enteredBy: req.userId },
      $setOnInsert: { tripId: checkin.tripId, tripPlaceId: checkin.tripPlaceId, dayDate: checkin.dayDate },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean<ExpenseDoc>();
  res.status(existed ? 200 : 201).json({ expense: toExpense(saved!) });
});

checkinsRouter.get('/:checkinId/expense', async (req, res) => {
  const checkin = await loadCheckin(req);
  const expense = await ExpenseModel.findOne({ checkinId: checkin._id }).lean<ExpenseDoc>();
  if (!expense) throw new AppError(404, 'EXPENSE_NOT_FOUND', 'Check-in này chưa có khoản chi.');
  res.json({ expense: toExpense(expense) });
});

checkinsRouter.delete('/:checkinId/expense', async (req, res) => {
  const checkin = await loadCheckin(req);
  await ExpenseModel.deleteOne({ checkinId: checkin._id });
  res.status(204).end();
});
