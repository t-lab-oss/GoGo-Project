import { Router } from 'express';
import { z } from 'zod';
import type { ExpenseItem, ExpensesByDay, ExpensesByPlace } from '../../../../projects/shared/src/public-api';
import { buildDays } from '../../lib/trip-dates';
import { CheckinModel, type CheckinDoc } from '../checkins/checkin.model';
import { ClusterModel, type ClusterDoc } from '../clusters/cluster.model';
import { ExpenseModel, type ExpenseDoc } from './expense.model';

export const expensesRouter = Router({ mergeParams: true });

// Tổng hợp chi tiêu theo ngày hoặc theo quán. amount = null nghĩa là "Chưa nhập".
expensesRouter.get('/', async (req, res) => {
  const trip = req.trip!;
  const { groupBy } = z.object({ groupBy: z.enum(['day', 'place']).default('day') }).parse(req.query);

  const days = buildDays(trip.startDate, trip.endDate).map((d) => d.date);
  const dayIndex = new Map(days.map((d, i) => [d, i + 1]));

  const [checkins, expenses, clusters] = await Promise.all([
    CheckinModel.find({ tripId: trip._id, dayDate: { $in: days } }).sort({ takenAt: 1 }).lean<CheckinDoc[]>(),
    ExpenseModel.find({ tripId: trip._id, dayDate: { $in: days } }).lean<ExpenseDoc[]>(),
    ClusterModel.find({ tripId: trip._id }).lean<ClusterDoc[]>(),
  ]);
  const expenseOf = new Map(expenses.map((e) => [String(e.checkinId), e]));
  const clusterName = new Map(clusters.map((c) => [String(c._id), c.name]));

  const rows = checkins.map((c) => {
    const e = expenseOf.get(String(c._id));
    return {
      checkin: c,
      date: c.dayDate,
      dayIndex: dayIndex.get(c.dayDate) ?? 0,
      clusterName: clusterName.get(String(c.clusterId)) ?? '',
      amount: e ? e.amount : null,
      note: e?.note || null,
    };
  });
  const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const missingCount = rows.filter((r) => r.amount === null).length;

  if (groupBy === 'day') {
    const result: ExpensesByDay = {
      total,
      missingCount,
      days: days
        .map((date, i) => {
          const items: ExpenseItem[] = rows
            .filter((r) => r.date === date)
            .map((r) => ({
              checkinId: String(r.checkin._id),
              tripPlaceId: String(r.checkin.tripPlaceId),
              placeLabel: r.checkin.placeLabel,
              clusterName: r.clusterName,
              dayIndex: r.dayIndex,
              amount: r.amount,
              note: r.note,
            }));
          return { date, index: i + 1, total: items.reduce((s, it) => s + (it.amount ?? 0), 0), items };
        })
        .filter((d) => d.items.length > 0),
    };
    res.json(result);
    return;
  }

  const byPlace = new Map<string, ExpensesByPlace['places'][number]>();
  for (const r of rows) {
    const key = String(r.checkin.tripPlaceId);
    const group = byPlace.get(key) ?? { tripPlaceId: key, placeLabel: r.checkin.placeLabel, total: 0, visits: [] };
    group.total += r.amount ?? 0;
    group.visits.push({
      date: r.date,
      dayIndex: r.dayIndex,
      clusterName: r.clusterName,
      checkinId: String(r.checkin._id),
      amount: r.amount,
    });
    byPlace.set(key, group);
  }
  const result: ExpensesByPlace = { total, missingCount, places: [...byPlace.values()] };
  res.json(result);
});
