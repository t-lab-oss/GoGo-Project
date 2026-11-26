/** Ảnh vuông 1:1: cắt giữa, thu về tối đa 1080px rồi nén JPEG dưới giới hạn dung lượng. */

export const PHOTO_SIDE = 1080;
export const THUMB_SIDE = 360;
export const MAX_PHOTO_BYTES = 2 * 1000 * 1000;
export const MAX_THUMB_BYTES = 200 * 1000;
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];
const MIN_SIDE = 120;

export interface CapturedPhoto {
  photo: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** Hình vuông lớn nhất nằm giữa khung hình. */
export function cropSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/** Cạnh ảnh xuất ra: không phóng to ảnh nhỏ hơn giới hạn. */
export function outputSide(side: number, max: number): number {
  return Math.max(1, Math.min(Math.round(side), max));
}

/** Giảm dần chất lượng, vẫn quá nặng thì thu nhỏ cạnh, tới khi đạt giới hạn dung lượng. */
export async function compressUnder(
  encode: (side: number, quality: number) => Promise<Blob>,
  startSide: number,
  maxBytes: number,
): Promise<{ blob: Blob; side: number }> {
  let side = startSide;
  for (;;) {
    for (const quality of QUALITIES) {
      const blob = await encode(side, quality);
      if (blob.size <= maxBytes) return { blob, side };
    }
    if (side <= MIN_SIDE) throw new Error('PHOTO_TOO_LARGE');
    side = Math.max(MIN_SIDE, Math.round(side * 0.8));
  }
}

function canvasOf(side: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NO_CANVAS');
  return { canvas, ctx };
}

/**
 * Cắt vuông ngay khung hình hiện tại (đồng bộ, để tắt camera được liền sau đó). `mirror` lật ngang
 * để ảnh giữ đúng chiều người dùng thấy trong khung ngắm của camera trước.
 */
export function grabSquare(
  source: CanvasImageSource,
  width: number,
  height: number,
  mirror = false,
): HTMLCanvasElement {
  if (!width || !height) throw new Error('EMPTY_FRAME');
  const { sx, sy, side } = cropSquare(width, height);
  const out = outputSide(side, PHOTO_SIDE);
  const { canvas, ctx } = canvasOf(out);
  if (mirror) {
    ctx.translate(out, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, sx, sy, side, side, 0, 0, out, out);
  return canvas;
}

function encoderFor(base: HTMLCanvasElement) {
  return (side: number, quality: number) => {
    let canvas = base;
    if (side !== base.width) {
      const scaled = canvasOf(side);
      scaled.ctx.drawImage(base, 0, 0, side, side);
      canvas = scaled.canvas;
    }
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('ENCODE_FAILED'))),
        'image/jpeg',
        quality,
      ),
    );
  };
}

/** Nén ảnh đã cắt vuông thành ảnh chính và thumbnail. */
export async function encodePhoto(base: HTMLCanvasElement): Promise<CapturedPhoto> {
  const encode = encoderFor(base);
  const main = await compressUnder(encode, base.width, MAX_PHOTO_BYTES);
  const thumb = await compressUnder(encode, outputSide(base.width, THUMB_SIDE), MAX_THUMB_BYTES);
  return { photo: main.blob, thumb: thumb.blob, width: main.side, height: main.side };
}

/** Đọc ảnh chọn từ máy, xoay đúng chiều theo EXIF, rồi cắt vuông. */
export async function squareFromFile(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return grabSquare(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
