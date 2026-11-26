import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Nút quay lại tròn ở góc trên bên trái của các màn hình con. */
@Component({
  selector: 'app-back-link',
  imports: [RouterLink],
  template: `
    <a [routerLink]="link()" [queryParams]="query()" class="icon-btn" aria-label="Quay lại">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </a>
  `,
})
export class BackLinkComponent {
  readonly link = input.required<string | unknown[]>();
  readonly query = input<Record<string, unknown>>({});
}
