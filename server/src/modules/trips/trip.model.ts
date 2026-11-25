import { model, Schema, type Types } from 'mongoose';
import { DEFAULT_TZ } from './trip-utils';

const tripSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    destination: { type: String, required: true, trim: true, maxlength: 80 },
    destinationGeo: {
      type: new Schema({ lat: Number, lng: Number }, { _id: false }),
      default: null,
    },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    tz: { type: String, default: DEFAULT_TZ },
    currency: { type: String, default: 'VND' },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    memberIds: { type: [Schema.Types.ObjectId], default: [] },
    coverMomentId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);
tripSchema.index({ memberIds: 1, startDate: -1 });

export const TripModel = model('Trip', tripSchema, 'trips');

export interface TripDoc {
  _id: Types.ObjectId;
  name: string;
  destination: string;
  destinationGeo?: { lat?: number | null; lng?: number | null } | null;
  startDate: string;
  endDate: string;
  tz: string;
  currency: string;
  ownerId: Types.ObjectId;
  memberIds: Types.ObjectId[];
}
