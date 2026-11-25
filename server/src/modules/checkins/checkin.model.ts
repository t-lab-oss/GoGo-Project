import { model, Schema, type Types } from 'mongoose';

const checkinSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, required: true },
    clusterId: { type: Schema.Types.ObjectId, required: true },
    tripPlaceId: { type: Schema.Types.ObjectId, required: true },
    placeLabel: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    dayDate: { type: String, required: true },
    takenAt: { type: Date, required: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    momentId: { type: Schema.Types.ObjectId, default: null },
    expenseReminder: {
      type: new Schema(
        { skipCount: { type: Number, default: 0 }, movedToBell: { type: Boolean, default: false } },
        { _id: false },
      ),
      default: () => ({ skipCount: 0, movedToBell: false }),
    },
  },
  { timestamps: true },
);
checkinSchema.index({ tripId: 1, dayDate: 1, clusterId: 1 });
checkinSchema.index({ tripPlaceId: 1, dayDate: 1 });

export const CheckinModel = model('Checkin', checkinSchema, 'checkins');

export interface CheckinDoc {
  _id: Types.ObjectId;
  tripId: Types.ObjectId;
  clusterId: Types.ObjectId;
  tripPlaceId: Types.ObjectId;
  placeLabel: string;
  userId: Types.ObjectId;
  dayDate: string;
  takenAt: Date;
  lat?: number | null;
  lng?: number | null;
  momentId?: Types.ObjectId | null;
}

const expenseSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, required: true },
    checkinId: { type: Schema.Types.ObjectId, required: true, unique: true },
    tripPlaceId: { type: Schema.Types.ObjectId, required: true },
    dayDate: { type: String, required: true },
    amount: { type: Number, required: true, min: 0, max: 1_000_000_000 },
    note: { type: String, default: '', maxlength: 200 },
    enteredBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);
expenseSchema.index({ tripId: 1, dayDate: 1 });

export const ExpenseModel = model('Expense', expenseSchema, 'expenses');

export interface ExpenseDoc {
  _id: Types.ObjectId;
  tripId: Types.ObjectId;
  checkinId: Types.ObjectId;
  tripPlaceId: Types.ObjectId;
  dayDate: string;
  amount: number;
  note?: string | null;
  enteredBy: Types.ObjectId;
  updatedAt: Date;
}
