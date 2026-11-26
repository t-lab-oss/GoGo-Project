import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const expenseSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, required: true },
    checkinId: { type: Schema.Types.ObjectId, required: true, unique: true },
    tripPlaceId: { type: Schema.Types.ObjectId, required: true },
    dayDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    amount: {
      type: Number,
      required: true,
      min: 0,
      max: 1_000_000_000,
      validate: { validator: Number.isInteger, message: 'Số tiền phải là số nguyên.' },
    },
    note: { type: String, maxlength: 200 },
    enteredBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

expenseSchema.index({ tripId: 1, dayDate: 1 });

export type ExpenseDoc = InferSchemaType<typeof expenseSchema> & { _id: Types.ObjectId };
export const ExpenseModel = model('Expense', expenseSchema, 'expenses');
