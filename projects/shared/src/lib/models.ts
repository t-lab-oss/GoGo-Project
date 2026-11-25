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
