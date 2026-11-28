import { TestBed } from '@angular/core/testing';
import type { TripWeather, WeatherDay } from 'shared';
import { WeatherSheetComponent } from './weather-sheet.component';
import { weatherLine } from './weather.logic';

const day = (date: string, available: boolean, rain = false): WeatherDay => ({
  date,
  available,
  tempMin: available ? 15 : null,
  tempMax: available ? 24 : null,
  precipitationProbabilityMax: available ? (rain ? 80 : 10) : null,
  precipitationSum: available ? 1 : null,
  rain,
});

describe('thời tiết ở Trip Mode', () => {
  function render(weather: TripWeather) {
    const fixture = TestBed.createComponent(WeatherSheetComponent);
    fixture.componentRef.setInput('weather', weather);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('dòng chữ ghi trời, nhiệt độ và xác suất khi có mưa', () => {
    expect(weatherLine(day('2026-11-28', true, true))).toBe('Mưa 80% · 15–24°');
    expect(weatherLine(day('2026-11-28', true))).toBe('Ít mưa · 15–24°');
  });

  it('chi tiết hiện các ngày có dự báo, số ngày còn lại và lời nhắc mưa', () => {
    const el = render({
      days: [day('2026-11-28', true, true), day('2026-11-29', true), day('2026-11-30', false)],
      rainAdvice: 'Nên chọn những quán có mái hiên.',
    });
    expect(el.querySelectorAll('li').length).toBe(2);
    expect(el.textContent).toContain('28/11');
    expect(el.textContent).toContain('1 ngày sau đó chưa có dự báo');
    expect(el.textContent).toContain('Nên chọn những quán có mái hiên.');
  });
});
