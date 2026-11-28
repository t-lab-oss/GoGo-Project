import { describe, expect, it } from 'vitest';
import { extractDish } from '../../projects/shared/src/lib/dish';

describe('extractDish', () => {
  it.each([
    ['Bánh cuốn Thanh Trì', 'bánh cuốn'],
    ['BÁNH CUỐN BÀ XUÂN', 'bánh cuốn'],
    ['Banh cuon Ba Hanh', 'bánh cuốn'],
    ['Bánh cuon nóng', 'bánh cuốn'],
    ['Quán bun dau Cô Ba', 'bún đậu'],
    ['Bún quậy Kiến Xây', 'bún quậy'],
    ['Gỏi cá trích Ra Khơi', 'gỏi cá trích'],
    ['Phở Hà Nội', 'phở'],
    ['Hủ tíu Mỹ Tho', 'hủ tiếu'],
    ['Chuông Gió Coffee', 'cà phê'],
    ['Tiệm cà-phê Mê Linh', 'cà phê'],
    ['Ốc 79', 'ốc'],
  ])('nhận ra món trong "%s"', (name, dish) => {
    expect(extractDish(name)).toBe(dish);
  });

  it('nhận cả chuỗi Unicode dạng tổ hợp (NFD)', () => {
    expect(extractDish('Bánh cuốn'.normalize('NFD'))).toBe('bánh cuốn');
  });

  it('cụm dài thắng cụm ngắn', () => {
    expect(extractDish('Bún chả Hương Liên')).toBe('bún chả');
    expect(extractDish('Bún chả cá Đà Nẵng')).toBe('bún chả cá');
    expect(extractDish('Bún thịt nướng chị Tư')).toBe('bún thịt nướng');
    expect(extractDish('Quán nướng - Bánh tráng nướng Dì Đinh')).toBe('bánh tráng nướng');
    expect(extractDish('Mì Quảng Bà Mua')).toBe('mì quảng');
    expect(extractDish('Bánh canh chả cá')).toBe('bánh canh');
  });

  it('chỉ khớp trọn từ', () => {
    expect(extractDish('xmì')).toBeNull();
    expect(extractDish('Kemera Studio')).toBeNull();
    expect(extractDish('Phởn')).toBeNull();
  });

  it('từ đã có dấu thì phải đúng dấu', () => {
    expect(extractDish('Phố Biển')).toBeNull();
    expect(extractDish('Xin Chào Quán')).toBeNull();
    expect(extractDish('Quán của Bé')).toBeNull();
    expect(extractDish('Ghé Chơi')).toBeNull();
    expect(extractDish('Lầu Mây')).toBeNull();
  });

  it.each(['Quán Ngon', 'Highlands', 'Chợ đêm Phú Quốc', 'Sunset Sanato', '', '   ', '123'])(
    'trả null cho "%s"',
    (name) => {
      expect(extractDish(name)).toBeNull();
    },
  );
});
