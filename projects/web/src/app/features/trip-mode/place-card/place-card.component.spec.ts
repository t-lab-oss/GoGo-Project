import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TripPlace } from 'shared';
import { PlaceCardComponent } from './place-card.component';

describe('mặt sau thẻ quán', () => {
  it('có dòng "Xem trên bản đồ" mở đúng quán, bấm vào không lật thẻ', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PlaceCardComponent);
    fixture.componentRef.setInput('place', {
      id: 'p1',
      tripId: 't1',
      clusterId: 'c1',
      label: 'Quán 4',
      address: '12 Trần Phú',
      lat: 10,
      lng: 103,
      mapsUrl: null,
      image: null,
    } as TripPlace);
    fixture.componentRef.setInput('flipped', true);
    let flips = 0;
    fixture.componentInstance.flipToggle.subscribe(() => flips++);
    fixture.detectChanges();
    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find(
      (a) => a.textContent!.trim() === 'Xem trên bản đồ',
    )!;
    expect(link.getAttribute('href')).toBe('/trips/t1/map?place=p1&from=mode&cluster=c1');
    link.addEventListener('click', (e) => e.preventDefault());
    link.click();
    expect(flips).toBe(0);
  });
});
