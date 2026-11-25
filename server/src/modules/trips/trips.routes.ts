import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../middlewares/auth.middleware';
import { CheckinModel, ExpenseModel } from '../checkins/checkin.model';
import { checkinsRouter } from '../checkins/checkins.routes';
import { ClusterModel, DEFAULT_CLUSTERS } from '../clusters/cluster.model';
import { clustersRouter } from '../clusters/clusters.routes';
import { PlaceModel } from '../places/place.model';
import { placesRouter } from '../places/places.routes';
import { recapRouter } from '../recap/recap.routes';
import { UserModel, toUserDto, type UserDoc } from '../users/user.model';
import { TripModel, type TripDoc } from './trip.model';
import { loadTrip, param, toSummary, toTripDto } from './trip.service';
import { expensesRouter } from '../checkins/expenses.routes';
import { dayCountOf, DEFAULT_TZ, MAX_TRIP_DAYS, daysBetween, parseObjectId, validDate } from './trip-utils';

const dateField = z.string({ message: 'Chọn ngày.' }).refine(validDate, 'Ngày chưa đúng định dạng.');

const createSchema = z.object({
  name: z.string({ message: 'Nhập tên chuyến đi.' }).trim().min(1, 'Nhập tên chuyến đi.').max(80, 'Tên tối đa 80 ký tự.'),
  destination: z.string({ message: 'Nhập điểm đến.' }).trim().min(1, 'Nhập điểm đến.').max(80, 'Điểm đến tối đa 80 ký tự.'),
  startDate: dateField,
  endDate: dateField,
  tz: z.string().min(1).max(60).optional(),
  destinationGeo: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

const patchSchema = createSchema.partial().extend({ confirmShrink: z.boolean().optional() });

function checkRange(startDate: string, endDate: string): void {
  if (endDate < startDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ, hãy kiểm tra lại các ô được nêu.', [
      { field: 'endDate', message: 'Ngày về phải sau hoặc cùng ngày đi.' },
    ]);
  }
  if (dayCountOf(startDate, endDate) > MAX_TRIP_DAYS) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ, hãy kiểm tra lại các ô được nêu.', [
      { field: 'endDate', message: `Một chuyến tối đa ${MAX_TRIP_DAYS} ngày.` },
    ]);
  }
}

export const tripsRouter = Router();
tripsRouter.use(requireAuth);

// Danh sách chuyến
tripsRouter.get('/', async (req, res) => {
  const query = z
    .object({
      status: z.enum(['ongoing', 'upcoming', 'finished']).optional(),
      sort: z.enum(['startDate', '-startDate']).default('-startDate'),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .parse(req.query);

  const trips = await TripModel.find({ memberIds: req.userId })
    .sort({ startDate: query.sort === 'startDate' ? 1 : -1 })
    .lean<TripDoc[]>();
  let items = trips.map(toSummary);
  if (query.status) items = items.filter((t) => t.status === query.status);
  if (query.limit) items = items.slice(0, query.limit);
  res.json({ items });
});

// Tạo chuyến (kèm 4 cụm mặc định)
tripsRouter.post('/', async (req, res) => {
  const body = createSchema.parse(req.body);
  checkRange(body.startDate, body.endDate);

  const trip = await TripModel.create({
    name: body.name,
    destination: body.destination,
    destinationGeo: body.destinationGeo ?? null,
    startDate: body.startDate,
    endDate: body.endDate,
    tz: body.tz ?? DEFAULT_TZ,
    ownerId: req.userId!,
    memberIds: [req.userId!],
  });
  await ClusterModel.insertMany(
    DEFAULT_CLUSTERS.map((c, i) => ({ ...c, tripId: trip._id, order: i + 1 })),
  );

  res.status(201).location(`/api/trips/${trip._id}`).json({ trip: await toTripDto(trip.toObject() as TripDoc, true) });
});

tripsRouter.get('/:tripId', async (req, res) => {
  const trip = await loadTrip(req);
  res.json({ trip: await toTripDto(trip, true) });
});

// Sửa chuyến. Rút ngắn ngày đang có dữ liệu thì cần xác nhận; dữ liệu chỉ bị ẩn, không bị xoá.
tripsRouter.patch('/:tripId', async (req, res) => {
  const trip = await loadTrip(req);
  const body = patchSchema.parse(req.body);

  const startDate = body.startDate ?? trip.startDate;
  const endDate = body.endDate ?? trip.endDate;
  checkRange(startDate, endDate);

  const before = daysBetween(trip.startDate, trip.endDate);
  const after = new Set(daysBetween(startDate, endDate));
  const removed = before.filter((d) => !after.has(d));
  if (removed.length > 0 && !body.confirmShrink) {
    const [checkins, expenses] = await Promise.all([
      CheckinModel.countDocuments({ tripId: trip._id, dayDate: { $in: removed } }),
      ExpenseModel.countDocuments({ tripId: trip._id, dayDate: { $in: removed } }),
    ]);
    if (checkins + expenses > 0) {
      throw new AppError(409, 'DAYS_HAVE_DATA', 'Bỏ ngày này sẽ ẩn dữ liệu đã có.', {
        removedDays: removed,
        counts: { checkins, moments: 0, expenses },
      });
    }
  }

  const { confirmShrink: _ignored, ...fields } = body;
  const updated = await TripModel.findByIdAndUpdate(trip._id, { $set: fields }, { new: true }).lean<TripDoc>();
  res.json({ trip: await toTripDto(updated as TripDoc, true) });
});

// Xoá chuyến: chỉ chủ chuyến, phải gõ đúng tên
tripsRouter.delete('/:tripId', async (req, res) => {
  const trip = await loadTrip(req);
  if (String(trip.ownerId) !== req.userId) {
    throw new AppError(403, 'FORBIDDEN', 'Chỉ chủ chuyến mới xoá được chuyến đi.');
  }
  if (req.query['confirmName'] !== trip.name) {
    throw new AppError(400, 'CONFIRM_NAME_MISMATCH', 'Tên bạn gõ chưa khớp với tên chuyến đi.');
  }
  await Promise.all([
    ClusterModel.deleteMany({ tripId: trip._id }),
    PlaceModel.deleteMany({ tripId: trip._id }),
    CheckinModel.deleteMany({ tripId: trip._id }),
    ExpenseModel.deleteMany({ tripId: trip._id }),
  ]);
  await TripModel.deleteOne({ _id: trip._id });
  res.status(204).end();
});

// Thành viên
tripsRouter.post('/:tripId/members', async (req, res) => {
  const trip = await loadTrip(req);
  const { identifier } = z
    .object({ identifier: z.string({ message: 'Nhập tên đăng nhập hoặc ID.' }).trim().min(1, 'Nhập tên đăng nhập hoặc ID.').max(50) })
    .parse(req.body);

  const user = await UserModel.findOne({
    $or: [{ username: identifier.toLowerCase() }, { publicId: identifier.toUpperCase() }],
  }).lean<UserDoc>();
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng này, hãy kiểm tra lại tên hoặc ID.');
  if (trip.memberIds.some((id) => String(id) === String(user._id))) {
    throw new AppError(409, 'ALREADY_MEMBER', 'Người này đã ở trong chuyến.');
  }
  await TripModel.updateOne({ _id: trip._id }, { $addToSet: { memberIds: user._id } });
  res.status(201).json({ member: toUserDto(user) });
});

tripsRouter.delete('/:tripId/members/:userId', async (req, res) => {
  const trip = await loadTrip(req);
  const userId = parseObjectId(param(req, 'userId'), 'USER_NOT_FOUND', 'Không tìm thấy người dùng này.');
  const isMember = trip.memberIds.some((id) => String(id) === userId);
  if (!isMember) throw new AppError(404, 'USER_NOT_FOUND', 'Người này không ở trong chuyến.');
  if (String(trip.ownerId) === userId) {
    throw new AppError(403, 'OWNER_CANNOT_LEAVE', 'Chủ chuyến không rời chuyến được, bạn có thể xoá chuyến thay thế.');
  }
  if (userId !== req.userId && String(trip.ownerId) !== req.userId) {
    throw new AppError(403, 'FORBIDDEN', 'Chỉ chủ chuyến mới mời người khác ra khỏi chuyến.');
  }
  await TripModel.updateOne({ _id: trip._id }, { $pull: { memberIds: userId } });
  res.status(204).end();
});

tripsRouter.use('/:tripId/clusters', clustersRouter);
tripsRouter.use('/:tripId/places', placesRouter);
tripsRouter.use('/:tripId/checkins', checkinsRouter);
tripsRouter.use('/:tripId/expenses', expensesRouter);
tripsRouter.use('/:tripId/recap', recapRouter);
