import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../middlewares/auth.middleware';
import { loadTrip } from '../../middlewares/trip-member.middleware';
import { now } from '../../lib/clock';
import { buildDays, dateIn, diffDays, isValidDate } from '../../lib/trip-dates';
import { CheckinModel } from '../checkins/checkin.model';
import { checkinsRouter } from '../checkins/checkins.routes';
import { ClusterModel, DEFAULT_CLUSTERS } from '../clusters/cluster.model';
import { clustersRouter } from '../clusters/clusters.routes';
import { ExpenseModel } from '../expenses/expense.model';
import { expensesRouter } from '../expenses/expenses.routes';
import { MomentModel } from '../moments/moment.model';
import { momentsRouter } from '../moments/moments.routes';
import { NotificationModel } from '../notifications/notification.model';
import { notificationsRouter } from '../notifications/notifications.routes';
import { placeCandidateRouter } from '../places/place-candidate.routes';
import { placeImagesRouter } from '../places/place-images.routes';
import { placesRouter } from '../places/places.routes';
import { TripPlaceModel } from '../places/trip-place.model';
import { recapRouter } from '../recap/recap.routes';
import { uploadsRouter } from '../uploads/uploads.routes';
import { toUserDto, UserModel } from '../users/user.model';
import { toTrip, toTripSummary } from './trip.dto';
import { TripModel, type TripDoc } from './trip.model';

export const tripsRouter = Router();
tripsRouter.use(requireAuth);

const listQuery = z.object({
  status: z.enum(['upcoming', 'ongoing', 'finished']).optional(),
  sort: z.enum(['startDate', '-startDate']).default('-startDate'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Danh sách chuyến của tôi. Chuyến mở Trip Mode: ?status=ongoing&sort=startDate&limit=1
tripsRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const trips = await TripModel.find({ memberIds: req.userId })
    .sort({ startDate: q.sort === 'startDate' ? 1 : -1 })
    .lean<TripDoc[]>();
  // Trạng thái tính theo múi giờ từng chuyến nên lọc ở service, không lọc ở DB
  const at = now();
  let items = trips.map((t) => toTripSummary(t, dateIn(at, t.tz)));
  if (q.status) items = items.filter((t) => t.status === q.status);
  if (q.limit) items = items.slice(0, q.limit);
  res.json({ items });
});

/** Chi tiết chuyến kèm thành viên và tổng chi. */
async function tripDetail(trip: TripDoc) {
  const [users, spent] = await Promise.all([
    UserModel.find({ _id: { $in: trip.memberIds } }),
    // Chỉ tính chi tiêu trong khoảng ngày hiện tại của chuyến (ngày bị ẩn khi rút ngắn không tính)
    ExpenseModel.aggregate<{ total: number }>([
      {
        $match: {
          tripId: trip._id,
          dayDate: { $gte: trip.startDate, $lte: trip.endDate },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const members = trip.memberIds
    .map((id) => byId.get(id.toString()))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map(toUserDto);
  return toTrip(trip, dateIn(now(), trip.tz), members, spent[0]?.total ?? 0);
}

tripsRouter.get('/:tripId', loadTrip, async (req, res) => {
  res.json({ trip: await tripDetail(req.trip!) });
});

// ---------- Tạo, sửa, xoá chuyến ----------

const MAX_TRIP_DAYS = 30;

const dateField = z.string({ message: 'Chọn ngày.' }).refine(isValidDate, 'Ngày chưa đúng định dạng.');

/** Múi giờ sai sẽ làm mọi phép tính ngày của chuyến ném lỗi. */
function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const createSchema = z.object({
  name: z.string({ message: 'Nhập tên chuyến đi.' }).trim().min(1, 'Nhập tên chuyến đi.').max(80, 'Tên tối đa 80 ký tự.'),
  destination: z.string({ message: 'Nhập điểm đến.' }).trim().min(1, 'Nhập điểm đến.').max(80, 'Điểm đến tối đa 80 ký tự.'),
  startDate: dateField,
  endDate: dateField,
  tz: z.string().max(60).refine(isTimeZone, 'Múi giờ không hợp lệ.').optional(),
  destinationGeo: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

const patchSchema = createSchema.partial().extend({ confirmShrink: z.boolean().optional() });

function checkRange(startDate: string, endDate: string): void {
  const fail = (message: string) =>
    new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ, hãy kiểm tra lại các ô được nêu.', [
      { field: 'endDate', message },
    ]);
  if (endDate < startDate) throw fail('Ngày về phải sau hoặc cùng ngày đi.');
  if (diffDays(startDate, endDate) + 1 > MAX_TRIP_DAYS) throw fail(`Một chuyến tối đa ${MAX_TRIP_DAYS} ngày.`);
}

// Tạo chuyến (kèm 4 cụm mặc định)
tripsRouter.post('/', async (req, res) => {
  const body = createSchema.parse(req.body);
  checkRange(body.startDate, body.endDate);

  const created = await TripModel.create({ ...body, ownerId: req.userId!, memberIds: [req.userId!] });
  await ClusterModel.insertMany(
    DEFAULT_CLUSTERS.map((c, i) => ({ ...c, tripId: created._id, order: i + 1 })),
  );

  res
    .status(201)
    .location(`/api/trips/${created._id.toString()}`)
    .json({ trip: await tripDetail(created.toObject() as unknown as TripDoc) });
});

// Sửa chuyến. Rút ngắn ngày đang có dữ liệu thì cần xác nhận; dữ liệu chỉ bị ẩn, không bị xoá.
tripsRouter.patch('/:tripId', loadTrip, async (req, res) => {
  const trip = req.trip!;
  const { confirmShrink, ...fields } = patchSchema.parse(req.body);

  const startDate = fields.startDate ?? trip.startDate;
  const endDate = fields.endDate ?? trip.endDate;
  checkRange(startDate, endDate);

  const kept = new Set(buildDays(startDate, endDate).map((d) => d.date));
  const removed = buildDays(trip.startDate, trip.endDate)
    .map((d) => d.date)
    .filter((d) => !kept.has(d));
  if (removed.length > 0 && !confirmShrink) {
    const filter = { tripId: trip._id, dayDate: { $in: removed } };
    const [checkins, moments, expenses] = await Promise.all([
      CheckinModel.countDocuments(filter),
      MomentModel.countDocuments(filter),
      ExpenseModel.countDocuments(filter),
    ]);
    if (checkins + moments + expenses > 0) {
      throw new AppError(409, 'DAYS_HAVE_DATA', 'Bỏ ngày này sẽ ẩn dữ liệu đã có.', {
        removedDays: removed,
        counts: { checkins, moments, expenses },
      });
    }
  }

  const updated = await TripModel.findOneAndUpdate(
    { _id: trip._id },
    { $set: fields },
    { returnDocument: 'after', runValidators: true },
  ).lean<TripDoc>();
  res.json({ trip: await tripDetail(updated ?? trip) });
});

// Xoá chuyến: chỉ chủ chuyến, phải gõ đúng tên. File ảnh trong kho chưa được dọn.
tripsRouter.delete('/:tripId', loadTrip, async (req, res) => {
  const trip = req.trip!;
  if (trip.ownerId.toString() !== req.userId) {
    throw new AppError(403, 'FORBIDDEN', 'Chỉ chủ chuyến mới xoá được chuyến đi.');
  }
  if (req.query['confirmName'] !== trip.name) {
    throw new AppError(400, 'CONFIRM_NAME_MISMATCH', 'Tên bạn gõ chưa khớp với tên chuyến đi.');
  }
  const filter = { tripId: trip._id };
  await Promise.all([
    ClusterModel.deleteMany(filter),
    TripPlaceModel.deleteMany(filter),
    CheckinModel.deleteMany(filter),
    ExpenseModel.deleteMany(filter),
    MomentModel.deleteMany(filter),
    NotificationModel.deleteMany(filter),
  ]);
  await TripModel.deleteOne({ _id: trip._id });
  res.status(204).end();
});

// ---------- Thành viên ----------

const IDENTIFIER_MESSAGE = 'Nhập tên đăng nhập hoặc ID.';
const memberSchema = z.object({
  identifier: z.string({ message: IDENTIFIER_MESSAGE }).trim().min(1, IDENTIFIER_MESSAGE).max(50),
});

tripsRouter.post('/:tripId/members', loadTrip, async (req, res) => {
  const trip = req.trip!;
  const { identifier } = memberSchema.parse(req.body);

  const user = await UserModel.findOne({
    $or: [{ username: identifier.toLowerCase() }, { publicId: identifier.toUpperCase() }],
  });
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng này, hãy kiểm tra lại tên hoặc ID.');
  }
  if (trip.memberIds.some((id) => id.toString() === user._id.toString())) {
    throw new AppError(409, 'ALREADY_MEMBER', 'Người này đã ở trong chuyến.');
  }
  await TripModel.updateOne({ _id: trip._id }, { $addToSet: { memberIds: user._id } });
  res.status(201).json({ member: toUserDto(user) });
});

tripsRouter.delete('/:tripId/members/:userId', loadTrip, async (req, res) => {
  const trip = req.trip!;
  const userId = String((req.params as Record<string, string>)['userId']);
  if (!trip.memberIds.some((id) => id.toString() === userId)) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Người này không ở trong chuyến.');
  }
  const ownerId = trip.ownerId.toString();
  if (ownerId === userId) {
    throw new AppError(403, 'OWNER_CANNOT_LEAVE', 'Chủ chuyến không rời chuyến được, bạn có thể xoá chuyến thay thế.');
  }
  if (userId !== req.userId && ownerId !== req.userId) {
    throw new AppError(403, 'FORBIDDEN', 'Chỉ chủ chuyến mới mời người khác ra khỏi chuyến.');
  }
  await TripModel.updateOne({ _id: trip._id }, { $pull: { memberIds: userId } });
  res.status(204).end();
});

tripsRouter.use('/:tripId/clusters', loadTrip, clustersRouter);
tripsRouter.use('/:tripId/place-candidate', loadTrip, placeCandidateRouter);
tripsRouter.use('/:tripId/place-images', loadTrip, placeImagesRouter);
tripsRouter.use('/:tripId/places', loadTrip, placesRouter);
tripsRouter.use('/:tripId/checkins', loadTrip, checkinsRouter);
tripsRouter.use('/:tripId/expenses', loadTrip, expensesRouter);
tripsRouter.use('/:tripId/uploads', loadTrip, uploadsRouter);
tripsRouter.use('/:tripId/moments', loadTrip, momentsRouter);
tripsRouter.use('/:tripId/notifications', loadTrip, notificationsRouter);
tripsRouter.use('/:tripId/recap', loadTrip, recapRouter);
