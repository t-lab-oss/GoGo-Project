import type { Checkin, Cluster, PlaceImage, PlaceImageResult } from 'shared';
import {
  checkinMoment,
  swipeDirection,
  ratingFromPosition,
  starFills,
  applyCheckin,
  dayNumber,
  directionsUrl,
  formatDayLabel,
  formatDistance,
  formatVnd,
  haversineKm,
  isSelectedImage,
  looksLikeLink,
  normalizeLink,
  pickActiveCluster,
  sortClusters,
  toMinutes,
  toPlaceImage,
  zonedParts,
} from './trip-mode.logic';

const cluster = (over: Partial<Cluster>): Cluster => ({
  id: 'c',
  tripId: 't',
  name: 'x',
  type: 'custom',
  startTime: '00:00',
  endTime: '23:59',
  order: 1,
  placeCount: 0,
  ...over,
});

describe('trip-mode.logic', () => {
  describe('sortClusters', () => {
    it('sắp theo giờ bắt đầu, cùng giờ thì theo order', () => {
      const list = [
        cluster({ id: 'dinner', startTime: '17:00', order: 3 }),
        cluster({ id: 'act', startTime: '09:00', order: 4 }),
        cluster({ id: 'bf', startTime: '06:00', order: 1 }),
        cluster({ id: 'lunch', startTime: '11:00', order: 2 }),
        cluster({ id: 'act2', startTime: '09:00', order: 2 }),
      ];
      expect(sortClusters(list).map((c) => c.id)).toEqual(['bf', 'act2', 'act', 'lunch', 'dinner']);
    });

    it('không đổi mảng gốc', () => {
      const list = [cluster({ id: 'b', startTime: '10:00' }), cluster({ id: 'a', startTime: '08:00' })];
      sortClusters(list);
      expect(list[0]!.id).toBe('b');
    });
  });

  describe('pickActiveCluster', () => {
    it('ưu tiên cụm đang tới', () => {
      const list = [
        cluster({ id: 'a', state: 'done' }),
        cluster({ id: 'b', state: 'current' }),
        cluster({ id: 'c', state: 'upcoming' }),
      ];
      expect(pickActiveCluster(list)?.id).toBe('b');
    });
    it('không có cụm đang tới thì lấy cụm sắp tới đầu tiên', () => {
      const list = [cluster({ id: 'a', state: 'done' }), cluster({ id: 'c', state: 'upcoming' })];
      expect(pickActiveCluster(list)?.id).toBe('c');
    });
    it('xong hết thì lấy cụm cuối, rỗng thì null', () => {
      const list = [cluster({ id: 'a', state: 'done' }), cluster({ id: 'b', state: 'done' })];
      expect(pickActiveCluster(list)?.id).toBe('b');
      expect(pickActiveCluster([])).toBeNull();
    });
  });

  describe('dayNumber', () => {
    const trip = {
      days: [
        { date: '2026-11-24', index: 1 },
        { date: '2026-11-25', index: 2 },
      ],
    };
    it('trả số thứ tự ngày trong chuyến', () => {
      expect(dayNumber(trip, '2026-11-25')).toBe(2);
    });
    it('ngoài chuyến thì null', () => {
      expect(dayNumber(trip, '2026-12-01')).toBeNull();
    });
  });

  describe('zonedParts', () => {
    it('đổi sang ngày giờ theo múi giờ chuyến, qua nửa đêm UTC', () => {
      // 17:30 UTC ngày 24 = 00:30 ngày 25 ở Việt Nam (UTC+7)
      const now = new Date('2026-11-24T17:30:00Z');
      expect(zonedParts(now, 'Asia/Ho_Chi_Minh')).toEqual({ date: '2026-11-25', time: '00:30' });
      expect(zonedParts(now, 'UTC')).toEqual({ date: '2026-11-24', time: '17:30' });
    });
    it('0 giờ hiện là 00 chứ không phải 24', () => {
      expect(zonedParts(new Date('2026-11-24T17:00:00Z'), 'Asia/Ho_Chi_Minh').time).toBe('00:00');
    });
  });

  describe('formatDayLabel', () => {
    it('hiện thứ và dd/MM', () => {
      expect(formatDayLabel('2026-11-23')).toBe('Thứ Hai, 23/11');
      expect(formatDayLabel('2026-11-29')).toBe('Chủ Nhật, 29/11');
    });
  });

  describe('formatVnd', () => {
    it('ngăn cách hàng nghìn bằng dấu chấm', () => {
      expect(formatVnd(240000)).toBe('240.000 đ');
      expect(formatVnd(0)).toBe('0 đ');
    });
  });

  describe('haversineKm', () => {
    it('cùng điểm thì 0', () => {
      expect(haversineKm({ lat: 10.2, lng: 103.9 }, { lat: 10.2, lng: 103.9 })).toBe(0);
    });
    it('một độ vĩ độ xấp xỉ 111 km', () => {
      expect(haversineKm({ lat: 10, lng: 103 }, { lat: 11, lng: 103 })).toBeCloseTo(111.19, 1);
    });
    it('đối xứng và đúng với hai điểm ở Phú Quốc', () => {
      const a = { lat: 10.2273, lng: 103.9673 };
      const b = { lat: 10.2154, lng: 103.9577 };
      expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
      expect(haversineKm(a, b)).toBeGreaterThan(1.4);
      expect(haversineKm(a, b)).toBeLessThan(2);
    });
  });

  describe('formatDistance', () => {
    it('dưới 50 m', () => {
      expect(formatDistance(0.03)).toBe('< 50 m');
    });
    it('dưới 1 km hiện mét, làm tròn 10 m', () => {
      expect(formatDistance(0.123)).toBe('120 m');
      expect(formatDistance(0.8)).toBe('800 m');
    });
    it('từ 1 km hiện km, dấu phẩy thập phân', () => {
      expect(formatDistance(1.43)).toBe('1,4 km');
      expect(formatDistance(2)).toBe('2,0 km');
    });
    it('từ 10 km làm tròn số nguyên', () => {
      expect(formatDistance(12.6)).toBe('13 km');
    });
  });

  describe('looksLikeLink / normalizeLink', () => {
    it('nhận ra link Google Maps, có hoặc không có https://', () => {
      for (const t of [
        'https://maps.app.goo.gl/abc',
        'http://goo.gl/maps/x',
        'maps.app.goo.gl/abc',
        'www.google.com/maps/place/Quan',
        'google.com/maps?q=1,2',
        'maps.google.com/?q=x',
        '  https://evil.com  ',
      ]) {
        expect(looksLikeLink(t)).withContext(t).toBeTrue();
      }
    });
    it('địa chỉ viết tay thì không phải link', () => {
      for (const t of ['12 Trần Hưng Đạo, Dương Đông', 'Gần chợ đêm', 'google', '']) {
        expect(looksLikeLink(t)).withContext(t).toBeFalse();
      }
    });
    it('thêm https:// khi thiếu, giữ nguyên khi đã có', () => {
      expect(normalizeLink(' maps.app.goo.gl/abc ')).toBe('https://maps.app.goo.gl/abc');
      expect(normalizeLink('http://goo.gl/x')).toBe('http://goo.gl/x');
    });
  });

  describe('directionsUrl', () => {
    const base = { mapsUrl: null, lat: null, lng: null, address: '', label: 'Quán A' };
    it('ưu tiên link Google Maps đã lưu', () => {
      expect(directionsUrl({ ...base, mapsUrl: 'https://maps.app.goo.gl/x', lat: 1, lng: 2 })).toBe(
        'https://maps.app.goo.gl/x',
      );
    });
    it('không có link thì dùng toạ độ', () => {
      expect(directionsUrl({ ...base, lat: 10.2, lng: 103.9 })).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=10.2,103.9',
      );
    });
    it('địa chỉ viết tay thì tìm trên Google Maps theo chữ đó', () => {
      expect(directionsUrl({ ...base, address: '12 Trần Hưng Đạo' })).toBe(
        'https://www.google.com/maps/search/?api=1&query=12%20Tr%E1%BA%A7n%20H%C6%B0ng%20%C4%90%E1%BA%A1o',
      );
    });
    it('không có gì khác thì tìm theo tên quán', () => {
      expect(directionsUrl(base)).toBe('https://www.google.com/maps/search/?api=1&query=Qu%C3%A1n%20A');
    });
  });

  describe('ảnh minh hoạ', () => {
    const result: PlaceImageResult = {
      id: 7,
      thumbUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/Banh_cuon_7.jpg/600px-Banh_cuon_7.jpg',
      imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/Banh_cuon_7.jpg/600px-Banh_cuon_7.jpg',
      alt: 'Bánh cuốn',
      author: 'Nguyễn An',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Banh_cuon_7.jpg',
    };

    it('toPlaceImage lưu ảnh kèm tác giả, giấy phép và link nguồn', () => {
      expect(toPlaceImage(result)).toEqual({
        url: result.imageUrl,
        author: 'Nguyễn An',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Banh_cuon_7.jpg',
      });
    });

    it('toPlaceImage bỏ trường licenseUrl khi ảnh không có (ví dụ Public domain)', () => {
      const { licenseUrl: _omit, ...noLicenseUrl } = result;
      const saved = toPlaceImage({ ...noLicenseUrl, license: 'Public domain' });
      expect('licenseUrl' in saved).toBe(false);
      expect(saved.license).toBe('Public domain');
    });

    it('isSelectedImage so theo link ảnh', () => {
      const selected: PlaceImage = toPlaceImage(result);
      expect(isSelectedImage(selected, result)).toBe(true);
      expect(isSelectedImage(selected, { ...result, imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/88/Banh_cuon_8.jpg' })).toBe(false);
      expect(isSelectedImage(null, result)).toBe(false);
    });
  });

  it('toMinutes đổi HH:mm sang phút', () => {
    expect(toMinutes('11:30')).toBe(690);
  });
});

describe('applyCheckin', () => {
  const base = { tripId: 't', name: 'x', type: 'custom' as const, startTime: '00:00', endTime: '23:59', order: 1, placeCount: 1 };

  it('đánh dấu đúng cụm đã xong và không nhân đôi check-in', () => {
    const checkin = { id: 'k', clusterId: 'a', tripPlaceId: 'p' } as Checkin;
    const clusters: Cluster[] = [
      { ...base, id: 'a', state: 'current', checkins: [] },
      { ...base, id: 'b', state: 'upcoming', checkins: [] },
    ];
    const once = applyCheckin(clusters, checkin);
    const twice = applyCheckin(once, checkin);
    expect(twice[0]!.state).toBe('done');
    expect(twice[0]!.checkins).toEqual([checkin]);
    expect(twice[1]).toBe(clusters[1]!);
  });
});

describe('checkinMoment', () => {
  const moment = (id: string, checkinId: string | null) => ({ id, checkinId }) as never;

  it('ưu tiên ảnh gắn lúc check-in, rồi tới ảnh gửi kèm check-in', () => {
    const list = [moment('m2', 'c1'), moment('m1', 'c1')];
    expect(checkinMoment(list, { id: 'c1', momentId: 'm1' })).toBe(list[1]!);
    expect(checkinMoment(list, { id: 'c1', momentId: null })).toBe(list[0]!);
  });

  it('check-in không ảnh thì null', () => {
    expect(checkinMoment([moment('m1', 'c2')], { id: 'c1', momentId: null })).toBeNull();
  });
});

describe('đánh giá nửa sao', () => {
  it('tô từng sao theo giá trị', () => {
    expect(starFills(3.5)).toEqual([100, 100, 100, 50, 0]);
    expect(starFills(0)).toEqual([0, 0, 0, 0, 0]);
  });

  it('đổi vị trí chạm thành số sao', () => {
    expect(ratingFromPosition(0)).toBe(0.5);
    expect(ratingFromPosition(0.05)).toBe(0.5);
    expect(ratingFromPosition(0.65)).toBe(3.5);
    expect(ratingFromPosition(1)).toBe(5);
  });
});

describe('swipeDirection', () => {
  it('nhận đúng bốn hướng', () => {
    expect(swipeDirection(-80, 5, 48, 64)).toBe('left');
    expect(swipeDirection(80, -5, 48, 64)).toBe('right');
    expect(swipeDirection(4, -90, 48, 64)).toBe('up');
    expect(swipeDirection(4, 90, 48, 64)).toBe('down');
  });

  it('quá ngắn hoặc kéo chéo thì bỏ qua', () => {
    expect(swipeDirection(20, 3, 48, 64)).toBeNull();
    expect(swipeDirection(2, 50, 48, 64)).toBeNull();
    expect(swipeDirection(80, 75, 48, 64)).toBeNull();
  });
});

