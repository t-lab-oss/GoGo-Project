import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, viewChild } from '@angular/core';
import type { TripWeather } from 'shared';
import { trapTab } from '../dialog-keys';
import { SwipeDirective } from '../swipe.directive';
import { formatDayLabel } from '../trip-mode.logic';
import { SKY_LABEL, skyOf } from './weather.logic';

/** Dự báo theo ngày (FR-27). Có mưa thì nhắc, không tự sắp xếp lại quán. */
@Component({
  selector: 'app-weather-sheet',
  imports: [SwipeDirective],
  templateUrl: './weather-sheet.component.html',
  styleUrl: '../expense/expense-sheet.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherSheetComponent {
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  readonly weather = input.required<TripWeather>();
  readonly closed = output<void>();

  protected readonly days = computed(() =>
    this.weather()
      .days.filter((d) => d.available)
      .map((d) => ({ ...d, label: formatDayLabel(d.date), sky: skyOf(d) })),
  );
  /** Số ngày sau ngày cuối có dự báo mà chuyến vẫn còn. */
  protected readonly later = computed(() => {
    const all = this.weather().days;
    const last = all.map((d) => d.available).lastIndexOf(true);
    return last < 0 ? 0 : all.length - last - 1;
  });

  protected readonly skyLabel = SKY_LABEL;

  constructor() {
    afterNextRender(() => this.panel().nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus());
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }
    trapTab(this.panel().nativeElement, event);
  }
}
