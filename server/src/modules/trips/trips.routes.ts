import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.middleware';
import { loadTrip } from '../../middlewares/trip-member.middleware';
import { now } from '../../lib/clock';
import { dateIn } from '../../lib/trip-dates';
import { clustersRouter } from '../clusters/clusters.routes';
import { ExpenseModel } from '../expenses/expense.model';
import { placeCandidateRouter } from '../places/place-candidate.routes';
import { placeImagesRouter } from '../places/place-images.routes';
import { placesRouter } from '../places/places.routes';
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

tripsRouter.get('/:tripId', loadTrip, async (req, res) => {
  const trip = req.trip!;
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
  res.json({ trip: toTrip(trip, dateIn(now(), trip.tz), members, spent[0]?.total ?? 0) });
});

tripsRouter.use('/:tripId/clusters', loadTrip, clustersRouter);
tripsRouter.use('/:tripId/place-candidate', loadTrip, placeCandidateRouter);
tripsRouter.use('/:tripId/place-images', loadTrip, placeImagesRouter);
tripsRouter.use('/:tripId/places', loadTrip, placesRouter);
