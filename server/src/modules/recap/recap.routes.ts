import { Router } from 'express';
import type { DayRecap, TripRecap } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { buildDays, timeIn } from '../../lib/trip-dates';
import { CheckinModel, type CheckinDoc } from '../checkins/checkin.model';
import { ClusterModel, type ClusterDoc } from '../clusters/cluster.model';
import { ExpenseModel, type ExpenseDoc } from '../expenses/expense.model';
import { TripPlaceModel, type TripPlaceDoc } from '../places/trip-place.model';

export const recapRouter = Router({ mergeParams: true });

/** Recap chưa có ảnh/khoảnh khắc: các trường đó trả rỗng cho tới khi làm module Khoảnh khắc. */
recapRouter.get('/', async (req, res) => {
  const trip = req.trip!;
  const days = buildDays(trip.startDate, trip.endDate).map((d) => d.date);

  const [checkins, expenses, places] = await Promise.all([
    CheckinModel.find({ tripId: trip._id, dayDate: { $in: days } }).sort({ takenAt: 1 }).lean<CheckinDoc[]>(),
    ExpenseModel.find({ tripId: trip._id, dayDate: { $in: days } }).lean<ExpenseDoc[]>(),
    TripPlaceModel.find({ tripId: trip._id }).lean<TripPlaceDoc[]>(),
  ]);
  const placeOf = new Map(places.map((p) => [String(p._id), p]));
  const spentOn = (date: string) => expenses.filter((e) => e.dayDate === date).reduce((s, e) => s + e.amount, 0);

  const recap: TripRecap = {
    stats: {
      dayCount: days.length,
      visitedCount: new Set(checkins.map((c) => String(c.tripPlaceId))).size,
      momentCount: 0,
      totalSpent: expenses.reduce((s, e) => s + e.amount, 0),
    },
    route: checkins.map((c) => {
      const place = placeOf.get(String(c.tripPlaceId));
      return {
        checkinId: String(c._id),
        label: c.placeLabel,
        lat: c.lat ?? place?.lat ?? null,
        lng: c.lng ?? place?.lng ?? null,
        takenAt: c.takenAt.toISOString(),
        dayDate: c.dayDate,
      };
    }),
    days: days.map((date, i) => ({
      date,
      index: i + 1,
      visitedCount: checkins.filter((c) => c.dayDate === date).length,
      totalSpent: spentOn(date),
      highlight: null,
    })),
    cover: null,
  };
  res.json(recap);
});

recapRouter.get('/days/:date', async (req, res) => {
  const trip = req.trip!;
  const date = String((req.params as Record<string, string>)['date']);
  const days = buildDays(trip.startDate, trip.endDate).map((d) => d.date);
  if (!days.includes(date)) {
    throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
  }

  const [checkins, expenses, clusters, places] = await Promise.all([
    CheckinModel.find({ tripId: trip._id, dayDate: date }).sort({ takenAt: 1 }).lean<CheckinDoc[]>(),
    ExpenseModel.find({ tripId: trip._id, dayDate: date }).lean<ExpenseDoc[]>(),
    ClusterModel.find({ tripId: trip._id }).lean<ClusterDoc[]>(),
    TripPlaceModel.find({ tripId: trip._id }).lean<TripPlaceDoc[]>(),
  ]);
  const expenseOf = new Map(expenses.map((e) => [String(e.checkinId), e]));
  const clusterName = new Map(clusters.map((c) => [String(c._id), c.name]));
  const placeOf = new Map(places.map((p) => [String(p._id), p]));

  const recap: DayRecap = {
    date,
    index: days.indexOf(date) + 1,
    totalSpent: expenses.reduce((s, e) => s + e.amount, 0),
    visits: checkins.map((c) => {
      const place = placeOf.get(String(c.tripPlaceId));
      const expense = expenseOf.get(String(c._id));
      return {
        checkinId: String(c._id),
        time: timeIn(c.takenAt, trip.tz),
        clusterName: clusterName.get(String(c.clusterId)) ?? '',
        label: c.placeLabel,
        lat: c.lat ?? place?.lat ?? null,
        lng: c.lng ?? place?.lng ?? null,
        amount: expense ? expense.amount : null,
        moment: null,
      };
    }),
    moments: [],
  };
  res.json(recap);
});
