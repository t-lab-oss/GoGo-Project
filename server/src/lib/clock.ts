/** Đồng hồ có thể ghi đè để test tính "hôm nay" và "cụm đang tới" mà không phụ thuộc giờ máy. */
let override: Date | null = null;

export const now = (): Date => override ?? new Date();

export function setNow(date: Date | null): void {
  override = date;
}
