import { Router } from 'express';
import { z } from 'zod';
import type {
  Cluster,
  ClusterState,
  ClusterType,
} from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { now } from '../../lib/clock';
import { dateIn, timeIn } from '../../lib/trip-dates';
import { toCheckin } from '../checkins/checkin.dto';
import { CheckinModel } from '../checkins/checkin.model';
import { toTripPlace } from '../places/place.dto';
import { TripPlaceModel } from '../places/trip-place.model';
import { ClusterModel, type ClusterDoc } from './cluster.model';

export const clustersRouter = Router({ mergeParams: true });

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD.')
    .optional(),
  include: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(['places', 'checkins']))),
});

/**
 * Cụm hiện tại: trong các cụm chưa xong, ưu tiên cụm có khoảng giờ chứa giờ hiện tại
 * (nhiều cụm cùng chứa thì lấy cụm bắt đầu muộn nhất, tức cụ thể nhất, vì "Đi chơi" 09:00-17:00
 * chứa cả bữa trưa). Không có thì lấy cụm chưa xong sắp tới gần nhất.
 * Chỉ tính cho ngày hôm nay; ngày khác không có cụm "current".
 */
function pickCurrent(open: ClusterDoc[], nowTime: string): string | null {
  const containing = open
    .filter((c) => c.startTime <= nowTime && nowTime < c.endTime)
    .sort((a, b) => b.startTime.localeCompare(a.startTime));
  if (containing[0]) return containing[0]._id.toString();
  const upcoming = open
    .filter((c) => c.startTime > nowTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  return upcoming[0] ? upcoming[0]._id.toString() : null;
}

clustersRouter.get('/', async (req, res) => {
  const trip = req.trip!;
  const { date, include } = querySchema.parse(req.query);

  if (include.includes('checkins') && !date) {
    throw new AppError(400, 'VALIDATION_ERROR', 'include=checkins cần kèm date.', [
      { field: 'date', message: 'Cần ngày để lấy check-in.' },
    ]);
  }
  if (date && (date < trip.startDate || date > trip.endDate)) {
    throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
  }

  const clusters = await ClusterModel.find({ tripId: trip._id }).sort({ order: 1 }).lean<ClusterDoc[]>();
  const places = await TripPlaceModel.find({ tripId: trip._id, isArchived: false })
    .sort({ order: 1 })
    .lean();
  const checkins = date
    ? await CheckinModel.find({ tripId: trip._id, dayDate: date }).sort({ takenAt: 1 }).lean()
    : [];

  const doneIds = new Set(checkins.map((c) => c.clusterId.toString()));
  let currentId: string | null = null;
  if (date) {
    const at = now();
    if (date === dateIn(at, trip.tz)) {
      currentId = pickCurrent(
        clusters.filter((c) => !doneIds.has(c._id.toString())),
        timeIn(at, trip.tz),
      );
    }
  }

  const items: Cluster[] = clusters.map((c) => {
    const id = c._id.toString();
    const own = places.filter((p) => p.clusterId.toString() === id);
    const item: Cluster = {
      id,
      tripId: trip._id.toString(),
      name: c.name,
      type: c.type as ClusterType,
      startTime: c.startTime,
      endTime: c.endTime,
      order: c.order,
      placeCount: own.length,
    };
    if (date) {
      const state: ClusterState = doneIds.has(id) ? 'done' : id === currentId ? 'current' : 'upcoming';
      item.state = state;
    }
    if (include.includes('places')) item.places = own.map(toTripPlace);
    if (include.includes('checkins')) {
      item.checkins = checkins.filter((k) => k.clusterId.toString() === id).map(toCheckin);
    }
    return item;
  });

  res.json({ items });
});
