import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    tripId: { type: Schema.Types.ObjectId, required: true },
    type: {
      type: String,
      required: true,
      enum: ['rain', 'closing_soon', 'closed_early', 'closed', 'expense_skipped'],
    },
    refId: { type: Schema.Types.ObjectId },
    payload: { type: Schema.Types.Mixed, default: () => ({}) },
    dedupeKey: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, tripId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

export type NotificationDoc = InferSchemaType<typeof notificationSchema> & { _id: Types.ObjectId };
export const NotificationModel = model('Notification', notificationSchema, 'notifications');
