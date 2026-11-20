import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export type CurrentWeather = {
  temperatureC: number | null
  relativeHumidityPercent: number | null
  windSpeedKmh: number | null
  windDirectionDeg: number | null
  time: string | null
}

export type HourlyWeatherReading = {
  hourAhead: number
  time: string | null
  temperatureC: number | null
  relativeHumidityPercent: number | null
  windSpeedKmh: number | null
  windDirectionDeg: number | null
}

export type WeatherApiResponse = {
  source: 'open-meteo-weather-api'
  coordinates: {
    latitude: number
    longitude: number
  }
  timezone: string | null
  updatedAt: string | null
  units: {
    temperature: '°C'
    relativeHumidity: '%'
    windSpeed: 'km/h'
    windDirection: '°'
  }
  current: CurrentWeather
  forecast: HourlyWeatherReading[]
}

function degreesToCompass(deg: number | null): string {
  if (deg === null || !Number.isFinite(deg)) return '—'
  const val = Math.round(deg / 22.5)
  const directions = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ]
  return directions[val % 16] ?? '—'
}

export async function POST(request: Request) {
  let body: { latitude?: number; longitude?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'A JSON coordinate pair is required.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A JSON coordinate pair is required.' }, { status: 400 })
  }

  const { latitude, longitude } = body
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return NextResponse.json({ error: 'Coordinates are invalid.' }, { status: 400 })
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m')
  url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m')
  url.searchParams.set('wind_speed_unit', 'kmh')
  url.searchParams.set('timezone', 'auto')

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Weather service responded with HTTP ${response.status}`)
    }

    const data = await response.json()
    const current = data.current

    if (!current) {
      throw new Error('No weather readings returned for these coordinates.')
    }

    const hours = [3, 6, 12, 24]
    const times: string[] = data.hourly?.time ?? []
    const tempHourly = data.hourly?.temperature_2m ?? []
    const rhHourly = data.hourly?.relative_humidity_2m ?? []
    const windSpeedHourly = data.hourly?.wind_speed_10m ?? []
    const windDirHourly = data.hourly?.wind_direction_10m ?? []

    const currentTimestamp = current.time ? Date.parse(current.time) : Date.now()

    const nearestIndex = (targetTimeMs: number) => {
      let bestIndex = -1
      let bestDiff = Number.POSITIVE_INFINITY
      times.forEach((t, idx) => {
        const ts = Date.parse(t)
        const diff = Math.abs(ts - targetTimeMs)
        if (Number.isFinite(ts) && diff < bestDiff) {
          bestDiff = diff
          bestIndex = idx
        }
      })
      return bestDiff <= 90 * 60 * 1000 ? bestIndex : -1
    }

    const hourlyReadings: HourlyWeatherReading[] = hours.map((hour) => {
      const idx = nearestIndex(currentTimestamp + hour * 60 * 60 * 1000)
      const val = (arr: Array<number | null>) =>
        idx >= 0 && typeof arr[idx] === 'number' && Number.isFinite(arr[idx]) ? arr[idx] : null

      return {
        hourAhead: hour,
        time: idx >= 0 ? times[idx] : null,
        temperatureC: val(tempHourly),
        relativeHumidityPercent: val(rhHourly),
        windSpeedKmh: val(windSpeedHourly),
        windDirectionDeg: val(windDirHourly),
      }
    })

    const payload: WeatherApiResponse = {
      source: 'open-meteo-weather-api',
      coordinates: {
        latitude: data.latitude ?? latitude,
        longitude: data.longitude ?? longitude,
      },
      timezone: data.timezone ?? null,
      updatedAt: current.time ?? null,
      units: {
        temperature: '°C',
        relativeHumidity: '%',
        windSpeed: 'km/h',
        windDirection: '°',
      },
      current: {
        temperatureC: typeof current.temperature_2m === 'number' && Number.isFinite(current.temperature_2m) ? current.temperature_2m : null,
        relativeHumidityPercent: typeof current.relative_humidity_2m === 'number' && Number.isFinite(current.relative_humidity_2m) ? current.relative_humidity_2m : null,
        windSpeedKmh: typeof current.wind_speed_10m === 'number' && Number.isFinite(current.wind_speed_10m) ? current.wind_speed_10m : null,
        windDirectionDeg: typeof current.wind_direction_10m === 'number' && Number.isFinite(current.wind_direction_10m) ? current.wind_direction_10m : null,
        time: current.time ?? null,
      },
      forecast: hourlyReadings,
    }

    return NextResponse.json(payload)
  } catch {
    return NextResponse.json(
      {
        source: 'unavailable',
        error: 'Live weather telemetry is temporarily unavailable for these coordinates.',
      },
      { status: 502 }
    )
  }
}
