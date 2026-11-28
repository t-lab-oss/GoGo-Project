import { Router } from 'express';
import { z } from 'zod';
import { isObjectId, type Notification, type NotificationType } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { now } from '../../lib/clock';
import { NotificationModel, type NotificationDoc } from './notification.model';

export const notificationsRouter = Router({ mergeParams: true });

type Stored = NotificationDoc & { createdAt: Date };

function toNotification(n: Stored): Notification {
  return {
    id: n._id.toString(),
    tripId: n.tripId.toString(),
    type: n.type as NotificationType,
    refId: n.refId ? n.refId.toString() : null,
    payload: (n.payload ?? {}) as Record<string, unknown>,
    dedupeKey: n.dedupeKey,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

const listQuery = z.object({
  unread: z.enum(['true']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Mỗi người chỉ thấy thông báo của mình
notificationsRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const mine = { userId: req.userId, tripId: req.trip!._id };
  const [rows, unreadCount] = await Promise.all([
    NotificationModel.find(q.unread ? { ...mine, readAt: null } : mine)
      .sort({ createdAt: -1, _id: -1 })
      .limit(q.limit)
      .lean<Stored[]>(),
    NotificationModel.countDocuments({ ...mine, readAt: null }),
  ]);
  res.json({ items: rows.map(toNotification), unreadCount });
});

const createSchema = z.object({
  // expense_skipped do server tạo, client không được gửi.
  type: z.enum(['rain', 'closing_soon', 'closed_early', 'closed'], { message: 'Loại thông báo chưa hợp lệ.' }),
  refId: z.string().regex(/^[0-9a-f]{24}$/, 'refId chưa đúng định dạng.').optional(),
  dedupeKey: z.string().trim().min(1).max(120),
  payload: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()]))
    .refine((p) => Object.keys(p).length <= 10, 'Quá nhiều dữ liệu kèm theo.')
    .default({}),
});

// Tạo idempotent: trùng dedupeKey thì trả bản đang có
notificationsRouter.post('/', async (req, res) => {
  const body = createSchema.parse(req.body);
  if (body.dedupeKey.startsWith('expense_skipped:')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'dedupeKey này do máy chủ dùng.');
  }
  const key = { userId: req.userId, dedupeKey: body.dedupeKey };
  const upsert = () =>
    NotificationModel.updateOne(
      key,
      { $setOnInsert: { tripId: req.trip!._id, type: body.type, refId: body.refId, payload: body.payload } },
      { upsert: true },
    );
  const result = await upsert().catch((error: { code?: number }) => {
    if (error.code !== 11000) throw error;
    return upsert();
  });
  const saved = (await NotificationModel.findOne(key).lean<Stored>())!;
  res.status(result.upsertedCount ? 201 : 200).json({ notification: toNotification(saved) });
});

const readSchema = z.object({ read: z.literal(true, { message: 'Chỉ hỗ trợ đánh dấu đã đọc.' }) });

notificationsRouter.patch('/', async (req, res) => {
  z.object({ unread: z.literal('true', { message: 'Thiếu ?unread=true.' }) }).parse(req.query);
  readSchema.parse(req.body);
  await NotificationModel.updateMany({ userId: req.userId, tripId: req.trip!._id, readAt: null }, { readAt: now() });
  res.status(204).end();
});

notificationsRouter.patch('/:notificationId', async (req, res) => {
  const id = String((req.params as Record<string, string>)['notificationId']);
  const mine = { _id: id, userId: req.userId, tripId: req.trip!._id };
  if (!isObjectId(id) || !(await NotificationModel.exists(mine))) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Không tìm thấy thông báo này.');
  }
  readSchema.parse(req.body);
  // Đọc lại lần nữa không đổi thời điểm đã đọc.
  await NotificationModel.updateOne({ ...mine, readAt: null }, { readAt: now() });
  res.json({ notification: toNotification((await NotificationModel.findOne(mine).lean<Stored>())!) });
});
