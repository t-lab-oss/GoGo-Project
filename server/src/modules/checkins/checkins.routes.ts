import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { isObjectId, type Checkin, type Expense } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { PlaceModel, type PlaceDoc } from '../places/place.model';
import { loadTrip, param } from '../trips/trip.service';
import { dayDateOf, daysBetween, parseObjectId, validDate } from '../trips/trip-utils';
import { CheckinModel, ExpenseModel, type CheckinDoc, type ExpenseDoc } from './checkin.model';

export function toExpenseDto(e: ExpenseDoc): Expense {
  return {
    checkinId: String(e.checkinId),
    tripPlaceId: String(e.tripPlaceId),
    dayDate: e.dayDate,
    amount: e.amount,
    note: e.note ?? '',
    enteredBy: String(e.enteredBy),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export function toCheckinDto(c: CheckinDoc, expense?: ExpenseDoc | null): Checkin {
  const dto: Checkin = {
    id: String(c._id),
    tripId: String(c.tripId),
    clusterId: String(c.clusterId),
    tripPlaceId: String(c.tripPlaceId),
    placeLabel: c.placeLabel,
    userId: String(c.userId),
    dayDate: c.dayDate,
    takenAt: c.takenAt.toISOString(),
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    momentId: c.momentId ? String(c.momentId) : null,
  };
  if (expense !== undefined) dto.expense = expense ? toExpenseDto(expense) : null;
  return dto;
}

const putSchema = z.object({
  tripPlaceId: z.string({ message: 'Chọn quán để check-in.' }),
  takenAt: z.string({ message: 'Thiếu thời điểm check-in.' }).datetime({ offset: true, message: 'Thời điểm check-in chưa hợp lệ.' }),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

async function loadCheckin(tripId: Types.ObjectId, checkinId: string): Promise<CheckinDoc> {
  const id = parseObjectId(checkinId, 'CHECKIN_NOT_FOUND', 'Không tìm thấy check-in này.');
  const checkin = await CheckinModel.findOne({ _id: id, tripId }).lean<CheckinDoc>();
  if (!checkin) throw new AppError(404, 'CHECKIN_NOT_FOUND', 'Không tìm thấy check-in này.');
  return checkin;
}

export const checkinsRouter = Router({ mergeParams: true });

// Check-in do client sinh ID: gửi lại cùng ID cho kết quả như lần đầu (idempotent)
checkinsRouter.put('/:checkinId', async (req, res) => {
  const trip = await loadTrip(req);
  const checkinId = param(req, 'checkinId');
  if (!isObjectId(checkinId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ID check-in chưa đúng định dạng.');
  }
  const body = putSchema.parse(req.body);

  const existing = await CheckinModel.findById(checkinId).lean<CheckinDoc>();
  if (existing) {
    if (String(existing.tripId) !== String(trip._id) || String(existing.userId) !== req.userId) {
      throw new AppError(409, 'ID_CONFLICT', 'ID này đã thuộc về một check-in khác.');
    }
    res.json({ checkin: toCheckinDto(existing), moment: null });
    return;
  }

  const placeId = parseObjectId(body.tripPlaceId, 'PLACE_NOT_FOUND', 'Không tìm thấy quán này.');
  const place = await PlaceModel.findOne({ _id: placeId, tripId: trip._id, isArchived: false }).lean<PlaceDoc>();
  if (!place) throw new AppError(404, 'PLACE_NOT_FOUND', 'Không tìm thấy quán này.');

  const takenAt = new Date(body.takenAt);
  const dayDate = dayDateOf(takenAt, trip.tz);
  if (!daysBetween(trip.startDate, trip.endDate).includes(dayDate)) {
    throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
  }

  const sameDay = await CheckinModel.findOne({ tripPlaceId: place._id, dayDate }).lean<CheckinDoc>();
  if (sameDay) {
    throw new AppError(409, 'ALREADY_CHECKED_IN', 'Quán này đã có check-in trong ngày.', { checkinId: String(sameDay._id) });
  }

  const created = await CheckinModel.create({
    _id: checkinId,
    tripId: trip._id,
    clusterId: place.clusterId,
    tripPlaceId: place._id,
    placeLabel: place.label,
    userId: req.userId!,
    dayDate,
    takenAt,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
  });
  res.status(201).json({ checkin: toCheckinDto(created.toObject() as CheckinDoc), moment: null });
});

checkinsRouter.get('/', async (req, res) => {
  const trip = await loadTrip(req);
  const query = z
    .object({
      date: z.string().refine(validDate, 'Ngày chưa đúng định dạng.').optional(),
      expenseStatus: z.enum(['missing', 'entered']).optional(),
      include: z.string().optional(),
      sort: z.enum(['takenAt', '-takenAt']).default('takenAt'),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    })
    .parse(req.query);

  const days = daysBetween(trip.startDate, trip.endDate);
  const filter: Record<string, unknown> = { tripId: trip._id, dayDate: { $in: days } };
  if (query.date) {
    if (!days.includes(query.date)) throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
    filter['dayDate'] = query.date;
  }

  const checkins = await CheckinModel.find(filter)
    .sort({ takenAt: query.sort === 'takenAt' ? 1 : -1 })
    .lean<CheckinDoc[]>();
  const expenses = await ExpenseModel.find({ checkinId: { $in: checkins.map((c) => c._id) } }).lean<ExpenseDoc[]>();
  const byCheckin = new Map(expenses.map((e) => [String(e.checkinId), e]));

  let rows = checkins;
  if (query.expenseStatus === 'missing') rows = rows.filter((c) => !byCheckin.has(String(c._id)));
  if (query.expenseStatus === 'entered') rows = rows.filter((c) => byCheckin.has(String(c._id)));
  if (query.limit) rows = rows.slice(0, query.limit);

  const withExpense = query.include?.split(',').includes('expense');
  res.json({
    items: rows.map((c) => toCheckinDto(c, withExpense ? (byCheckin.get(String(c._id)) ?? null) : undefined)),
  });
});

checkinsRouter.get('/:checkinId', async (req, res) => {
  const trip = await loadTrip(req);
  res.json({ checkin: toCheckinDto(await loadCheckin(trip._id, param(req, 'checkinId'))) });
});

// Khoản chi của check-in (mỗi check-in tối đa một khoản)
const expenseSchema = z.object({
  amount: z
    .number({ message: 'Nhập số tiền.' })
    .int('Số tiền phải là số nguyên.')
    .min(0, 'Số tiền không được âm.')
    .max(1_000_000_000, 'Số tiền quá lớn.'),
  note: z.string().trim().max(200, 'Ghi chú tối đa 200 ký tự.').optional(),
});

checkinsRouter.put('/:checkinId/expense', async (req, res) => {
  const trip = await loadTrip(req);
  const checkin = await loadCheckin(trip._id, param(req, 'checkinId'));
  const body = expenseSchema.parse(req.body);

  const existing = await ExpenseModel.findOne({ checkinId: checkin._id }).lean<ExpenseDoc>();
  const saved = await ExpenseModel.findOneAndUpdate(
    { checkinId: checkin._id },
    {
      $set: { amount: body.amount, note: body.note ?? '', enteredBy: req.userId! },
      $setOnInsert: { tripId: trip._id, tripPlaceId: checkin.tripPlaceId, dayDate: checkin.dayDate },
    },
    { upsert: true, new: true },
  ).lean<ExpenseDoc>();
  res.status(existing ? 200 : 201).json({ expense: toExpenseDto(saved as ExpenseDoc) });
});

checkinsRouter.get('/:checkinId/expense', async (req, res) => {
  const trip = await loadTrip(req);
  const checkin = await loadCheckin(trip._id, param(req, 'checkinId'));
  const expense = await ExpenseModel.findOne({ checkinId: checkin._id }).lean<ExpenseDoc>();
  if (!expense) throw new AppError(404, 'EXPENSE_NOT_FOUND', 'Check-in này chưa có khoản chi.');
  res.json({ expense: toExpenseDto(expense) });
});

checkinsRouter.delete('/:checkinId/expense', async (req, res) => {
  const trip = await loadTrip(req);
  const checkin = await loadCheckin(trip._id, param(req, 'checkinId'));
  await ExpenseModel.deleteOne({ checkinId: checkin._id });
  res.status(204).end();
});
