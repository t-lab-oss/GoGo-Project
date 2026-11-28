import { Router } from 'express';
import type { TripWeather } from '../../../../projects/shared/src/public-api';
import { now } from '../../lib/clock';
import { addDays, buildDays, dateIn } from '../../lib/trip-dates';
import { FORECAST_DAYS, fetchForecast, geocodeDestination, type Coords, type Forecast } from '../../lib/weather';
import { TripPlaceModel } from '../places/trip-place.model';
import type { TripDoc } from '../trips/trip.model';

export const weatherRouter = Router({ mergeParams: true });

const RAIN_ADVICE = 'Nên chọn những quán có mái hiên.';

/** Toạ độ để hỏi thời tiết: của điểm đến, không có thì trung bình các quán, rồi mới tìm theo tên điểm đến. */
async function locate(trip: TripDoc): Promise<Coords | null> {
  const geo = trip.destinationGeo;
  if (geo?.lat != null && geo.lng != null) return { lat: geo.lat, lng: geo.lng };

  const places = await TripPlaceModel.find(
    { tripId: trip._id, isArchived: false, lat: { $ne: null }, lng: { $ne: null } },
    { lat: 1, lng: 1 },
  ).lean();
  if (places.length > 0) {
    const mean = (pick: (p: (typeof places)[number]) => number) =>
      places.reduce((sum, p) => sum + pick(p), 0) / places.length;
    return { lat: mean((p) => p.lat!), lng: mean((p) => p.lng!) };
  }
  return geocodeDestination(trip.destination);
}

// Chỉ đọc: không tạo thông báo, client thấy ngày mưa thì tự tạo (API Contract mục 11).
weatherRouter.get('/', async (req, res) => {
  const trip = req.trip!;
  const dates = buildDays(trip.startDate, trip.endDate).map((d) => d.date);
  const today = dateIn(now(), trip.tz);
  const last = addDays(today, FORECAST_DAYS - 1);
  const wanted = dates.filter((d) => d >= today && d <= last);

  let forecast = new Map<string, Forecast>();
  if (wanted.length > 0) {
    const at = await locate(trip);
    if (at) forecast = await fetchForecast(at, wanted[0]!, wanted[wanted.length - 1]!, trip.tz);
  }

  const days: TripWeather['days'] = dates.map((date) => {
    const f = forecast.get(date);
    return f
      ? { date, available: true, ...f }
      : {
          date,
          available: false,
          tempMin: null,
          tempMax: null,
          precipitationProbabilityMax: null,
          precipitationSum: null,
          rain: false,
        };
  });
  const body: TripWeather = { days, rainAdvice: days.some((d) => d.rain) ? RAIN_ADVICE : null };
  res.set('Cache-Control', 'no-store').json(body);
});
