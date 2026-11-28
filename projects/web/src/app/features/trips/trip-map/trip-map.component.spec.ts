import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import type { Cluster, TripPlace } from 'shared';
import { TripsApi } from '../../../core/api/trips.api';
import { TripModeService } from '../../trip-mode/trip-mode.service';
import { MAP_TILE_URL, PIN_COLORS, TripMapComponent } from './trip-map.component';

const place = (id: string, clusterId: string, lat: number | null, label = id): TripPlace =>
  ({ id, clusterId, label, lat, lng: lat === null ? null : 108.44, address: '', mapsUrl: null, image: null }) as TripPlace;

const cluster = (id: string, places: TripPlace[]) => ({ id, name: id, places }) as Cluster;

const MAPS = 'https://maps.app.goo.gl/abc';

describe('bản đồ quán', () => {
  beforeEach(() => localStorage.removeItem('gogo.mapAnchor.t1'));
  afterEach(() => localStorage.removeItem('gogo.mapAnchor.t1'));

  function setup(clusters: Cluster[], query: Record<string, string> = {}) {
    const api = jasmine.createSpyObj<TripsApi>('TripsApi', ['listClusters', 'routeToPlace']);
    api.routeToPlace.and.returnValue(
      of({ distanceKm: 2.345, durationMinutes: 7, path: [[11.94, 108.44], [11.95, 108.44]] }),
    );
    api.listClusters.and.returnValue(of(clusters));
    const links = jasmine.createSpyObj<TripModeService>('TripModeService', ['lookupLink']);
    links.lookupLink.and.returnValue(
      of({ source: 'link', label: 'Tên từ link', lat: 11.94, lng: 108.44, mapsUrl: MAPS, matchedBy: 'url' }),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: TripModeService, useValue: links },
        provideRouter([]),
        { provide: TripsApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ tripId: 't1' }),
              queryParamMap: convertToParamMap(query),
            },
          },
        },
        { provide: MAP_TILE_URL, useValue: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
      ],
    });
    const fixture = TestBed.createComponent(TripMapComponent);
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
    const pins = () => Array.from(el.querySelectorAll<HTMLElement>('.gg-pin'));
    const done = () => {
      fixture.destroy();
      el.remove();
    };
    return { fixture, el, pins, done, links, api };
  }

  const data = () => [
    cluster('sang', [place('a', 'sang', 11.94), place('b', 'sang', null)]),
    cluster('toi', [place('c', 'toi', 11.95, '<img src=x onerror=alert(1)>')]),
  ];

  it('mỗi quán có toạ độ một pin, màu theo cụm; quán thiếu toạ độ vào danh sách riêng', () => {
    const s = setup(data());
    expect(s.pins().length).toBe(2);
    expect(s.pins().map((p) => p.querySelector('path')!.getAttribute('fill'))).toEqual(PIN_COLORS.slice(0, 2));
    expect(s.fixture.componentInstance.missing().map((m) => m.place.id)).toEqual(['b']);
    s.done();
  });

  it('lọc theo cụm chỉ còn pin của cụm đó', () => {
    const s = setup(data());
    s.fixture.componentInstance.setFilter('toi');
    s.fixture.detectChanges();
    expect(s.pins().length).toBe(1);
    s.done();
  });

  it('chạm pin hiện thẻ quán; tên quán không bị hiểu là HTML', () => {
    const s = setup(data());
    s.pins()[1]!.click();
    s.fixture.detectChanges();
    expect(s.el.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(s.el.querySelector('img[src="x"]')).toBeNull();
    expect(s.el.querySelector('a[target="_blank"].btn')!.textContent).toContain('Chỉ đường');
    s.done();
  });

  it('không quán nào có toạ độ thì không dựng bản đồ', () => {
    const s = setup([cluster('sang', [place('b', 'sang', null)])]);
    expect(s.el.querySelector('.leaflet-container')).toBeNull();
    expect(s.el.textContent).toContain('Chưa có quán nào trên bản đồ');
    s.done();
  });

  // 0,01 độ vĩ tuyến là khoảng 1,1 km: "gan" cách mốc 1,1 km, "xa" cách khoảng 22 km.
  const spread = () => [cluster('sang', [place('goc', 'sang', 11.94), place('gan', 'sang', 11.95), place('xa', 'sang', 12.14)])];
  /** Mở bảng đặt mốc, điền rồi lưu. */
  function submit(s: ReturnType<typeof setup>, name: string, link: string, radiusKm = 3) {
    const c = s.fixture.componentInstance;
    s.el.querySelector<HTMLButtonElement>('[data-anchor]')!.click();
    s.fixture.detectChanges();
    c.draft = { name, link, radiusKm };
    c.submitAnchor();
    s.fixture.detectChanges();
  }

  it('màn bản đồ chỉ có một dòng đặt mốc; chạm vào mới hiện ô tên và link', () => {
    const s = setup(spread());
    expect(s.el.querySelector('#anchor-link')).toBeNull();
    const row = s.el.querySelector<HTMLButtonElement>('[data-anchor]')!;
    expect(row.textContent).toContain('Đặt mốc');
    row.click();
    s.fixture.detectChanges();
    expect(s.el.querySelector('#anchor-name')).not.toBeNull();
    expect(s.el.querySelector('#anchor-link')).not.toBeNull();
    s.done();
  });

  it('lưu mốc từ link: hiện tên, ghim đỏ và chỉ còn quán trong bán kính', () => {
    const s = setup(spread());
    submit(s, 'Khách sạn', 'maps.app.goo.gl/abc');
    expect(s.links.lookupLink).toHaveBeenCalledOnceWith('t1', MAPS);
    expect(s.el.querySelector('[data-anchor]')!.textContent).toContain('Khách sạn');
    expect(s.el.querySelector('.gg-anchor path')!.getAttribute('fill')).toBe('#E11D2E');
    expect(s.pins().length).toBe(2);
    expect(s.el.querySelector('#anchor-link')).toBeNull();
    s.done();
  });

  it('bỏ trống tên thì lấy tên đọc từ link; đổi bán kính không đọc link lại', () => {
    const s = setup(spread());
    submit(s, '', MAPS);
    expect(s.fixture.componentInstance.anchor()!.label).toBe('Tên từ link');
    submit(s, 'Nhà', MAPS, 1);
    expect(s.links.lookupLink).toHaveBeenCalledTimes(1);
    expect(s.pins().length).toBe(1);
    submit(s, 'Nhà', MAPS, 0);
    expect(s.pins().length).toBe(3);
    s.done();
  });

  it('thiếu link, không phải link, hoặc link không đọc được thì báo lỗi và giữ bảng', () => {
    const s = setup(spread());
    const c = s.fixture.componentInstance;
    submit(s, 'A', '');
    expect(c.formError()).toContain('Hãy dán link');
    c.draft = { name: 'A', link: '12 Trần Phú', radiusKm: 3 };
    c.submitAnchor();
    expect(c.formError()).toContain('chưa phải link');
    expect(s.links.lookupLink).not.toHaveBeenCalled();
    s.links.lookupLink.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { error: { code: 'PLACE_NOT_RESOLVED', message: 'x' } } })),
    );
    c.draft = { name: 'A', link: MAPS, radiusKm: 3 };
    c.submitAnchor();
    expect(c.formError()).toContain('không có toạ độ');
    expect(c.editing()).toBeTrue();
    expect(c.anchor()).toBeNull();
    s.done();
  });

  it('nhớ mốc cho lần mở sau, bỏ mốc thì quên', () => {
    const first = setup(spread());
    submit(first, 'Khách sạn', MAPS);
    first.done();

    TestBed.resetTestingModule();
    const again = setup(spread());
    expect(again.fixture.componentInstance.anchor()!.label).toBe('Khách sạn');
    expect(again.pins().length).toBe(2);
    again.fixture.componentInstance.removeAnchor();
    again.fixture.detectChanges();
    expect(again.pins().length).toBe(3);
    expect(again.el.querySelector('.gg-anchor')).toBeNull();
    expect(localStorage.getItem('gogo.mapAnchor.t1')).toBeNull();
    again.done();
  });

  it('quanh mốc không có quán thì vẫn vẽ bản đồ và nói rõ', () => {
    const s = setup(spread());
    s.links.lookupLink.and.returnValue(
      of({ source: 'link', label: '', lat: 16, lng: 108, mapsUrl: MAPS, matchedBy: 'url' }),
    );
    submit(s, 'Xa tít', MAPS);
    expect(s.pins().length).toBe(0);
    expect(s.el.querySelector('.gg-anchor')).not.toBeNull();
    expect(s.el.textContent).toContain('Không có quán nào trong 3 km');
    s.done();
  });

  it('dữ liệu mốc đã lưu bị hỏng thì coi như chưa đặt', () => {
    localStorage.setItem('gogo.mapAnchor.t1', '{"anchor":{"lat":"x"}}');
    const s = setup(spread());
    expect(s.fixture.componentInstance.anchor()).toBeNull();
    expect(s.pins().length).toBe(3);
    s.done();
  });

  const distance = (s: ReturnType<typeof setup>) =>
    s.el.querySelector('[data-distance]')!.textContent!.replace(/\s+/g, ' ').trim();
  const tapPin = (s: ReturnType<typeof setup>, index: number) => {
    s.pins()[index]!.click();
    s.fixture.detectChanges();
    TestBed.flushEffects();
    s.fixture.detectChanges();
  };

  it('có mốc: chạm quán thì hỏi đường ngắn nhất, hiện số km và vẽ đường', () => {
    const s = setup(spread());
    submit(s, 'Khách sạn', MAPS);
    tapPin(s, 1);
    expect(s.api.routeToPlace).toHaveBeenCalledOnceWith('t1', 'gan', jasmine.objectContaining({ lat: 11.94, lng: 108.44 }));
    expect(distance(s)).toContain('2,3 km từ Khách sạn');
    expect(distance(s)).toContain('Đường ngắn nhất cho xe máy, khoảng 7 phút');
    expect(s.el.querySelectorAll('path[stroke="#E11D2E"]').length).toBe(1);
    s.done();
  });

  it('chưa đặt mốc thì không hỏi đường, chỉ nhắc đặt mốc', () => {
    const s = setup(spread());
    tapPin(s, 0);
    expect(s.api.routeToPlace).not.toHaveBeenCalled();
    expect(distance(s)).toContain('Đặt mốc để biết quán cách bao xa');
    s.done();
  });

  it('không tính được đường thì báo lỗi và đưa khoảng cách đường chim bay', () => {
    const s = setup(spread());
    s.api.routeToPlace.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { error: { code: 'ROUTE_NOT_FOUND', message: 'Không có đường đi.' } } })),
    );
    submit(s, 'Khách sạn', MAPS);
    tapPin(s, 1);
    expect(distance(s)).toContain('Không có đường đi. Đường chim bay khoảng 1,1 km');
    expect(s.el.querySelectorAll('path[stroke="#E11D2E"]').length).toBe(0);
    s.done();
  });

  it('mở từ thẻ quán: chọn sẵn quán đó dù ngoài bán kính, nút quay lại về Trip Mode', () => {
    localStorage.setItem(
      'gogo.mapAnchor.t1',
      JSON.stringify({ anchor: { lat: 11.94, lng: 108.44, label: 'Khách sạn' }, radiusKm: 3 }),
    );
    const s = setup(spread(), { place: 'xa', from: 'mode', cluster: 'sang' });
    TestBed.flushEffects();
    s.fixture.detectChanges();
    expect(s.pins().length).toBe(3);
    expect(s.el.querySelector('.gg-pin--on')!.getAttribute('title')).toContain('xa');
    expect(s.api.routeToPlace.calls.mostRecent().args[1]).toBe('xa');
    expect(s.el.querySelector('app-back-link a')!.getAttribute('href')).toBe('/trips/t1/mode?cluster=sang');
    s.done();
  });

  it('quán được yêu cầu xem chưa có vị trí thì nói rõ', () => {
    const s = setup(data(), { place: 'b' });
    expect(s.el.textContent).toContain('“b” chưa có vị trí trên bản đồ');
    s.done();
  });
});
