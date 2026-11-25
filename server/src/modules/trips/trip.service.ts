import type { Request } from 'express';
import type { Trip, TripSummary } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';
import { ExpenseModel, type ExpenseDoc } from '../checkins/checkin.model';
import { toUserDto, UserModel, type UserDoc } from '../users/user.model';
import { TripModel, type TripDoc } from './trip.model';
import { dayDateOf, daysBetween, parseObjectId, tripStatus } from './trip-utils';

export const param = (req: Request, key: string): string => String(req.params[key] ?? '');

/** Chỉ thành viên mới thấy chuyến; người ngoài nhận 404 như chuyến không tồn tại. */
export async function loadTrip(req: Request): Promise<TripDoc> {
  const id = parseObjectId(param(req, 'tripId'), 'TRIP_NOT_FOUND', 'Không tìm thấy chuyến đi này.');
  const trip = await TripModel.findOne({ _id: id, memberIds: req.userId }).lean<TripDoc>();
  if (!trip) throw new AppError(404, 'TRIP_NOT_FOUND', 'Không tìm thấy chuyến đi này.');
  return trip;
}

export function toSummary(trip: TripDoc): TripSummary {
  const days = daysBetween(trip.startDate, trip.endDate);
  return {
    id: String(trip._id),
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: tripStatus(trip.startDate, trip.endDate, dayDateOf(new Date(), trip.tz)),
    dayCount: days.length,
    memberCount: trip.memberIds.length,
    coverUrl: null,
  };
}

export async function toTripDto(trip: TripDoc, withTotal: boolean): Promise<Trip> {
  const days = daysBetween(trip.startDate, trip.endDate);
  const users = await UserModel.find({ _id: { $in: trip.memberIds } }).lean<UserDoc[]>();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const members = trip.memberIds
    .map((id) => byId.get(String(id)))
    .filter((u): u is UserDoc => !!u)
    .map(toUserDto);

  const dto: Trip = {
    ...toSummary(trip),
    destinationGeo:
      trip.destinationGeo?.lat != null && trip.destinationGeo?.lng != null
        ? { lat: trip.destinationGeo.lat, lng: trip.destinationGeo.lng }
        : null,
    tz: trip.tz,
    currency: trip.currency,
    ownerId: String(trip.ownerId),
    members,
    days: days.map((date, i) => ({ date, index: i + 1 })),
  };
  if (withTotal) dto.totalSpent = await totalSpent(trip);
  return dto;
}

/** Tổng chi chỉ tính các ngày còn nằm trong chuyến (ngày bị rút bớt chỉ bị ẩn). */
export async function totalSpent(trip: TripDoc): Promise<number> {
  const days = daysBetween(trip.startDate, trip.endDate);
  const expenses = await ExpenseModel.find({ tripId: trip._id, dayDate: { $in: days } }).lean<ExpenseDoc[]>();
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}
