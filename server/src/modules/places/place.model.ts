import { model, Schema, type Types } from 'mongoose';

const placeSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, required: true },
    clusterId: { type: Schema.Types.ObjectId, required: true },
    source: { type: String, enum: ['link', 'manual'], required: true },
    placeId: { type: String, default: null },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    mapsUrl: { type: String, default: null },
    note: { type: String, default: '', maxlength: 500 },
    manualHours: {
      type: new Schema({ open: String, close: String }, { _id: false }),
      default: null,
    },
    manualPrice: { type: String, default: null, maxlength: 40 },
    order: { type: Number, required: true },
    addedBy: { type: Schema.Types.ObjectId, required: true },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
placeSchema.index({ tripId: 1, clusterId: 1, order: 1 });

export const PlaceModel = model('TripPlace', placeSchema, 'tripPlaces');

export interface PlaceDoc {
  _id: Types.ObjectId;
  tripId: Types.ObjectId;
  clusterId: Types.ObjectId;
  source: 'link' | 'manual';
  placeId?: string | null;
  label: string;
  lat?: number | null;
  lng?: number | null;
  mapsUrl?: string | null;
  note?: string | null;
  manualHours?: { open?: string | null; close?: string | null } | null;
  manualPrice?: string | null;
  order: number;
  isArchived?: boolean | null;
}
