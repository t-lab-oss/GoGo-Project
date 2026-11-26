import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const reminderSchema = new Schema(
  {
    skipCount: { type: Number, default: 0, min: 0 },
    movedToBell: { type: Boolean, default: false },
  },
  { _id: false },
);

/** _id do client sinh (24 hex), nên gửi lại cùng ID là idempotent. */
const checkinSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, required: true },
    clusterId: { type: Schema.Types.ObjectId, required: true },
    tripPlaceId: { type: Schema.Types.ObjectId, required: true },
    placeLabel: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    dayDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    takenAt: { type: Date, required: true },
    lat: { type: Number },
    lng: { type: Number },
    momentId: { type: Schema.Types.ObjectId, default: null },
    /** Số sao người check-in chấm khi đăng, không bắt buộc. */
    rating: { type: Number, min: 0.5, max: 5, default: null },
    /** Mô tả ảnh viết lúc đăng. */
    caption: { type: String, trim: true, maxlength: 100, default: '' },
    /** Câu đánh giá ngắn viết lúc đăng. */
    review: { type: String, trim: true, maxlength: 100, default: '' },
    expenseReminder: { type: reminderSchema, default: () => ({}) },
  },
  { timestamps: true },
);

checkinSchema.index({ tripId: 1, dayDate: 1, clusterId: 1 });
checkinSchema.index({ tripPlaceId: 1, dayDate: 1 });

export type CheckinDoc = InferSchemaType<typeof checkinSchema> & { _id: Types.ObjectId };
export const CheckinModel = model('Checkin', checkinSchema, 'checkins');
