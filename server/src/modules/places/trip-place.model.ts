import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const hoursSchema = new Schema({ open: String, close: String }, { _id: false });

// Ảnh minh hoạ lấy từ Wikimedia Commons. Lưu đường link và thông tin ghi nguồn, không tải ảnh về.
const imageSchema = new Schema(
  {
    url: { type: String, required: true, maxlength: 500 },
    author: { type: String, required: true, maxlength: 80 },
    license: { type: String, required: true, maxlength: 60 },
    licenseUrl: { type: String, maxlength: 500 },
    sourceUrl: { type: String, required: true, maxlength: 500 },
  },
  { _id: false },
);

const tripPlaceSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, required: true },
    clusterId: { type: Schema.Types.ObjectId, required: true },
    source: { type: String, required: true, enum: ['link', 'manual'] },
    placeId: { type: String, default: null },
    label: { type: String, required: true, trim: true },
    // Quán nhập thủ công chỉ cần tên, địa chỉ và cụm. Toạ độ chỉ có khi địa chỉ là link Google Maps đọc được.
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    address: { type: String, default: '', trim: true, maxlength: 200 },
    mapsUrl: { type: String, default: null },
    note: { type: String, default: '', maxlength: 500 },
    manualHours: { type: hoursSchema },
    manualPrice: { type: String, maxlength: 40 },
    image: { type: imageSchema },
    order: { type: Number, default: 0 },
    addedBy: { type: Schema.Types.ObjectId },
    // Luôn ghi false thay vì bỏ trống: partial index không hỗ trợ $exists:false
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date },
  },
  { timestamps: true },
);

tripPlaceSchema.index({ tripId: 1, clusterId: 1, order: 1 });
tripPlaceSchema.index(
  { tripId: 1, clusterId: 1, placeId: 1 },
  {
    unique: true,
    partialFilterExpression: { placeId: { $type: 'string' }, isArchived: false },
  },
);

export type TripPlaceDoc = InferSchemaType<typeof tripPlaceSchema> & { _id: Types.ObjectId };
export const TripPlaceModel = model('TripPlace', tripPlaceSchema, 'tripPlaces');
