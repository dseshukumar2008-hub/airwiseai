import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function category(aqi: number) {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for sensitive groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very unhealthy'
  return 'Hazardous'
}

async function getOpenMeteo(latitude: number, longitude: number) {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('current', 'us_aqi,pm2_5,pm10')
  url.searchParams.set('hourly', 'us_aqi,pm2_5,pm10')
  url.searchParams.set('timezone', 'auto')
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
  if (!response.ok) throw new Error('Air quality data is unavailable.')
  const data = await response.json()
  const current = data.current
  if (!current || typeof current.us_aqi !== 'number' || !Number.isFinite(current.us_aqi)) throw new Error('No AQI reading was returned.')
  const hours = [3, 6, 12, 24]
  const times: string[] = data.hourly?.time ?? []
  const currentTimestamp = Date.parse(current.time)
  const nearestIndex = (target: number) => {
    let bestIndex = -1
    let bestDifference = Number.POSITIVE_INFINITY
    times.forEach((time, index) => {
      const timestamp = Date.parse(time)
      const difference = Math.abs(timestamp - target)
      if (Number.isFinite(timestamp) && difference < bestDifference) {
        bestDifference = difference
        bestIndex = index
      }
    })
    return bestDifference <= 90 * 60 * 1000 ? bestIndex : -1
  }
  const forecast = Object.fromEntries(hours.map((hour) => {
    const index = Number.isFinite(currentTimestamp) ? nearestIndex(currentTimestamp + hour * 60 * 60 * 1000) : -1
    const value = (key: string) => index >= 0 && typeof data.hourly?.[key]?.[index] === 'number' && Number.isFinite(data.hourly[key][index]) ? data.hourly[key][index] : null
    return [hour, { time: index >= 0 ? times[index] : null, aqi: value('us_aqi'), pm25: value('pm2_5'), pm10: value('pm10') }]
  }))
  return {
    source: 'open-meteo-air-quality-api',
    aqi: Math.round(current.us_aqi),
    category: category(current.us_aqi),
    dominantPollutant: null,
    pm25: typeof current.pm2_5 === 'number' && Number.isFinite(current.pm2_5) ? current.pm2_5 : null,
    pm10: typeof current.pm10 === 'number' && Number.isFinite(current.pm10) ? current.pm10 : null,
    updatedAt: current.time ?? null,
    timezone: data.timezone ?? null,
    units: { pm25: data.current_units?.pm2_5 ?? 'µg/m³', pm10: data.current_units?.pm10 ?? 'µg/m³' },
    requestedCoordinates: { latitude, longitude },
    resolvedCoordinates: { latitude: data.latitude, longitude: data.longitude },
    forecastSource: 'open-meteo-air-quality-api',
    forecast,
  }
}

export async function POST(request: Request) {
  let body: { latitude?: number; longitude?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'A JSON coordinate pair is required.' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'A JSON coordinate pair is required.' }, { status: 400 })
  const { latitude, longitude } = body
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: 'Coordinates are invalid.' }, { status: 400 })
  }

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (key) {
    try {
      const response = await fetch(`https://airquality.googleapis.com/v1/currentConditions:lookup?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: { latitude, longitude }, extraComputations: ['POLLUTANT_CONCENTRATION'] }),
        signal: AbortSignal.timeout(8000), cache: 'no-store',
      })
      if (response.ok) {
        const data = await response.json()
        const index = data.indexes?.find((item: { code?: string; displayName?: string }) => item.code === 'uaqi' || item.displayName === 'US AQI')
        if (index && typeof index.aqi === 'number') {
          const concentrations = Object.fromEntries((data.pollutants ?? []).map((item: { code?: string; concentration?: { value?: number } }) => [item.code, item.concentration]))
          let forecastData: Awaited<ReturnType<typeof getOpenMeteo>> | null = null
          try { forecastData = await getOpenMeteo(latitude, longitude) } catch { /* Forecasts remain unavailable when the public forecast source cannot respond. */ }
          return NextResponse.json({
            source: 'google-air-quality-api', aqi: index.aqi, category: index.category,
            dominantPollutant: index.dominantPollutant,
            pm25: concentrations['pm25']?.value ?? null, pm10: concentrations['pm10']?.value ?? null,
            updatedAt: data.dateTime ?? null,
            timezone: forecastData?.timezone ?? null,
            units: { pm25: 'µg/m³', pm10: 'µg/m³' },
            requestedCoordinates: { latitude, longitude },
            resolvedCoordinates: data.location ?? null,
            forecastSource: forecastData?.source ?? null,
            forecast: forecastData?.forecast ?? null,
          })
        }
      }
    } catch {
      // Fall through to the coordinate-based public air-quality source.
    }
  }

  try {
    return NextResponse.json(await getOpenMeteo(latitude, longitude))
  } catch {
    return NextResponse.json({ source: 'unavailable', error: 'Air-quality data is unavailable for these coordinates. Please try again later.' }, { status: 502 })
  }
}
