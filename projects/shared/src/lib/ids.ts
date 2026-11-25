/** ID 24 ký tự hex. Check-in và khoảnh khắc do client sinh (API Contract mục 1). */
export const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/;

export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_REGEX.test(value);
}

/** 12 byte ngẫu nhiên đổi sang hex. Chạy được cả trình duyệt lẫn Node. */
export function newClientId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
