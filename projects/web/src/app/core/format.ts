import type { TripStatus } from 'shared';

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} đ`;
}

/** "2026-12-05" thành "05/12". */
export function formatDM(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export const STATUS_LABEL: Record<TripStatus, string> = {
  upcoming: 'Sắp đi',
  ongoing: 'Đang đi',
  finished: 'Đã xong',
};

export interface ClusterTheme {
  from: string;
  to: string;
  /** Nền nhạt dùng cho nhãn và nền trang. */
  soft: string;
  /** Màu chữ đậm cùng tông, đủ tương phản trên nền nhạt. */
  ink: string;
}

const BRAND_THEME: ClusterTheme = {
  from: '#17709F',
  to: '#3C8FBF',
  soft: '#E3F1F9',
  ink: '#17709F',
};

/** Mọi cụm dùng chung màu chủ đạo của app. */
export function clusterTheme(_type: string): ClusterTheme {
  return BRAND_THEME;
}

export function gradientCss(theme: ClusterTheme): string {
  return `linear-gradient(135deg,${theme.from},${theme.to})`;
}

const GRADIENTS = [
  'linear-gradient(160deg,#FFB3CF,#17709F)',
  'linear-gradient(160deg,#9FD3EE,#0E4F75)',
  'linear-gradient(160deg,#FFD0E1,#3C8FBF)',
  'linear-gradient(160deg,#BFE3F3,#FF8DB6)',
];

/** Màu nền ổn định theo chuỗi, thay cho ảnh bìa khi chưa có ảnh. */
export function gradientFor(seed: string): string {
  let sum = 0;
  for (const ch of seed) sum += ch.charCodeAt(0);
  return GRADIENTS[sum % GRADIENTS.length];
}

const DEV_OFFSET_KEY = 'gogo.devDayOffset';

/** Số ngày lệch để thử app như đang ở ngày khác. Chỉ dùng khi chạy dev. */
export function getDevDayOffset(): number {
  try {
    return Number(localStorage.getItem(DEV_OFFSET_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setDevDayOffset(days: number): void {
  try {
    if (days === 0) localStorage.removeItem(DEV_OFFSET_KEY);
    else localStorage.setItem(DEV_OFFSET_KEY, String(days));
  } catch {
    // Không lưu được thì bỏ qua, chỉ mất việc nhớ lựa chọn.
  }
}

/** Thời điểm "bây giờ" của app, đã cộng số ngày lệch khi thử. */
export function nowLocal(): Date {
  return new Date(Date.now() + getDevDayOffset() * 86_400_000);
}

/** Hôm nay dạng "YYYY-MM-DD" theo giờ máy. */
export function todayLocal(): string {
  const d = nowLocal();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
