import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const geoSchema = new Schema({ lat: Number, lng: Number }, { _id: false });
const shareSchema = new Schema(
  {
    token: { type: String, required: true },
    includeExpenses: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const tripSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    destination: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    destinationGeo: { type: geoSchema },
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    tz: { type: String, default: 'Asia/Ho_Chi_Minh' },
    currency: { type: String, default: 'VND' },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    memberIds: { type: [Schema.Types.ObjectId], default: [] },
    coverMomentId: { type: Schema.Types.ObjectId },
    share: { type: shareSchema },
  },
  { timestamps: true },
);

tripSchema.index({ memberIds: 1, startDate: -1 });
tripSchema.index(
  { 'share.token': 1 },
  { unique: true, partialFilterExpression: { 'share.token': { $type: 'string' } } },
);

export type TripDoc = InferSchemaType<typeof tripSchema> & { _id: Types.ObjectId };
export const TripModel = model('Trip', tripSchema, 'trips');
