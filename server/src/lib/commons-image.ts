import { Schema } from 'mongoose';
import { z } from 'zod';
import type { PlaceImage } from '../../../projects/shared/src/public-api';
import { hasNoHtml, isCommonsImageUrl, isCommonsSourceUrl, isLicenseUrl } from './place-images';

/**
 * Ảnh Wikimedia Commons lưu kèm quán (ảnh minh hoạ) hoặc chuyến (ảnh đại diện).
 * Lưu đường link và thông tin ghi nguồn, không tải ảnh về.
 */
export const commonsImageSchema = new Schema(
  {
    url: { type: String, required: true, maxlength: 500 },
    author: { type: String, required: true, maxlength: 80 },
    license: { type: String, required: true, maxlength: 60 },
    licenseUrl: { type: String, maxlength: 500 },
    sourceUrl: { type: String, required: true, maxlength: 500 },
  },
  { _id: false },
);

export const commonsImageInput = z.object({
  url: z.string().refine(isCommonsImageUrl, 'Ảnh phải là link https của Wikimedia.').pipe(z.string().max(500)),
  author: z
    .string()
    .trim()
    .min(1, 'Thiếu tên tác giả ảnh.')
    .max(80, 'Tên tác giả tối đa 80 ký tự.')
    .refine((v) => hasNoHtml(v), 'Tên tác giả không được chứa thẻ HTML.'),
  license: z
    .string()
    .trim()
    .min(1, 'Thiếu giấy phép của ảnh.')
    .max(60, 'Giấy phép tối đa 60 ký tự.')
    .refine((v) => hasNoHtml(v), 'Giấy phép không được chứa thẻ HTML.'),
  licenseUrl: z
    .string()
    .refine(isLicenseUrl, 'Link giấy phép phải là link https của Creative Commons hoặc Wikimedia Commons.')
    .pipe(z.string().max(500))
    .optional(),
  sourceUrl: z
    .string()
    .refine(isCommonsSourceUrl, 'Link nguồn ảnh phải là link https của Wikimedia Commons.')
    .pipe(z.string().max(500)),
});

interface StoredImage {
  url?: string | null;
  author?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourceUrl?: string | null;
}

/** Ảnh thiếu tác giả, giấy phép hoặc nguồn (dạng dữ liệu cũ) thì coi như chưa có ảnh, không lỗi. */
export function toCommonsImage(image: StoredImage | null | undefined): PlaceImage | null {
  if (!image?.url || !image.author || !image.license || !image.sourceUrl) return null;
  return {
    url: image.url,
    author: image.author,
    license: image.license,
    ...(image.licenseUrl ? { licenseUrl: image.licenseUrl } : {}),
    sourceUrl: image.sourceUrl,
  };
}
