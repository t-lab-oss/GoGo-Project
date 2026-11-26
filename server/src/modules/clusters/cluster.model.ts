import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const clusterSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    type: {
      type: String,
      required: true,
      enum: ['breakfast', 'lunch', 'dinner', 'activity', 'custom'],
    },
    startTime: { type: String, required: true, match: TIME },
    endTime: { type: String, required: true, match: TIME },
    order: { type: Number, required: true },
  },
  { timestamps: true },
);

clusterSchema.index({ tripId: 1, order: 1 });

export type ClusterDoc = InferSchemaType<typeof clusterSchema> & { _id: Types.ObjectId };
export const ClusterModel = model('Cluster', clusterSchema, 'clusters');
