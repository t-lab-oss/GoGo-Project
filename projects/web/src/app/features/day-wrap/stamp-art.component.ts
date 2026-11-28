import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DayColor } from './day-wrap.logic';

/** Tranh ký hoạ trong tem trung tâm: nét mực run tay trên nền giấy, loang màu nước theo màu của ngày. */
@Component({
  selector: 'app-stamp-art',
  templateUrl: './stamp-art.component.html',
  host: { class: 'block h-full w-full', 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StampArtComponent {
  readonly color = input.required<DayColor>();
  readonly day = input.required<number>();
  readonly dateText = input.required<string>();
}
