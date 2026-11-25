/** Kiểu dữ liệu dùng chung, khớp API Contract mục 3. Bổ sung dần khi làm từng module. */
export type TripStatus = 'upcoming' | 'ongoing' | 'finished';
export type ClusterType = 'breakfast' | 'lunch' | 'dinner' | 'activity' | 'custom';
export type ClusterState = 'done' | 'current' | 'upcoming';
export type MomentSource = 'checkin' | 'camera' | 'import';
export type Mood = 'happy' | 'excited' | 'relaxed' | 'tired' | 'sad';
export type NotificationType =
  | 'rain'
  | 'closing_soon'
  | 'closed_early'
  | 'closed'
  | 'expense_skipped';

export interface User {
  id: string;
  username: string;
  publicId: string;
}

/** Phản hồi của POST /sessions (API Contract mục 4). */
export interface AuthResponse {
  user: User;
  accessToken: string;
  expiresIn: number;
}

export interface TripSummary {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  dayCount: number;
  memberCount: number;
  coverUrl: string | null;
}

export interface TripDay {
  date: string;
  index: number;
}

export interface Trip extends TripSummary {
  destinationGeo: { lat: number; lng: number } | null;
  tz: string;
  currency: string;
  ownerId: string;
  members: User[];
  days: TripDay[];
  /** Chỉ có ở GET /trips/:tripId. */
  totalSpent?: number;
}

export interface TripInput {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export interface Cluster {
  id: string;
  tripId: string;
  name: string;
  type: ClusterType;
  startTime: string;
  endTime: string;
  order: number;
  placeCount: number;
  state?: ClusterState;
  places?: TripPlace[];
}

export interface ClusterInput {
  name: string;
  startTime: string;
  endTime: string;
}

export interface ManualHours {
  open: string;
  close: string;
}

export interface TripPlace {
  id: string;
  tripId: string;
  clusterId: string;
  source: 'link' | 'manual';
  placeId: string | null;
  label: string;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  note: string;
  manualHours: ManualHours | null;
  manualPrice: string | null;
  order: number;
  isArchived: boolean;
}

export interface PlaceInput {
  clusterId?: string;
  label: string;
  mapsUrl?: string | null;
  note?: string;
  manualHours?: ManualHours | null;
  manualPrice?: string | null;
}

export interface Expense {
  checkinId: string;
  tripPlaceId: string;
  dayDate: string;
  amount: number;
  note: string;
  enteredBy: string;
  updatedAt: string;
}

export interface Checkin {
  id: string;
  tripId: string;
  clusterId: string;
  tripPlaceId: string;
  placeLabel: string;
  userId: string;
  dayDate: string;
  takenAt: string;
  lat: number | null;
  lng: number | null;
  momentId: string | null;
  expense?: Expense | null;
}

export interface ExpenseItem {
  checkinId: string;
  tripPlaceId: string;
  placeLabel: string;
  clusterName: string;
  dayIndex: number;
  amount: number | null;
  note: string | null;
}

export interface ExpensesByDay {
  total: number;
  missingCount: number;
  days: { date: string; index: number; total: number; items: ExpenseItem[] }[];
}

export interface ExpensesByPlace {
  total: number;
  missingCount: number;
  places: {
    tripPlaceId: string;
    placeLabel: string;
    total: number;
    visits: {
      date: string;
      dayIndex: number;
      clusterName: string;
      checkinId: string;
      amount: number | null;
    }[];
  }[];
}

export interface TripRecap {
  stats: { dayCount: number; visitedCount: number; momentCount: number; totalSpent: number };
  route: {
    checkinId: string;
    label: string;
    lat: number | null;
    lng: number | null;
    takenAt: string;
    dayDate: string;
  }[];
  days: {
    date: string;
    index: number;
    visitedCount: number;
    totalSpent: number;
    highlight: null;
  }[];
  cover: null;
}

export interface DayRecap {
  date: string;
  index: number;
  totalSpent: number;
  visits: {
    checkinId: string;
    time: string;
    clusterName: string;
    label: string;
    lat: number | null;
    lng: number | null;
    amount: number | null;
    moment: null;
  }[];
  moments: never[];
}
