import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { Cluster, Trip, TripPlace } from 'shared';
import { TripsApi } from '../../../core/api/trips.api';
import { ClusterDetailComponent } from './cluster-detail.component';

const cluster = (id: string): Cluster => ({
  id,
  tripId: 't1',
  name: id,
  type: 'custom',
  startTime: '08:00',
  endTime: '10:00',
  order: 1,
  placeCount: 0,
  places: [],
});

describe('thêm và sửa quán ở màn chuẩn bị', () => {
  function setup() {
    const params = convertToParamMap({ tripId: 't1', clusterId: 'sang' });
    const api = jasmine.createSpyObj<TripsApi>('TripsApi', ['getTrip', 'listClusters', 'listCheckins']);
    api.getTrip.and.returnValue(of({ id: 't1', startDate: '2026-01-01', endDate: '2026-01-02', days: [] } as unknown as Trip));
    api.listClusters.and.returnValue(of([cluster('sang'), cluster('toi')]));
    api.listCheckins.and.returnValue(of([]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TripsApi, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params }, paramMap: of(params) } },
      ],
    });
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const component = TestBed.createComponent(ClusterDetailComponent).componentInstance;
    const place = (clusterId: string) => ({ id: 'p1', clusterId, order: 1 }) as TripPlace;
    return { component, navigate, place };
  }

  it('quán vào cụm đang xem thì hiện ngay và đóng bảng', () => {
    const s = setup();
    s.component.openSheet(null);
    s.component.onPlaceSaved(s.place('sang'));
    expect(s.component.places().map((p) => p.id)).toEqual(['p1']);
    expect(s.component.cluster()!.placeCount).toBe(1);
    expect(s.component.sheet()).toBeNull();
    expect(s.navigate).not.toHaveBeenCalled();
  });

  it('sửa quán rồi đổi cụm: quán rời cụm cũ, sang cụm mới, không nhân đôi', () => {
    const s = setup();
    s.component.onPlaceSaved(s.place('sang'));
    s.component.onPlaceSaved(s.place('toi'));
    expect(s.component.clusters().map((c) => c.placeCount)).toEqual([0, 1]);
  });

  it('chọn cụm khác trong bảng thì chuyển sang cụm đó', () => {
    const s = setup();
    s.component.onPlaceSaved(s.place('toi'));
    expect(s.component.clusters()[1]!.placeCount).toBe(1);
    expect(s.navigate).toHaveBeenCalledOnceWith(['/trips', 't1', 'clusters', 'toi']);
  });
});
