import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export type GeocodeResult = {
  name: string
  displayName?: string
  latitude: number
  longitude: number
  type?: string
  importance?: number
}

function readableName(item: { name?: string; display_name: string; address?: Record<string, string> }) {
  const address = item.address ?? {}
  const specific =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.suburb ??
    address.county ??
    address.district ??
    item.name

  const region = address.state ?? address.region
  const country = address.country

  // If specific is distinct, combine specific, region, country
  const parts = [
    specific,
    region && region !== specific ? region : null,
    country && country !== region && country !== specific ? country : null,
  ].filter(Boolean)

  if (parts.length >= 2) {
    return parts.join(', ')
  }

  // Fallback to formatted display_name
  const segments = item.display_name.split(',').map((s) => s.trim())
  if (segments.length > 3) {
    return `${segments[0]}, ${segments[segments.length - 2]}, ${segments[segments.length - 1]}`
  }
  return item.display_name
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const latitude = params.get('lat')
  const longitude = params.get('lon')
  const query = params.get('q')?.trim()
  const reverse = latitude !== null || longitude !== null

  if (
    reverse &&
    (latitude === null ||
      longitude === null ||
      !Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude)) ||
      Math.abs(Number(latitude)) > 90 ||
      Math.abs(Number(longitude)) > 180)
  ) {
    return NextResponse.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 })
  }

  if (!reverse && (!query || query.length < 2 || query.length > 120)) {
    return NextResponse.json({ error: 'Enter at least 2 characters to search for a city or locality.' }, { status: 400 })
  }

  const endpoint = reverse
    ? `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude!)}&lon=${encodeURIComponent(longitude!)}&zoom=10&addressdetails=1`
    : `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query!)}&addressdetails=1&limit=6`

  try {
    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'AIRWISE-AI/1.0 (urban air quality assistant, contact: admin@airwise.ai)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'The location service is temporarily busy. Please try again in a moment.' },
        { status: 502 }
      )
    }

    const data = await response.json()

    if (reverse) {
      if (!data?.lat || !data?.lon) {
        return NextResponse.json({ name: null })
      }
      return NextResponse.json({ name: readableName(data) })
    }

    const uniqueResults = new Map<string, GeocodeResult>()
    const rawList = Array.isArray(data) ? data : []

    for (const item of rawList) {
      const lat = Number(item.lat)
      const lon = Number(item.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`
      if (!uniqueResults.has(key)) {
        uniqueResults.set(key, {
          name: readableName(item),
          displayName: item.display_name,
          latitude: lat,
          longitude: lon,
          type: item.type,
          importance: typeof item.importance === 'number' ? item.importance : undefined,
        })
      }
    }

    return NextResponse.json({ results: Array.from(uniqueResults.values()) })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Could not reach the geocoding service. Please check your network and retry.' },
      { status: 502 }
    )
  }
}
