import type { WeatherDay } from 'shared';

/** Dưới mức mưa nhưng xác suất từ đây trở lên thì coi là trời nhiều mây. */
const CLOUDY_PROBABILITY = 30;

export type Sky = 'rain' | 'cloud' | 'sun';

export const SKY_LABEL: Record<Sky, string> = { rain: 'Mưa', cloud: 'Nhiều mây', sun: 'Ít mưa' };

export function skyOf(day: WeatherDay): Sky {
  if (day.rain) return 'rain';
  return (day.precipitationProbabilityMax ?? 0) >= CLOUDY_PROBABILITY ? 'cloud' : 'sun';
}

/** Dòng chữ thời tiết hôm nay ở Trip Mode. Trời mưa thì kèm xác suất. */
export function weatherLine(day: WeatherDay): string {
  const sky = skyOf(day);
  const chance =
    sky === 'rain' && day.precipitationProbabilityMax !== null ? ` ${day.precipitationProbabilityMax}%` : '';
  return `${SKY_LABEL[sky]}${chance} · ${day.tempMin}–${day.tempMax}°`;
}
