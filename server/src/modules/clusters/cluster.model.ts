import { model, Schema, type Types } from 'mongoose';

const clusterSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    type: {
      type: String,
      enum: ['breakfast', 'lunch', 'dinner', 'activity', 'custom'],
      required: true,
    },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    order: { type: Number, required: true },
  },
  { timestamps: true },
);
clusterSchema.index({ tripId: 1, order: 1 });

export const ClusterModel = model('Cluster', clusterSchema, 'clusters');

export interface ClusterDoc {
  _id: Types.ObjectId;
  tripId: Types.ObjectId;
  name: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'activity' | 'custom';
  startTime: string;
  endTime: string;
  order: number;
}

/** 4 cụm mặc định khi tạo chuyến (Database Design mục 3.4). */
export const DEFAULT_CLUSTERS = [
  { name: 'Ăn sáng', type: 'breakfast', startTime: '06:00', endTime: '09:00' },
  { name: 'Ăn trưa', type: 'lunch', startTime: '11:00', endTime: '14:00' },
  { name: 'Ăn tối', type: 'dinner', startTime: '17:00', endTime: '21:00' },
  { name: 'Đi chơi', type: 'activity', startTime: '09:00', endTime: '17:00' },
] as const;
