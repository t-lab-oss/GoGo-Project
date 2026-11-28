import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwipeDirective } from './swipe.directive';
import type { SwipeDirection } from './trip-mode.logic';

@Component({
  imports: [SwipeDirective],
  template: `
    <main appSwipe (appSwipe)="page.push($event)">
      <div role="dialog" appSwipe (appSwipe)="panel.push($event)">
        <input data-swipe-x />
      </div>
    </main>
  `,
})
class HostComponent {
  readonly page: SwipeDirection[] = [];
  readonly panel: SwipeDirection[] = [];
}

describe('SwipeDirective trên ô nhập có data-swipe-x', () => {
  let host: HostComponent;
  let input: HTMLInputElement;

  beforeEach(() => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    host = fixture.componentInstance;
    input = fixture.nativeElement.querySelector('input');
  });

  afterEach(() => input.closest('main')!.parentElement!.remove());

  function swipe(dx: number, dy: number): void {
    const base = { bubbles: true, isPrimary: true, pointerId: 1 };
    input.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: 200, clientY: 200 }));
    input.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: 200 + dx, clientY: 200 + dy }));
  }

  it('lướt ngang thì chỉ khung chứa nó nhận, màn phía sau thì không', () => {
    swipe(-120, 0);
    expect(host.panel).toEqual(['left']);
    expect(host.page).toEqual([]);
  });

  it('bỏ qua lướt dọc để không đăng nhầm', () => {
    swipe(0, -150);
    expect(host.panel).toEqual([]);
  });

  it('đang gõ thì không lướt', () => {
    input.focus();
    swipe(-120, 0);
    expect(host.panel).toEqual([]);
  });
});
