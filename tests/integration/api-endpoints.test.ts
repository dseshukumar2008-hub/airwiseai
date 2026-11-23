import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST as airQualityHandler } from '@/app/api/air-quality/route'
import { POST as weatherHandler } from '@/app/api/weather/route'
import { GET as geocodeHandler } from '@/app/api/geocode/route'
import { POST as assistantHandler } from '@/app/api/air-quality-assistant/route'

describe('API Endpoints Integration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('POST /api/air-quality', () => {
    it('returns 400 for invalid coordinate payload', async () => {
      const request = new Request('http://localhost:3000/api/air-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: 150, longitude: 80 }), // latitude > 90
      })
      const response = await airQualityHandler(request)
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toMatch(/coordinates are invalid/i)
    })

    it('returns air quality reading from mock open-meteo provider', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY

      const mockOpenMeteo = {
        latitude: 16.5,
        longitude: 80.625,
        timezone: 'Asia/Kolkata',
        current: {
          time: '2026-11-23T11:00',
          us_aqi: 154,
          pm2_5: 61.7,
          pm10: 95.0,
        },
        current_units: {
          pm2_5: 'µg/m³',
          pm10: 'µg/m³',
        },
        hourly: {
          time: ['2026-11-23T14:00', '2026-11-23T17:00'],
          us_aqi: [140, 130],
          pm2_5: [55.0, 50.0],
          pm10: [85.0, 80.0],
        },
      }

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockOpenMeteo,
        })
      )

      const request = new Request('http://localhost:3000/api/air-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: 16.5033, longitude: 80.6465 }),
      })
      const response = await airQualityHandler(request)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.aqi).toBe(154)
      expect(data.category).toBe('Unhealthy')
      expect(data.pm25).toBe(61.7)
      expect(data.source).toBe('open-meteo-air-quality-api')
    })
  })

  describe('POST /api/weather', () => {
    it('returns 400 for non-numeric body', async () => {
      const request = new Request('http://localhost:3000/api/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: 'abc', longitude: 80 }),
      })
      const response = await weatherHandler(request)
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toMatch(/coordinates are invalid/i)
    })

    it('returns weather telemetry from mock provider', async () => {
      const mockWeather = {
        latitude: 16.5,
        longitude: 80.625,
        timezone: 'Asia/Kolkata',
        current: {
          time: '2026-11-23T11:00',
          temperature_2m: 28.5,
          relative_humidity_2m: 82,
          wind_speed_10m: 4.5,
          wind_direction_10m: 120,
        },
        hourly: {
          time: ['2026-11-23T12:00'],
          temperature_2m: [29.0],
          relative_humidity_2m: [80],
          wind_speed_10m: [5.0],
          wind_direction_10m: [130],
        },
      }

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockWeather,
        })
      )

      const request = new Request('http://localhost:3000/api/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: 16.5033, longitude: 80.6465 }),
      })
      const response = await weatherHandler(request)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.current.temperatureC).toBe(28.5)
      expect(data.current.relativeHumidityPercent).toBe(82)
      expect(data.current.windSpeedKmh).toBe(4.5)
    })
  })

  describe('GET /api/geocode', () => {
    it('returns 400 if search query is too short', async () => {
      const request = new Request('http://localhost:3000/api/geocode?q=a')
      const response = await geocodeHandler(request)
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Enter at least 2 characters')
    })

    it('returns geocoded results for location query', async () => {
      const mockNominatim = [
        {
          name: 'Kesarpalli',
          display_name: 'Kesarpalli, Gannavaram, Krishna, Andhra Pradesh, 521102, India',
          lat: '16.5167',
          lon: '80.7500',
          type: 'village',
          importance: 0.55,
          address: {
            village: 'Kesarpalli',
            state: 'Andhra Pradesh',
            country: 'India',
          },
        },
      ]

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockNominatim,
        })
      )

      const request = new Request('http://localhost:3000/api/geocode?q=Kesarpalli')
      const response = await geocodeHandler(request)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data.results)).toBe(true)
      expect(data.results.length).toBeGreaterThan(0)
      expect(data.results[0].name).toContain('Kesarpalli')
      expect(data.results[0].latitude).toBe(16.5167)
    })

    it('returns reverse geocoded readable name when coordinates are provided', async () => {
      const mockReverse = {
        lat: '16.5033',
        lon: '80.6465',
        name: 'Kesarpalli',
        display_name: 'Kesarpalli, Krishna District, Andhra Pradesh, India',
        address: {
          village: 'Kesarpalli',
          state: 'Andhra Pradesh',
          country: 'India',
        },
      }

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockReverse,
        })
      )

      const request = new Request('http://localhost:3000/api/geocode?lat=16.5033&lon=80.6465')
      const response = await geocodeHandler(request)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.name).toBe('Kesarpalli, Andhra Pradesh, India')
    })

    it('returns 400 for invalid reverse geocode coordinates', async () => {
      const request = new Request('http://localhost:3000/api/geocode?lat=95&lon=80') // lat > 90
      const response = await geocodeHandler(request)
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Valid latitude and longitude are required')
    })
  })

  describe('POST /api/air-quality-assistant', () => {
    it('rejects invalid payload without required fields', async () => {
      const request = new Request('http://localhost:3000/api/air-quality-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aqi: -10 }), // invalid negative aqi
      })
      const response = await assistantHandler(request)
      expect(response.status).toBe(400)
    })

    it('returns assistant guidance with streaming response', async () => {
      delete process.env.GEMINI_API_KEY
      delete process.env.GROQ_API_KEY

      const request = new Request('http://localhost:3000/api/air-quality-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.100',
        },
        body: JSON.stringify({
          locationName: 'Kesarpalli, Andhra Pradesh',
          latitude: 16.5033,
          longitude: 80.6465,
          aqi: 154,
          pm25: 61.7,
          pm10: 95.0,
          readingLabel: 'Current estimate',
          audience: 'children',
          activity: 'outdoor exercise or play',
          stream: true,
        }),
      })

      const response = await assistantHandler(request)
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/plain')
      expect(response.headers.get('X-AI-Provider')).toBe('deterministic')
      const text = await response.text()
      expect(text).toContain('Kesarpalli')
      expect(text.length).toBeGreaterThan(50)
    })

    it('enforces rate limiting: returns HTTP 429 when client IP exceeds 30 requests within window', async () => {
      delete process.env.GEMINI_API_KEY
      delete process.env.GROQ_API_KEY

      const testIp = '198.51.100.42'
      const payload = {
        locationName: 'Kesarpalli',
        aqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        readingLabel: 'Current estimate',
        audience: 'children',
        activity: 'outdoor exercise or play',
        stream: false,
      }

      // Send 30 requests (the limit)
      for (let i = 0; i < 30; i++) {
        const req = new Request('http://localhost:3000/api/air-quality-assistant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': testIp,
          },
          body: JSON.stringify(payload),
        })
        const res = await assistantHandler(req)
        expect(res.status).toBe(200)
      }

      // The 31st request from the same IP must be rejected with 429 Too Many Requests
      const rateLimitedReq = new Request('http://localhost:3000/api/air-quality-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp,
        },
        body: JSON.stringify(payload),
      })
      const rateLimitedRes = await assistantHandler(rateLimitedReq)
      expect(rateLimitedRes.status).toBe(429)
      const data = await rateLimitedRes.json()
      expect(data.error).toContain('Too many plan requests')
    })

    it('returns friendly user-facing fallback when internal provider throws unhandled exception', async () => {
      // Mock orchestrateDualAIProvider to throw an unexpected error
      const manager = await import('@/lib/ai-provider-manager')
      const spy = vi.spyOn(manager, 'orchestrateDualAIProvider').mockRejectedValueOnce(new Error('Fatal memory allocation failure'))

      const request = new Request('http://localhost:3000/api/air-quality-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.150',
        },
        body: JSON.stringify({
          locationName: 'Test Area',
          aqi: 104,
          pm25: 30.0,
          pm10: 40.0,
          readingLabel: 'Current estimate',
          audience: 'general',
          activity: 'school and work commute',
          stream: false,
        }),
      })

      const response = await assistantHandler(request)
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.recommendation).toContain("I'm having trouble generating a personalized response right now.")
      expect(data.recommendation).not.toContain('Fatal')
      expect(data.recommendation).not.toContain('Error')

      spy.mockRestore()
    })
  })

  describe('API Upstream Failure Resilience', () => {
    it('handles Open-Meteo failure in /api/air-quality with HTTP 502 without crashing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
      )

      const request = new Request('http://localhost:3000/api/air-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: 16.5, longitude: 80.6 }),
      })

      const response = await airQualityHandler(request)
      expect(response.status).toBe(502)
      const data = await response.json()
      expect(data.error).toContain('Air-quality data is unavailable')
    })

    it('handles weather API upstream timeout/error with HTTP 502', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Upstream timeout'))
      )

      const request = new Request('http://localhost:3000/api/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: 16.5, longitude: 80.6 }),
      })

      const response = await weatherHandler(request)
      expect(response.status).toBe(502)
      const data = await response.json()
      expect(data.error).toContain('temporarily unavailable')
    })

    it('handles geocode upstream network error with HTTP 502', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network unreachable'))
      )

      const request = new Request('http://localhost:3000/api/geocode?q=London')
      const response = await geocodeHandler(request)
      expect(response.status).toBe(502)
      const data = await response.json()
      expect(data.error).toContain('Could not reach the geocoding service')
    })
  })
})
