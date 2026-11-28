import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { DayWrapComponent } from './features/day-wrap/day-wrap.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DayWrapComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'web';
  protected readonly auth = inject(AuthService);
}
