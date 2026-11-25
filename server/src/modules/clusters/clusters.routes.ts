import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import type { Cluster, ClusterState } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { CheckinModel } from '../checkins/checkin.model';
import { PlaceModel, type PlaceDoc } from '../places/place.model';
import { toPlaceDto } from '../places/places.routes';
import { loadTrip, param } from '../trips/trip.service';
import { daysBetween, parseObjectId, timeOf, TIME_RE, validDate } from '../trips/trip-utils';
import { ClusterModel, type ClusterDoc } from './cluster.model';

const time = z.string({ message: 'Nhập giờ.' }).regex(TIME_RE, 'Giờ chưa đúng định dạng HH:mm.');

const createSchema = z
  .object({
    name: z.string({ message: 'Nhập tên cụm.' }).trim().min(1, 'Nhập tên cụm.').max(40, 'Tên cụm tối đa 40 ký tự.'),
    startTime: time,
    endTime: time,
  })
  .refine((c) => c.startTime < c.endTime, { path: ['endTime'], message: 'Giờ kết thúc phải sau giờ bắt đầu.' });

const patchSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên cụm.').max(40, 'Tên cụm tối đa 40 ký tự.').optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  order: z.number().int().min(0).optional(),
});

function toClusterDto(c: ClusterDoc, placeCount: number): Cluster {
  return {
    id: String(c._id),
    tripId: String(c.tripId),
    name: c.name,
    type: c.type,
    startTime: c.startTime,
    endTime: c.endTime,
    order: c.order,
    placeCount,
  };
}

async function loadCluster(tripId: Types.ObjectId, clusterId: string): Promise<ClusterDoc> {
  const id = parseObjectId(clusterId, 'CLUSTER_NOT_FOUND', 'Không tìm thấy cụm này.');
  const cluster = await ClusterModel.findOne({ _id: id, tripId }).lean<ClusterDoc>();
  if (!cluster) throw new AppError(404, 'CLUSTER_NOT_FOUND', 'Không tìm thấy cụm này.');
  return cluster;
}

export const clustersRouter = Router({ mergeParams: true });

clustersRouter.get('/', async (req, res) => {
  const trip = await loadTrip(req);
  const query = z
    .object({ date: z.string().optional(), include: z.string().optional() })
    .parse(req.query);

  if (query.date && (!validDate(query.date) || !daysBetween(trip.startDate, trip.endDate).includes(query.date))) {
    throw new AppError(422, 'DATE_OUT_OF_RANGE', 'Ngày này nằm ngoài khoảng ngày của chuyến.');
  }

  const clusters = await ClusterModel.find({ tripId: trip._id }).sort({ order: 1 }).lean<ClusterDoc[]>();
  const places = await PlaceModel.find({ tripId: trip._id, isArchived: false })
    .sort({ order: 1 })
    .lean<PlaceDoc[]>();
  const byCluster = new Map<string, PlaceDoc[]>();
  for (const p of places) {
    const key = String(p.clusterId);
    byCluster.set(key, [...(byCluster.get(key) ?? []), p]);
  }

  const items = clusters.map((c) => toClusterDto(c, byCluster.get(String(c._id))?.length ?? 0));

  if (query.date) {
    const done = new Set(
      (await CheckinModel.find({ tripId: trip._id, dayDate: query.date }).lean()).map((c) => String(c.clusterId)),
    );
    const now = timeOf(new Date(), trip.tz);
    const pending = items.filter((c) => !done.has(c.id));
    const current =
      pending.find((c) => c.startTime <= now && now < c.endTime) ??
      pending.find((c) => c.startTime > now);
    for (const c of items) {
      const state: ClusterState = done.has(c.id) ? 'done' : c === current ? 'current' : 'upcoming';
      c.state = state;
    }
  }

  if (query.include?.split(',').includes('places')) {
    for (const c of items) c.places = (byCluster.get(c.id) ?? []).map(toPlaceDto);
  }

  res.json({ items });
});

clustersRouter.post('/', async (req, res) => {
  const trip = await loadTrip(req);
  const body = createSchema.parse(req.body);
  const last = await ClusterModel.findOne({ tripId: trip._id }).sort({ order: -1 }).lean<ClusterDoc>();
  const cluster = await ClusterModel.create({
    ...body,
    type: 'custom',
    tripId: trip._id,
    order: (last?.order ?? 0) + 1,
  });
  res.status(201).json({ cluster: toClusterDto(cluster.toObject() as ClusterDoc, 0) });
});

clustersRouter.get('/:clusterId', async (req, res) => {
  const trip = await loadTrip(req);
  const cluster = await loadCluster(trip._id, param(req, 'clusterId'));
  const placeCount = await PlaceModel.countDocuments({ tripId: trip._id, clusterId: cluster._id, isArchived: false });
  res.json({ cluster: toClusterDto(cluster, placeCount) });
});

clustersRouter.patch('/:clusterId', async (req, res) => {
  const trip = await loadTrip(req);
  const cluster = await loadCluster(trip._id, param(req, 'clusterId'));
  const body = patchSchema.parse(req.body);

  const startTime = body.startTime ?? cluster.startTime;
  const endTime = body.endTime ?? cluster.endTime;
  if (startTime >= endTime) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ, hãy kiểm tra lại các ô được nêu.', [
      { field: 'endTime', message: 'Giờ kết thúc phải sau giờ bắt đầu.' },
    ]);
  }

  const updated = await ClusterModel.findByIdAndUpdate(cluster._id, { $set: body }, { new: true }).lean<ClusterDoc>();
  const placeCount = await PlaceModel.countDocuments({ tripId: trip._id, clusterId: cluster._id, isArchived: false });
  res.json({ cluster: toClusterDto(updated as ClusterDoc, placeCount) });
});

clustersRouter.delete('/:clusterId', async (req, res) => {
  const trip = await loadTrip(req);
  const cluster = await loadCluster(trip._id, param(req, 'clusterId'));
  if (cluster.type !== 'custom') {
    throw new AppError(409, 'CLUSTER_PROTECTED', 'Cụm mặc định không xoá được, bạn chỉ sửa được tên và giờ.');
  }
  const count = await PlaceModel.countDocuments({ tripId: trip._id, clusterId: cluster._id, isArchived: false });
  if (count > 0) {
    throw new AppError(409, 'CLUSTER_NOT_EMPTY', 'Cụm còn quán, hãy chuyển hoặc xoá các quán trước.');
  }
  await ClusterModel.deleteOne({ _id: cluster._id });
  res.status(204).end();
});
