import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const photoSchema = new Schema(
  {
    path: { type: String, required: true },
    thumbPath: { type: String, required: true },
    width: Number,
    height: Number,
    bytes: Number,
  },
  { _id: false },
);

/** _id do client sinh (24 hex). */
const momentSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    source: { type: String, required: true, enum: ['checkin', 'camera', 'import'] },
    checkinId: { type: Schema.Types.ObjectId },
    tripPlaceId: { type: Schema.Types.ObjectId },
    photo: { type: photoSchema, required: true },
    note: { type: String, maxlength: 500 },
    mood: { type: String, enum: ['happy', 'excited', 'relaxed', 'tired', 'sad'] },
    takenAt: { type: Date, required: true },
    dayDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    lat: Number,
    lng: Number,
    placeLabel: String,
    isPrivate: { type: Boolean, default: false },
    isHighlight: { type: Boolean, default: false },
  },
  { timestamps: true },
);

momentSchema.index({ tripId: 1, takenAt: -1 });
momentSchema.index({ tripId: 1, dayDate: 1, isHighlight: 1 });

export type MomentDoc = InferSchemaType<typeof momentSchema> & { _id: Types.ObjectId };
export const MomentModel = model('Moment', momentSchema, 'moments');
