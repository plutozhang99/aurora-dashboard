/** Open-Meteo: free, no API key. https://open-meteo.com */
export interface WeatherSnapshot {
  temperature: number;
  apparent: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
  daily: Array<{ date: string; max: number; min: number; code: number }>;
  hourly: Array<{ time: string; temp: number; code: number }>;
}

export async function fetchWeather(
  lat: number,
  lon: number,
  unit: 'metric' | 'imperial'
): Promise<WeatherSnapshot> {
  const tempUnit = unit === 'imperial' ? 'fahrenheit' : 'celsius';
  const windUnit = unit === 'imperial' ? 'mph' : 'kmh';
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day');
  url.searchParams.set('hourly', 'temperature_2m,weather_code');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('forecast_days', '5');
  url.searchParams.set('temperature_unit', tempUnit);
  url.searchParams.set('wind_speed_unit', windUnit);
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  const data = await res.json();

  const hourly = (data.hourly?.time as string[]).map((time, i) => ({
    time,
    temp: data.hourly.temperature_2m[i] as number,
    code: data.hourly.weather_code[i] as number,
  })).slice(0, 12);

  const daily = (data.daily?.time as string[]).map((date, i) => ({
    date,
    max: data.daily.temperature_2m_max[i] as number,
    min: data.daily.temperature_2m_min[i] as number,
    code: data.daily.weather_code[i] as number,
  }));

  return {
    temperature: data.current.temperature_2m,
    apparent: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    weatherCode: data.current.weather_code,
    isDay: !!data.current.is_day,
    hourly,
    daily,
  };
}

/** Open-Meteo WMO weather codes → emoji + label */
export function weatherIcon(code: number, isDay = true): { emoji: string; label: string } {
  if (code === 0) return { emoji: isDay ? '☀️' : '🌙', label: '晴' };
  if ([1, 2].includes(code)) return { emoji: isDay ? '🌤️' : '☁️', label: '少云' };
  if (code === 3) return { emoji: '☁️', label: '多云' };
  if ([45, 48].includes(code)) return { emoji: '🌫️', label: '雾' };
  if ([51, 53, 55, 56, 57].includes(code)) return { emoji: '🌦️', label: '毛毛雨' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { emoji: '🌧️', label: '雨' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { emoji: '🌨️', label: '雪' };
  if ([95, 96, 99].includes(code)) return { emoji: '⛈️', label: '雷雨' };
  return { emoji: '🌡️', label: '—' };
}

export async function reverseGeocode(query: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'zh');
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const r = data?.results?.[0];
  if (!r) return null;
  return { lat: r.latitude, lon: r.longitude, name: `${r.name}${r.admin1 ? '·' + r.admin1 : ''}` };
}
