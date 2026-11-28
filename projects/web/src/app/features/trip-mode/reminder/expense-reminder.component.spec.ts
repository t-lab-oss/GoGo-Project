import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import type { Checkin } from 'shared';
import { ExpenseSaver } from '../expense/expense-saver';
import { ExpenseReminderComponent } from './expense-reminder.component';

const checkin = {
  id: 'c1',
  placeLabel: 'Quán 3',
  expenseReminder: { skipCount: 0, movedToBell: false },
} as Checkin;

describe('thẻ nhắc nhập tiền', () => {
  function setup() {
    const saver = jasmine.createSpyObj<ExpenseSaver>('ExpenseSaver', ['save']);
    saver.save.and.returnValue(of({ queued: false }));
    TestBed.configureTestingModule({ providers: [{ provide: ExpenseSaver, useValue: saver }] });
    const fixture = TestBed.createComponent(ExpenseReminderComponent);
    fixture.componentRef.setInput('tripId', 't1');
    fixture.componentRef.setInput('checkin', checkin);
    const saved: { queued: boolean }[] = [];
    let skips = 0;
    fixture.componentInstance.saved.subscribe((r) => saved.push(r));
    fixture.componentInstance.skipped.subscribe(() => skips++);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    const type = (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const submit = () => {
      el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
      fixture.detectChanges();
    };
    /** Kéo trên tiêu đề từ (100, 100) đi dx, dy rồi thả. */
    const drag = (dx: number, dy = 0, from: Element = el.querySelector('h2')!) => {
      const fire = (name: string, x: number, y: number) =>
        from.dispatchEvent(
          new PointerEvent(name, { bubbles: true, isPrimary: true, pointerId: 1, clientX: x, clientY: y }),
        );
      spyOn(el, 'setPointerCapture');
      fire('pointerdown', 100, 100);
      fire('pointermove', 100 + dx, 100 + dy);
      fire('pointerup', 100 + dx, 100 + dy);
      tick(200);
    };
    return { saver, fixture, el, input, type, submit, drag, saved, skips: () => skips };
  }

  it('nhập ngay trên thẻ: định dạng số tiền rồi lưu', () => {
    const s = setup();
    s.type('50000a');
    expect(s.input.value).toBe('50.000');
    s.submit();
    expect(s.saver.save).toHaveBeenCalledOnceWith('t1', {
      checkinId: 'c1',
      placeLabel: 'Quán 3',
      amount: 50000,
      note: '',
    });
    expect(s.saved).toEqual([{ queued: false }]);
  });

  it('chưa nhập gì thì báo lỗi, không gửi', () => {
    const s = setup();
    s.submit();
    expect(s.saver.save).not.toHaveBeenCalled();
    expect(s.el.querySelector('[role="alert"]')?.textContent).toContain('Hãy nhập số tiền');
  });

  it('lưu lỗi thì giữ số đã nhập và hiện lỗi', () => {
    const s = setup();
    s.saver.save.and.returnValue(throwError(() => new Error('Máy chủ đang bận.')));
    s.type('20000');
    s.submit();
    expect(s.input.value).toBe('20.000');
    expect(s.el.querySelector('[role="alert"]')?.textContent).toContain('Máy chủ đang bận.');
    expect(s.saved).toEqual([]);
  });

  it('lướt phải đủ xa thì bỏ qua', fakeAsync(() => {
    const s = setup();
    s.drag(140);
    expect(s.skips()).toBe(1);
  }));

  for (const [name, dx, dy] of [
    ['lướt phải ngắn', 50, 0],
    ['lướt trái', -140, 0],
    ['cuộn dọc', 20, 140],
  ] as const) {
    it(`${name} thì không bỏ qua`, fakeAsync(() => {
      const s = setup();
      s.drag(dx, dy);
      expect(s.skips()).toBe(0);
    }));
  }

  it('thẻ rung và nhích gợi ý lúc mới hiện, chạm vào ô nhập thì thôi', () => {
    const s = setup();
    const track = s.el.querySelector('[data-track]')!;
    expect(track.classList).toContain('nudge');
    s.input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    s.fixture.detectChanges();
    expect(track.classList).not.toContain('nudge');
  });

  it('kéo đủ xa thì lớp bên dưới đổi thành "Thả để bỏ qua"', () => {
    const s = setup();
    const behind = () => s.el.querySelector('[data-behind]')!.textContent!.trim();
    const title = s.el.querySelector('h2')!;
    spyOn(s.el, 'setPointerCapture');
    const fire = (name: string, x: number) => {
      title.dispatchEvent(
        new PointerEvent(name, { bubbles: true, isPrimary: true, pointerId: 1, clientX: x, clientY: 0 }),
      );
      s.fixture.detectChanges();
    };
    fire('pointerdown', 0);
    fire('pointermove', 40);
    expect(behind()).toBe('Bỏ qua');
    fire('pointermove', 120);
    expect(behind()).toBe('Thả để bỏ qua');
    fire('pointercancel', 120);
    expect(behind()).toBe('Bỏ qua');
  });

  it('chưa chọn ô nhập thì lướt từ ô đó vẫn bỏ qua', fakeAsync(() => {
    const s = setup();
    s.drag(140, 0, s.input);
    expect(s.skips()).toBe(1);
  }));

  it('đang gõ trong ô nhập thì kéo là chọn chữ, không bỏ qua', fakeAsync(() => {
    const s = setup();
    s.input.focus();
    s.drag(140, 0, s.input);
    expect(s.skips()).toBe(0);
  }));
});
