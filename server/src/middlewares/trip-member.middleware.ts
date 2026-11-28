import type { RequestHandler } from 'express';
import { isObjectId } from '../../../projects/shared/src/public-api';
import { AppError } from '../lib/app-error';
import { TripModel, type TripDoc } from '../modules/trips/trip.model';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      trip?: TripDoc;
    }
  }
}

/**
 * Chỉ thành viên mới thấy chuyến. Người ngoài và ID sai định dạng đều nhận 404 TRIP_NOT_FOUND
 * để không lộ việc chuyến có tồn tại (API Contract mục 1). Cần chạy sau requireAuth.
 */
export const loadTrip: RequestHandler = async (req, _res, next) => {
  const tripId = String(req.params['tripId']);
  const trip = isObjectId(tripId)
    ? await TripModel.findOne({ _id: tripId, memberIds: req.userId }).lean<TripDoc>()
    : null;
  if (!trip) throw new AppError(404, 'TRIP_NOT_FOUND', 'Không tìm thấy chuyến đi này.');
  req.trip = trip;
  next();
};
