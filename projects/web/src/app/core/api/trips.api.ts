import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type {
  Checkin,
  Cluster,
  ClusterInput,
  DayRecap,
  Expense,
  ExpensesByDay,
  ExpensesByPlace,
  PlaceImageResult,
  PlaceRoute,
  Trip,
  TripInput,
  TripPlace,
  TripRecap,
  TripSummary,
  User,
} from 'shared';

/** Mọi lời gọi API của chuyến đi, cụm, quán, check-in, chi tiêu và recap. Component không gọi HttpClient trực tiếp. */
@Injectable({ providedIn: 'root' })
export class TripsApi {
  private readonly http = inject(HttpClient);

  // Chuyến đi
  listTrips(): Observable<TripSummary[]> {
    return this.http.get<{ items: TripSummary[] }>('/api/trips').pipe(map((r) => r.items));
  }

  getTrip(id: string): Observable<Trip> {
    return this.http.get<{ trip: Trip }>(`/api/trips/${id}`).pipe(map((r) => r.trip));
  }

  createTrip(input: TripInput): Observable<Trip> {
    return this.http.post<{ trip: Trip }>('/api/trips', input).pipe(map((r) => r.trip));
  }

  updateTrip(
    id: string,
    input: Partial<TripInput> & { confirmShrink?: boolean },
  ): Observable<Trip> {
    return this.http.patch<{ trip: Trip }>(`/api/trips/${id}`, input).pipe(map((r) => r.trip));
  }

  deleteTrip(id: string, confirmName: string): Observable<void> {
    const params = new HttpParams().set('confirmName', confirmName);
    return this.http.delete<void>(`/api/trips/${id}`, { params });
  }

  addMember(tripId: string, identifier: string): Observable<User> {
    return this.http
      .post<{ member: User }>(`/api/trips/${tripId}/members`, { identifier })
      .pipe(map((r) => r.member));
  }

  removeMember(tripId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`/api/trips/${tripId}/members/${userId}`);
  }

  /** Gợi ý ảnh đại diện theo điểm đến (Wikimedia Commons). Không lưu gì. */
  searchDestinationImages(q: string): Observable<PlaceImageResult[]> {
    return this.http
      .get<{ items: PlaceImageResult[] }>('/api/destination-images', { params: { q } })
      .pipe(map((r) => r.items));
  }

  /** Đường ngắn nhất cho xe máy từ một điểm đến quán. */
  routeToPlace(tripId: string, placeId: string, from: { lat: number; lng: number }): Observable<PlaceRoute> {
    return this.http.get<PlaceRoute>(`/api/trips/${tripId}/places/${placeId}/route`, {
      params: { fromLat: from.lat, fromLng: from.lng },
    });
  }

  // Cụm
  listClusters(tripId: string, withPlaces = false): Observable<Cluster[]> {
    let params = new HttpParams();
    if (withPlaces) params = params.set('include', 'places');
    return this.http
      .get<{ items: Cluster[] }>(`/api/trips/${tripId}/clusters`, { params })
      .pipe(map((r) => r.items));
  }

  createCluster(tripId: string, input: ClusterInput): Observable<Cluster> {
    return this.http
      .post<{ cluster: Cluster }>(`/api/trips/${tripId}/clusters`, input)
      .pipe(map((r) => r.cluster));
  }

  updateCluster(
    tripId: string,
    clusterId: string,
    input: Partial<ClusterInput>,
  ): Observable<Cluster> {
    return this.http
      .patch<{ cluster: Cluster }>(`/api/trips/${tripId}/clusters/${clusterId}`, input)
      .pipe(map((r) => r.cluster));
  }

  deleteCluster(tripId: string, clusterId: string): Observable<void> {
    return this.http.delete<void>(`/api/trips/${tripId}/clusters/${clusterId}`);
  }

  // Quán
  listPlaces(tripId: string, clusterId: string): Observable<TripPlace[]> {
    const params = new HttpParams().set('clusterId', clusterId);
    return this.http
      .get<{ items: TripPlace[] }>(`/api/trips/${tripId}/places`, { params })
      .pipe(map((r) => r.items));
  }

  deletePlace(tripId: string, placeId: string): Observable<void> {
    return this.http.delete<void>(`/api/trips/${tripId}/places/${placeId}`);
  }

  // Check-in và chi tiêu
  putCheckin(
    tripId: string,
    checkinId: string,
    tripPlaceId: string,
    takenAt: string,
  ): Observable<Checkin> {
    return this.http
      .put<{ checkin: Checkin }>(`/api/trips/${tripId}/checkins/${checkinId}`, {
        tripPlaceId,
        takenAt,
      })
      .pipe(map((r) => r.checkin));
  }

  listCheckins(
    tripId: string,
    opts: { date?: string; withExpense?: boolean } = {},
  ): Observable<Checkin[]> {
    let params = new HttpParams();
    if (opts.date) params = params.set('date', opts.date);
    if (opts.withExpense) params = params.set('include', 'expense');
    return this.http
      .get<{ items: Checkin[] }>(`/api/trips/${tripId}/checkins`, { params })
      .pipe(map((r) => r.items));
  }

  putExpense(tripId: string, checkinId: string, amount: number, note: string): Observable<Expense> {
    return this.http
      .put<{ expense: Expense }>(`/api/trips/${tripId}/checkins/${checkinId}/expense`, {
        amount,
        note,
      })
      .pipe(map((r) => r.expense));
  }

  expensesByDay(tripId: string): Observable<ExpensesByDay> {
    return this.http.get<ExpensesByDay>(`/api/trips/${tripId}/expenses`, {
      params: { groupBy: 'day' },
    });
  }

  expensesByPlace(tripId: string): Observable<ExpensesByPlace> {
    return this.http.get<ExpensesByPlace>(`/api/trips/${tripId}/expenses`, {
      params: { groupBy: 'place' },
    });
  }

  // Recap
  recap(tripId: string): Observable<TripRecap> {
    return this.http.get<TripRecap>(`/api/trips/${tripId}/recap`);
  }

  dayRecap(tripId: string, date: string): Observable<DayRecap> {
    return this.http.get<DayRecap>(`/api/trips/${tripId}/recap/days/${date}`);
  }
}
