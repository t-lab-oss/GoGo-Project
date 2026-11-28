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
  /** Ảnh đại diện lấy từ Wikimedia Commons, cùng dạng với ảnh quán. */
  cover: PlaceImage | null;
  tz: string;
  currency: string;
  ownerId: string;
  members: User[];
  days: TripDay[];
  totalSpent: number;
}

/** Ảnh minh hoạ của quán, lấy từ Wikimedia Commons. Cần ghi tác giả và giấy phép khi hiển thị. */
export interface PlaceImage {
  url: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
}

/** Một kết quả tìm ảnh từ GET /trips/:id/place-images hoặc GET /destination-images. */
export interface PlaceImageResult {
  id: number;
  thumbUrl: string;
  imageUrl: string;
  alt: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
}

export interface TripPlace {
  id: string;
  tripId: string;
  clusterId: string;
  source: 'link' | 'manual';
  placeId: string | null;
  label: string;
  /** Toạ độ chỉ có khi địa chỉ là link Google Maps đọc được. */
  lat: number | null;
  lng: number | null;
  /** Địa chỉ viết tay. Rỗng khi địa chỉ là link (xem mapsUrl). */
  address: string;
  mapsUrl: string | null;
  note: string;
  manualHours: { open: string; close: string } | null;
  manualPrice: string | null;
  image: PlaceImage | null;
  order: number;
  isArchived: boolean;
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
  /** 0,5 đến 5 sao (bước nửa sao), null nếu không chấm. */
  rating: number | null;
  /** Câu đánh giá ngắn, rỗng nếu không viết. */
  review: string;
  /** Mô tả ảnh, rỗng nếu không viết. */
  caption: string;
  expenseReminder: { skipCount: number; movedToBell: boolean };
  expense?: Expense | null;
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

export interface Cluster {
  id: string;
  tripId: string;
  name: string;
  type: ClusterType;
  startTime: string;
  endTime: string;
  order: number;
  placeCount: number;
  /** Chỉ có khi truy vấn kèm ?date= */
  state?: ClusterState;
  /** Chỉ có khi kèm ?include=places */
  places?: TripPlace[];
  /** Chỉ có khi kèm ?include=checkins (cần date) */
  checkins?: Checkin[];
}

export interface Moment {
  id: string;
  tripId: string;
  user: { id: string; username: string };
  source: MomentSource;
  checkinId: string | null;
  tripPlaceId: string | null;
  photoUrl: string;
  thumbUrl: string;
  urlExpiresAt: string;
  width: number;
  height: number;
  note: string;
  mood: Mood | null;
  takenAt: string;
  dayDate: string;
  lat: number | null;
  lng: number | null;
  placeLabel: string | null;
  isPrivate: boolean;
  isHighlight: boolean;
}

/** Kích thước và dung lượng ảnh đã nén, gửi kèm khi tạo check-in hoặc khoảnh khắc có ảnh. */
export interface PhotoMeta {
  width: number;
  height: number;
  bytes: number;
}

/** Phản hồi của POST /trips/:tripId/uploads (API Contract mục 9). */
export interface UploadTickets {
  items: { momentId: string; photo: { uploadUrl: string }; thumb: { uploadUrl: string } }[];
  expiresAt: string;
}

/** Body của PUT /trips/:tripId/checkins/:checkinId. momentId và photo đi cùng nhau. */
export interface CheckinInput {
  tripPlaceId: string;
  takenAt: string;
  lat?: number;
  lng?: number;
  momentId?: string;
  photo?: PhotoMeta;
  rating?: number;
  review?: string;
  caption?: string;
}

export interface CheckinResult {
  checkin: Checkin;
  moment: Moment | null;
}

/** Body của PUT /trips/:tripId/moments/:momentId. */
export interface MomentInput {
  source: 'camera' | 'import';
  photo: PhotoMeta;
  takenAt: string;
  note?: string;
  mood?: Mood;
  lat?: number;
  lng?: number;
  placeLabel?: string;
  tripPlaceId?: string;
  checkinId?: string;
}

export interface Notification {
  id: string;
  tripId: string;
  type: NotificationType;
  refId: string | null;
  payload: Record<string, unknown>;
  dedupeKey: string;
  readAt: string | null;
  createdAt: string;
}

/** Body của POST /trips và PATCH /trips/:tripId. */
export interface TripInput {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  /** null để gỡ ảnh đại diện, bỏ trống thì không đổi. */
  cover?: PlaceImage | null;
}

/** Body của POST và PATCH cụm. */
export interface ClusterInput {
  name: string;
  startTime: string;
  endTime: string;
}

export interface ExpenseItem {
  checkinId: string;
  tripPlaceId: string;
  placeLabel: string;
  clusterName: string;
  dayIndex: number;
  /** null nghĩa là "Chưa nhập". */
  amount: number | null;
  note: string | null;
}

/** Phản hồi của GET /trips/:tripId/expenses?groupBy=day. */
export interface ExpensesByDay {
  total: number;
  missingCount: number;
  days: { date: string; index: number; total: number; items: ExpenseItem[] }[];
}

/** Phản hồi của GET /trips/:tripId/expenses?groupBy=place. */
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

/** Recap chưa ghép ảnh: momentCount, highlight, cover, moment và moments còn để trống. */
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

/** Dự báo một ngày của chuyến. available = false (ngày đã qua hoặc còn quá xa) thì các số là null. */
export interface WeatherDay {
  date: string;
  available: boolean;
  tempMin: number | null;
  tempMax: number | null;
  precipitationProbabilityMax: number | null;
  precipitationSum: number | null;
  rain: boolean;
}

/** Phản hồi của GET /trips/:tripId/weather. */
export interface TripWeather {
  days: WeatherDay[];
  /** Có ít nhất một ngày mưa thì có lời nhắc, ngược lại null. */
  rainAdvice: string | null;
}

/** Phản hồi của GET /trips/:tripId/places/:tripPlaceId/route: đường ngắn nhất cho xe máy. */
export interface PlaceRoute {
  distanceKm: number;
  durationMinutes: number;
  /** Các điểm [lat, lng] dọc đường đi. */
  path: [number, number][];
}
