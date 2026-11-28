import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import type { TripPlace } from 'shared';
import { TripModeService } from '../trip-mode.service';
import { PlaceSheetComponent } from './place-sheet.component';

const MAPS = 'https://maps.app.goo.gl/abc';
const place = {
  id: 'p1',
  clusterId: 'c1',
  label: 'Quán 4',
  address: '12 Trần Phú',
  mapsUrl: MAPS,
  lat: null,
  lng: null,
  image: null,
} as TripPlace;

describe('bảng thêm và sửa quán', () => {
  function setup(removable = false) {
    const api = jasmine.createSpyObj<TripModeService>('TripModeService', ['updatePlace', 'lookupLink']);
    api.updatePlace.and.returnValue(of(place));
    api.lookupLink.and.returnValue(of({ source: 'link', label: '', lat: 1, lng: 2, mapsUrl: MAPS, matchedBy: 'url' }));
    TestBed.configureTestingModule({ providers: [{ provide: TripModeService, useValue: api }] });
    const fixture = TestBed.createComponent(PlaceSheetComponent);
    fixture.componentRef.setInput('tripId', 't1');
    fixture.componentRef.setInput('clusters', [{ id: 'c1', name: 'Sáng', startTime: '06:00', endTime: '09:00' }]);
    fixture.componentRef.setInput('place', place);
    fixture.componentRef.setInput('removable', removable);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const save = () => el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    const removeButton = () =>
      Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes('Xoá khỏi cụm'));
    return { api, fixture, el, save, removeButton };
  }

  it('sửa quán có cả địa chỉ lẫn link, không đổi link thì địa chỉ được giữ', () => {
    const s = setup();
    s.save();
    expect(s.api.updatePlace.calls.mostRecent().args[2]).toEqual(
      jasmine.objectContaining({ address: '12 Trần Phú', mapsUrl: MAPS }),
    );
  });

  it('nút xoá chỉ có khi nơi dùng cho phép', () => {
    expect(setup().removeButton()).toBeUndefined();
    TestBed.resetTestingModule();
    const s = setup(true);
    const asked: TripPlace[] = [];
    s.fixture.componentInstance.removeRequested.subscribe((p) => asked.push(p));
    s.removeButton()!.click();
    expect(asked).toEqual([place]);
  });
});
