import type { Trip, TripSummary, User } from '../../../../projects/shared/src/public-api';
import { toCommonsImage } from '../../lib/commons-image';
import { buildDays, diffDays, tripStatus } from '../../lib/trip-dates';
import type { TripDoc } from './trip.model';

export function toTripSummary(trip: TripDoc, today: string): TripSummary {
  return {
    id: trip._id.toString(),
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: tripStatus(trip.startDate, trip.endDate, today),
    dayCount: diffDays(trip.startDate, trip.endDate) + 1,
    memberCount: trip.memberIds.length,
    coverUrl: toCommonsImage(trip.cover)?.url ?? null,
  };
}

export function toTrip(trip: TripDoc, today: string, members: User[], totalSpent: number): Trip {
  const geo = trip.destinationGeo;
  return {
    ...toTripSummary(trip, today),
    destinationGeo: geo && geo.lat != null && geo.lng != null ? { lat: geo.lat, lng: geo.lng } : null,
    cover: toCommonsImage(trip.cover),
    tz: trip.tz,
    currency: trip.currency,
    ownerId: trip.ownerId.toString(),
    members,
    days: buildDays(trip.startDate, trip.endDate),
    totalSpent,
  };
}
