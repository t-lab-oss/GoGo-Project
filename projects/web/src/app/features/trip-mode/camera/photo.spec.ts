import { compressUnder, cropSquare, encodePhoto, grabSquare, outputSide, squareFromFile } from './photo';

describe('photo', () => {
  it('cropSquare lấy hình vuông giữa khung ngang, dọc và vuông', () => {
    expect(cropSquare(1920, 1080)).toEqual({ sx: 420, sy: 0, side: 1080 });
    expect(cropSquare(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
    expect(cropSquare(500, 500)).toEqual({ sx: 0, sy: 0, side: 500 });
  });

  it('outputSide không vượt giới hạn và không phóng to ảnh nhỏ', () => {
    expect(outputSide(3000, 1080)).toBe(1080);
    expect(outputSide(480, 1080)).toBe(480);
    expect(outputSide(0, 1080)).toBe(1);
  });

  const fake = (bytes: (side: number, q: number) => number) => (side: number, q: number) =>
    Promise.resolve({ size: bytes(side, q) } as Blob);

  it('compressUnder giảm chất lượng trước, giữ nguyên cạnh', async () => {
    const r = await compressUnder(fake((_s, q) => q * 1000), 1080, 700);
    expect(r.side).toBe(1080);
    expect(r.blob.size).toBe(650);
  });

  it('compressUnder thu nhỏ cạnh khi chất lượng thấp nhất vẫn quá nặng', async () => {
    const r = await compressUnder(fake((s) => s), 1000, 700);
    expect(r.side).toBe(640);
  });

  it('compressUnder ném lỗi khi không thể đạt giới hạn', async () => {
    await expectAsync(compressUnder(fake(() => 10), 200, 1)).toBeRejectedWithError('PHOTO_TOO_LARGE');
  });

  it('grabSquare từ chối khung hình rỗng', () => {
    expect(() => grabSquare(document.createElement('canvas'), 0, 0)).toThrowError('EMPTY_FRAME');
  });

  it('ảnh chọn từ máy được cắt vuông và nén thành JPEG kèm thumbnail', async () => {
    const source = document.createElement('canvas');
    source.width = 1600;
    source.height = 1200;
    source.getContext('2d')!.fillRect(0, 0, 800, 600);
    const file = await new Promise<Blob>((resolve) => source.toBlob((b) => resolve(b!), 'image/png'));
    const result = await encodePhoto(await squareFromFile(file));
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);
    expect(result.photo.type).toBe('image/jpeg');
    expect(result.photo.size).toBeLessThanOrEqual(2_000_000);
    expect(result.thumb.size).toBeLessThanOrEqual(200_000);
    const thumb = await createImageBitmap(result.thumb);
    expect(thumb.width).toBe(360);
  });
});
