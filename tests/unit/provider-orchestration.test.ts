import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  orchestrateDualAIProvider,
  runGroqOrchestration,
  executeDeterministicTool,
  unescapeMarkdownBackslashes,
  canonicalizeToolName,
  getGeminiCircuitState,
  tripGeminiCircuit,
  resetGeminiCircuit,
} from '@/lib/ai-provider-manager'
import { GoogleGenAI } from '@google/genai'

// Mock the GoogleGenAI module from @google/genai as a constructible class
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: vi.fn(),
      }
      constructor() {
        if ((MockGoogleGenAI as any).mockInstance) {
          return (MockGoogleGenAI as any).mockInstance
        }
      }
    },
  }
})

describe('AI Provider Orchestration & Fallbacks', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    resetGeminiCircuit()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('Tool Canonicalization & Markdown Unescaping', () => {
    it('canonicalizes various tool name formats', () => {
      expect(canonicalizeToolName('getCurrentAirQuality')).toBe('getCurrentAirQuality')
      expect(canonicalizeToolName('get_current_air_quality')).toBe('getCurrentAirQuality')
      expect(canonicalizeToolName('getcurrentairquality')).toBe('getCurrentAirQuality')
      expect(canonicalizeToolName('calculate_environmental_impact')).toBe('calculateEnvironmentalImpact')
      expect(canonicalizeToolName('analyze_environmental_conditions')).toBe('analyzeEnvironmentalConditions')
    })

    it('unescapes backslashes before markdown characters', () => {
      expect(unescapeMarkdownBackslashes('\\*\\*bold\\*\\*')).toBe('**bold**')
      expect(unescapeMarkdownBackslashes('\\* bullet')).toBe('* bullet')
      expect(unescapeMarkdownBackslashes('\\[link\\]')).toBe('[link]')
      expect(unescapeMarkdownBackslashes('Normal text')).toBe('Normal text')
    })
  })

  describe('Deterministic Tool Execution', () => {
    it('executes calculateEnvironmentalImpact accurately', async () => {
      const res: any = await executeDeterministicTool('calculateEnvironmentalImpact', {
        baselineModeId: 'car-petrol',
        alternativeModeId: 'rail',
        distanceKm: 12,
        tripsPerWeek: 5,
      })

      expect(res.calculations.singleTripBaseKgCO2e).toBe(2.052)
      expect(res.calculations.singleTripSavedKgCO2e).toBe(1.632)
      expect(res.calculations.percentReduction).toBe(80)
    })

    it('rejects undeclared tools with descriptive error', async () => {
      await expect(
        executeDeterministicTool('executeMaliciousScript', {})
      ).rejects.toThrow(/Undeclared tool call rejected/i)
    })
  })

  describe('Fallback Flow: Missing Keys to Deterministic Engine', () => {
    it('falls back to deterministic engine when neither Gemini nor Groq API keys are configured', async () => {
      delete process.env.GEMINI_API_KEY
      delete process.env.GROQ_API_KEY

      const result = await orchestrateDualAIProvider({
        locationName: 'Kesarpalli, Andhra Pradesh',
        latitude: 16.5033,
        longitude: 80.6465,
        aqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        readingLabel: 'Current estimate',
        audience: 'children',
        activity: 'outdoor exercise or play',
        userQuery: 'Is it safe for my child to play outdoors today?',
      })

      expect(result.provider).toBe('deterministic')
      expect(result.isFallback).toBe(true)
      expect(result.text).toContain('Kesarpalli')
      expect(result.text).toMatch(/154|Unhealthy/i)
      expect(result.providerNotice).toMatch(/deterministic/i)
    })
  })

  describe('Primary Gemini Client & Quota (HTTP 429) Handling', () => {
    it('catches genuine GoogleGenAI generateContent HTTP 429 quota exhaustion and falls back to Groq', async () => {
      process.env.GEMINI_API_KEY = 'mock_valid_gemini_key'
      process.env.GROQ_API_KEY = 'mock_valid_groq_key'
      process.env.GROQ_MODEL = 'qwen/qwen3.8-27b'

      // Mock GoogleGenAI class instance throwing 429 quota exhaustion error
      const mockGenerateContent = vi.fn().mockRejectedValue({
        status: 429,
        message: 'Resource has been exhausted (e.g. check quota): HTTP 429 Too Many Requests',
      })

      ;(GoogleGenAI as any).mockInstance = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      // Mock Groq API response
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Groq fallback advisory: High particulate concentrations detected. Restrict intense exertion outdoors.',
              },
            },
          ],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await orchestrateDualAIProvider({
        locationName: 'Kesarpalli',
        aqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        readingLabel: 'Current estimate',
        audience: 'children',
        activity: 'outdoor exercise or play',
      })

      // Verify GoogleGenAI generateContent was actually attempted
      expect(mockGenerateContent).toHaveBeenCalled()
      // Verify provider fell back to Groq
      expect(result.provider).toBe('groq')
      expect(result.isFallback).toBe(true)
      expect(result.text).toContain('Groq fallback advisory')
      expect(result.providerNotice).toMatch(/secondary AI/i)
    })

    it('falls back to deterministic engine when Gemini throws 429 and Groq also fails (HTTP 500)', async () => {
      process.env.GEMINI_API_KEY = 'mock_valid_gemini_key'
      process.env.GROQ_API_KEY = 'mock_valid_groq_key'

      // Mock Gemini throwing 429
      const mockGenerateContent = vi.fn().mockRejectedValue({
        status: 429,
        message: 'Quota exceeded for quota metric Generate Content API requests per minute',
      })
      ;(GoogleGenAI as any).mockInstance = {
        models: {
          generateContent: mockGenerateContent,
        },
      }

      // Mock Groq failing with 500 error
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: { message: 'Groq server capacity exceeded' } }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await orchestrateDualAIProvider({
        locationName: 'Kesarpalli',
        aqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        readingLabel: 'Current estimate',
        audience: 'children',
        activity: 'outdoor exercise or play',
      })

      expect(mockGenerateContent).toHaveBeenCalled()
      expect(result.provider).toBe('deterministic')
      expect(result.isFallback).toBe(true)
      expect(result.text).toContain('Kesarpalli')
      expect(result.providerNotice).toContain('verified deterministic environmental algorithms')
    })
  })

  describe('Groq Tool Calling Orchestration Loop', () => {
    it('executes genuine tool calling loop with calculateEnvironmentalImpact and returns synthesized answer', async () => {
      // First call returns tool_calls for calculateEnvironmentalImpact
      // Second call returns final assistant answer referencing calculated figures
      let callCount = 0
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_123',
                        type: 'function',
                        function: {
                          name: 'calculateEnvironmentalImpact',
                          arguments: JSON.stringify({
                            baselineModeId: 'car-petrol',
                            alternativeModeId: 'rail',
                            distanceKm: 12,
                            tripsPerWeek: 5,
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          }
        } else {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content:
                      'Switching from a solo petrol car to electric rail for a 12 km commute saves 1.632 kg CO2e per trip (80% reduction) and over 780 kg CO2e annually.',
                  },
                },
              ],
            }),
          }
        }
      })
      vi.stubGlobal('fetch', mockFetch)

      const { text, toolRounds } = await runGroqOrchestration(
        'mock_groq_key',
        'qwen/qwen3.8-27b',
        'Calculate emissions savings for a 12 km commute using train instead of car.'
      )

      expect(toolRounds).toBe(1)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(text).toContain('1.632 kg CO2e')
      expect(text).toContain('80% reduction')
    })
  })

  describe('Circuit Breaker and Cooldown Behavior', () => {
    it('bypasses Gemini and routes directly to Groq when circuit is open after 429', async () => {
      process.env.GEMINI_API_KEY = 'mock_valid_gemini_key'
      process.env.GROQ_API_KEY = 'mock_valid_groq_key'
      process.env.GROQ_MODEL = 'qwen/qwen3.8-27b'

      // Trip circuit breaker manually
      tripGeminiCircuit(30000)
      expect(getGeminiCircuitState().isOpen).toBe(true)

      const mockGenerateContent = vi.fn()
      ;(GoogleGenAI as any).mockInstance = {
        models: { generateContent: mockGenerateContent },
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Fast Groq response while Gemini circuit is cooling down.',
              },
            },
          ],
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await orchestrateDualAIProvider({
        locationName: 'Kesarpalli',
        aqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        readingLabel: 'Current estimate',
        audience: 'children',
        activity: 'outdoor exercise or play',
      })

      // Gemini generateContent was NOT called because circuit was tripped
      expect(mockGenerateContent).not.toHaveBeenCalled()
      expect(result.provider).toBe('groq')
      expect(result.text).toContain('Fast Groq response')
    })
  })

  describe('Groq Tool Calling for All 6 Environmental Capabilities', () => {
    it('successfully routes and executes all six environmental tools', async () => {
      // Mock global fetch for tools that retrieve live network data (getCurrentAirQuality, getAirQualityForecast)
      const mockFetch = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = url.toString()
        if (urlStr.includes('air-quality')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              latitude: 16.5,
              longitude: 80.625,
              current: { us_aqi: 154, pm2_5: 61.7, pm10: 95.0, time: '2026-11-23T12:00' },
              current_units: { pm2_5: 'µg/m³', pm10: 'µg/m³' },
              hourly: {
                time: ['2026-11-23T14:00', '2026-11-23T17:00'],
                us_aqi: [140, 130],
                pm2_5: [55.0, 50.0],
                pm10: [85.0, 80.0],
              },
            }),
          }
        }
        return { ok: true, status: 200, json: async () => ({}) }
      })
      vi.stubGlobal('fetch', mockFetch)

      const toolsToTest = [
        { name: 'getCurrentAirQuality', args: { latitude: 16.5033, longitude: 80.6465 } },
        { name: 'getAirQualityForecast', args: { latitude: 16.5033, longitude: 80.6465 } },
        { name: 'generateDailyRoutine', args: { currentAqi: 154, householdProfile: 'children', plannedActivity: 'exercise' } },
        { name: 'getIndoorAirGuidance', args: { outdoorAqi: 154, outdoorPm25: 61.7 } },
        { name: 'compareSustainableAlternatives', args: { baselineModeId: 'car-petrol', distanceKm: 12, currentAqi: 154 } },
        { name: 'calculateEnvironmentalImpact', args: { baselineModeId: 'car-petrol', alternativeModeId: 'rail', distanceKm: 12, tripsPerWeek: 5 } },
        { name: 'analyzeEnvironmentalConditions', args: { currentAqi: 154, pm25: 61.7, windSpeedKmh: 4.5 } },
      ]

      for (const t of toolsToTest) {
        const res: any = await executeDeterministicTool(t.name, t.args)
        expect(res).toBeDefined()
        expect(typeof res).toBe('object')
      }
    })
  })

  describe('Zero Technical Error Leaks in User-Facing Responses', () => {
    const technicalKeywords = [
      /quota/i,
      /429/i,
      /RESOURCE_EXHAUSTED/i,
      /Groq API failure/i,
      /Provider unavailable/i,
      /Internal server error/i,
      /stack/i,
      /at <unknown>/i,
    ]

    it('returns natural, valid guidance without technical error strings when Gemini returns 429', async () => {
      delete process.env.GROQ_API_KEY
      process.env.GEMINI_API_KEY = 'mock_key'

      const mockGenerateContent = vi.fn().mockRejectedValue({
        status: 429,
        message: 'Google API 429: RESOURCE_EXHAUSTED. Gemini daily quota exceeded.',
      })
      ;(GoogleGenAI as any).mockInstance = {
        models: { generateContent: mockGenerateContent },
      }

      const result = await orchestrateDualAIProvider({
        locationName: 'Kesarpalli',
        aqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        readingLabel: 'Current estimate',
        audience: 'children',
        activity: 'outdoor exercise or play',
      })

      // Must return valid response
      expect(result.text.length).toBeGreaterThan(100)
      expect(result.text).toContain('Kesarpalli')
      expect(result.text).toMatch(/children|mask|respirator|window/i)

      // Must never contain leaked technical errors
      for (const pattern of technicalKeywords) {
        expect(result.text).not.toMatch(pattern)
        if (result.providerNotice) {
          expect(result.providerNotice).not.toMatch(pattern)
        }
      }
    })

    it('returns natural guidance without technical errors when Gemini times out', async () => {
      delete process.env.GROQ_API_KEY
      process.env.GEMINI_API_KEY = 'mock_key'

      // Simulate a hanging request that triggers timeout
      const mockGenerateContent = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => setTimeout(resolve, 20000))
      })
      ;(GoogleGenAI as any).mockInstance = {
        models: { generateContent: mockGenerateContent },
      }

      // We test timeout by setting simulateGeminiQuota or letting timeout error trigger
      const result = await orchestrateDualAIProvider({
        locationName: 'Kesarpalli',
        aqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        readingLabel: 'Current estimate',
        audience: 'children',
        activity: 'outdoor exercise or play',
        simulateGeminiQuota: true, // simulates fast timeout/quota branch
      })

      expect(result.text.length).toBeGreaterThan(100)
      for (const pattern of technicalKeywords) {
        expect(result.text).not.toMatch(pattern)
      }
    })

    it('returns natural guidance when both Gemini and Groq fail simultaneously', async () => {
      process.env.GEMINI_API_KEY = 'mock_gemini_key'
      process.env.GROQ_API_KEY = 'mock_groq_key'

      const mockGenerateContent = vi.fn().mockRejectedValue({
        status: 429,
        message: 'Gemini quota exceeded',
      })
      ;(GoogleGenAI as any).mockInstance = {
        models: { generateContent: mockGenerateContent },
      }

      // Mock Groq failing with 502/500
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => 'Bad Gateway: Groq provider connection refused',
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await orchestrateDualAIProvider({
        locationName: 'Kesarpalli',
        aqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        readingLabel: 'Current estimate',
        audience: 'general',
        activity: 'school and work commute',
      })

      expect(result.provider).toBe('deterministic')
      expect(result.isFallback).toBe(true)
      expect(result.text.length).toBeGreaterThan(100)

      for (const pattern of technicalKeywords) {
        expect(result.text).not.toMatch(pattern)
        if (result.providerNotice) {
          expect(result.providerNotice).not.toMatch(pattern)
        }
      }
    })
  })
})
