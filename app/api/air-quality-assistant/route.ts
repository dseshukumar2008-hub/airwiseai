import { NextResponse } from 'next/server'
import { orchestrateDualAIProvider } from '@/lib/ai-provider-manager'

export const runtime = 'nodejs'

const requestWindowMs = 15 * 60 * 1000
const requestLimit = 30
const requestsByAddress = new Map<string, number[]>()

type ForecastItem = {
  time?: string | null
  aqi?: number | null
  pm25?: number | null
  pm10?: number | null
}

type WeatherTelemetry = {
  temperatureC?: number | null
  relativeHumidityPercent?: number | null
  windSpeedKmh?: number | null
  windDirectionDeg?: number | null
}

type AssistantInput = {
  locationName: string | null
  latitude?: number | null
  longitude?: number | null
  aqi: number
  pm25: number | null
  pm10: number | null
  readingLabel: string
  audience: string
  activity: string
  forecast?: Record<string | number, ForecastItem> | null
  weather?: WeatherTelemetry | null
  userQuery?: string | null
  stream?: boolean
}

const allowedAudiences = new Set([
  'general',
  'children',
  'older-adult',
  'respiratory',
  'outdoor-worker',
])

const allowedActivities = new Set([
  'school and work commute',
  'walking or cycling',
  'outdoor exercise or play',
  'ventilation and indoor air',
  'daily errands and household energy',
])

function validConcentration(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000)
  )
}

function rateLimited(address: string): boolean {
  const now = Date.now()
  const recent = (requestsByAddress.get(address) ?? []).filter(
    (timestamp) => now - timestamp < requestWindowMs
  )
  if (recent.length >= requestLimit) {
    requestsByAddress.set(address, recent)
    return true
  }
  recent.push(now)
  requestsByAddress.set(address, recent)
  if (requestsByAddress.size > 1000) {
    for (const [key, timestamps] of requestsByAddress) {
      if (!timestamps.some((timestamp) => now - timestamp < requestWindowMs)) {
        requestsByAddress.delete(key)
      }
    }
  }
  return false
}

export async function POST(request: Request) {
  let input: unknown
  try {
    const body = await request.text()
    if (body.length > 12000) {
      return NextResponse.json({ error: 'The request is too large.' }, { status: 413 })
    }
    input = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'A valid JSON request is required.' }, { status: 400 })
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return NextResponse.json(
      { error: 'The location, air-quality reading, or plan choices are invalid.' },
      { status: 400 }
    )
  }

  const fields = input as Record<string, unknown>
  if (
    typeof fields.aqi !== 'number' ||
    !Number.isFinite(fields.aqi) ||
    fields.aqi < 0 ||
    fields.aqi > 1000 ||
    !validConcentration(fields.pm25) ||
    !validConcentration(fields.pm10) ||
    !(
      fields.locationName === null ||
      (typeof fields.locationName === 'string' && fields.locationName.length <= 150)
    ) ||
    typeof fields.readingLabel !== 'string' ||
    fields.readingLabel.length > 100 ||
    typeof fields.audience !== 'string' ||
    !allowedAudiences.has(fields.audience) ||
    typeof fields.activity !== 'string' ||
    !allowedActivities.has(fields.activity)
  ) {
    return NextResponse.json(
      { error: 'The location, air-quality reading, or plan choices are invalid.' },
      { status: 400 }
    )
  }

  const validated = fields as AssistantInput
  const address =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  if (rateLimited(address)) {
    return NextResponse.json(
      { error: 'Too many plan requests. Please wait a few minutes before trying again.' },
      { status: 429 }
    )
  }

  try {
    const simulateGeminiQuota =
      request.headers.get('x-simulate-gemini-quota') === 'true' ||
      (typeof fields.simulateGeminiQuota === 'boolean' && fields.simulateGeminiQuota)

    const result = await orchestrateDualAIProvider({
      locationName: validated.locationName,
      latitude: validated.latitude,
      longitude: validated.longitude,
      aqi: validated.aqi,
      pm25: validated.pm25,
      pm10: validated.pm10,
      readingLabel: validated.readingLabel,
      audience: validated.audience,
      activity: validated.activity,
      forecast: validated.forecast,
      weather: validated.weather,
      userQuery: validated.userQuery,
      simulateGeminiQuota,
    })

    const wantsStream = validated.stream !== false
    if (wantsStream) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(result.text))
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Content-Type-Options': 'nosniff',
          'X-AI-Provider': result.provider,
          'X-AI-Model': result.model,
          'X-Is-Fallback': String(result.isFallback),
          'X-Tools-Executed': String(result.toolRounds),
          'X-Provider-Notice': result.providerNotice ? encodeURIComponent(result.providerNotice) : '',
        },
      })
    } else {
      return NextResponse.json({
        recommendation: result.text,
        provider: result.provider,
        model: result.model,
        isFallback: result.isFallback,
        toolRounds: result.toolRounds,
        providerNotice: result.providerNotice,
      })
    }
  } catch (error: any) {
    const message = error?.message || 'AI service encountered an unhandled error.'
    return NextResponse.json(
      {
        error: message,
        code: 'AI_PROVIDER_ERROR',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
