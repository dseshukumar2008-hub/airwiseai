/**
 * AIRWISE AI — Server-Side AI Provider Manager
 * Orchestrates Google Gemini (Primary) and Groq (Secondary Fallback),
 * executing shared deterministic environmental tools and graceful rule-based fallbacks.
 */

import { GoogleGenAI } from '@google/genai'
import {
  getCurrentAirQuality,
  getAirQualityForecast,
  generateDailyRoutine,
  getIndoorAirGuidance,
  compareSustainableAlternatives,
  calculateEnvironmentalImpact,
  analyzeEnvironmentalConditions,
  generateDeterministicFallbackGuidance,
  getCachedToolResult,
  setCachedToolResult,
} from '@/lib/ai-tools'

export type OrchestrationResult = {
  provider: 'gemini' | 'groq' | 'deterministic'
  model: string
  text: string
  toolRounds: number
  isFallback: boolean
  providerNotice?: string
}

export type AssistantContext = {
  locationName: string | null
  latitude?: number | null
  longitude?: number | null
  aqi: number
  pm25: number | null
  pm10: number | null
  readingLabel: string
  audience: string
  activity: string
  forecast?: Record<string | number, any> | null
  weather?: {
    temperatureC?: number | null
    relativeHumidityPercent?: number | null
    windSpeedKmh?: number | null
    windDirectionDeg?: number | null
  } | null
  userQuery?: string | null
  simulateGeminiQuota?: boolean
}

export const SYSTEM_INSTRUCTION = [
  'You are AIRWISE AI, the flagship Urban Air Quality and Environmental Intelligence Assistant.',
  'Your mission is to help families and communities navigate severe winter smog and urban air pollution with grounded, scientific guidance.',
  '',
  'STRICT GROUNDING & TOOL USE RULES:',
  '1. You have access to 7 specialized deterministic tools for telemetry, forecasts, exposure matrices, indoor protocols, transit comparisons, carbon calculations, and meteorological stagnation analysis.',
  '2. Use your tools whenever specific calculations or verified telemetry are required. Never calculate carbon emissions or invent pollutant numbers yourself.',
  '3. Never claim indoor sensors exist. Our application only provides calculated indoor guidance based on outdoor infiltration physics.',
  '4. When recommending commuting shifts, clearly explain that active transport (cycling/walking) carries elevated respiratory risks in high AQI (>100-150) due to 3-5x higher inhalation volume, even though it has zero emissions.',
  '5. Clearly distinguish CO2e reductions from direct local roadside tailpipe reductions (NOx, fine black carbon).',
  '6. AQI guidance is general environmental intelligence, NOT medical advice. Never diagnose or guarantee health outcomes.',
  '',
  'FORMAT YOUR FINAL RESPONSE CLEARLY WITH THESE DISTINCT SECTIONS (using Markdown headers):',
  '### 1. Current Air Quality & Exposure Context',
  'Interpretation of current US AQI and fine particulate levels for this specific household profile.',
  '### 2. Activity Guidance & Daily Routine',
  'Explicit recommendations for planned activities, highlighting outdoor windows vs. indoor relocation.',
  '### 3. Indoor Air Quality & Ventilation Strategy',
  'Actionable steps for windows, HEPA air cleaners, dust control, and avoiding indoor combustion sources.',
  '### 4. Low-Emission & Sustainable Alternatives',
  'Transit and routine alternatives that balance personal exposure safety with emissions reduction.',
  '### 5. Verified Environmental & Emissions Impact',
  'Concrete impact insights citing verified calculation factors.',
  '### 6. Daily Action Checklist',
  'A punchy 3-bullet action checklist for today.',
].join('\n')

// -------------------------------------------------------------
// OpenAI-Compatible Tool Schema for Groq
// -------------------------------------------------------------
export const GROQ_OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getCurrentAirQuality',
      description:
        'Retrieves verified live ambient US AQI, particulate concentrations (PM2.5, PM10 in µg/m³), and category for exact latitude and longitude coordinates.',
      parameters: {
        type: 'object',
        properties: {
          latitude: { type: 'number', description: 'Latitude of the location (-90 to 90).' },
          longitude: { type: 'number', description: 'Longitude of the location (-180 to 180).' },
        },
        required: ['latitude', 'longitude'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAirQualityForecast',
      description:
        'Retrieves verified hourly air quality projections (+3h, +6h, +12h, +24h) and calculates the dynamic cleanest/safest outdoor window based on lowest projected AQI.',
      parameters: {
        type: 'object',
        properties: {
          latitude: { type: 'number', description: 'Latitude of the location (-90 to 90).' },
          longitude: { type: 'number', description: 'Longitude of the location (-180 to 180).' },
        },
        required: ['latitude', 'longitude'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateDailyRoutine',
      description:
        'Generates deterministic, vulnerability-specific activity suitability and exposure mitigation guidelines based on current AQI thresholds and household profiles.',
      parameters: {
        type: 'object',
        properties: {
          currentAqi: { type: 'number', description: 'Current US AQI (0 to 1000).' },
          householdProfile: {
            type: 'string',
            enum: ['general', 'children', 'older-adult', 'respiratory', 'outdoor-worker'],
            description: 'Vulnerability profile of the household.',
          },
          plannedActivity: {
            type: 'string',
            description: 'The target activity (e.g., commute, outdoor sports, walking).',
          },
          cleanestWindowDescription: {
            type: 'string',
            description: 'Optional cleanest forecast window description if retrieved.',
          },
        },
        required: ['currentAqi', 'householdProfile', 'plannedActivity'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getIndoorAirGuidance',
      description:
        'Generates deterministic indoor infiltration defense, window ventilation strategy, HEPA purifier operation, and indoor combustion hazard warnings. Explicitly disclaims indoor hardware sensors.',
      parameters: {
        type: 'object',
        properties: {
          outdoorAqi: { type: 'number', description: 'Current outdoor US AQI reading.' },
          outdoorPm25: { type: 'number', description: 'Current outdoor PM2.5 particulate concentration in µg/m³.' },
          housingContext: {
            type: 'string',
            enum: ['apartment', 'detached-house', 'naturally-ventilated', 'hvac-filtered'],
            description: 'Optional residential context.',
          },
        },
        required: ['outdoorAqi'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compareSustainableAlternatives',
      description:
        'Compares commuting alternatives against a baseline mode, evaluating both per-trip carbon emissions and respiratory exposure risk during high pollution episodes.',
      parameters: {
        type: 'object',
        properties: {
          baselineModeId: {
            type: 'string',
            description: 'Current mode: car-petrol, car-ev, bus, rail, ebike, or walking.',
          },
          distanceKm: { type: 'number', description: 'One-way commute distance in kilometers.' },
          currentAqi: { type: 'number', description: 'Current outdoor AQI to assess respiratory exposure risk.' },
        },
        required: ['baselineModeId', 'distanceKm', 'currentAqi'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculateEnvironmentalImpact',
      description:
        'Calculates deterministic carbon (CO2e) savings using EEA/UK DEFRA emission factors, and explains direct tailpipe pollutant reduction mechanisms (NOx, elemental carbon PM).',
      parameters: {
        type: 'object',
        properties: {
          baselineModeId: { type: 'string', description: 'Baseline mode ID (e.g., car-petrol).' },
          alternativeModeId: {
            type: 'string',
            description: 'Alternative mode ID (e.g., rail, bus, ebike, car-ev, walking).',
          },
          distanceKm: { type: 'number', description: 'One-way commute distance in kilometers.' },
          tripsPerWeek: { type: 'number', description: 'Number of commute days per week (1 to 7).' },
        },
        required: ['baselineModeId', 'alternativeModeId', 'distanceKm', 'tripsPerWeek'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyzeEnvironmentalConditions',
      description:
        'Performs deterministic pollution intelligence analysis cross-referencing US AQI, particulate concentrations, wind speed (stagnation vs active dispersion), humidity, and forecast curves.',
      parameters: {
        type: 'object',
        properties: {
          currentAqi: { type: 'number', description: 'Current US AQI reading (optional, defaults to context AQI).' },
          pm25: { type: 'number', description: 'Current PM2.5 in µg/m³.' },
          temperatureC: { type: 'number', description: 'Ambient temperature in Celsius.' },
          relativeHumidityPercent: { type: 'number', description: 'Relative humidity in percent.' },
          windSpeedKmh: { type: 'number', description: 'Wind speed in km/h.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyzeEnvironmentalCondition',
      description:
        'Alias for analyzeEnvironmentalConditions.',
      parameters: {
        type: 'object',
        properties: {
          currentAqi: { type: 'number', description: 'Current US AQI reading (optional, defaults to context AQI).' },
          pm25: { type: 'number', description: 'Current PM2.5 in µg/m³.' },
          temperatureC: { type: 'number', description: 'Ambient temperature in Celsius.' },
          relativeHumidityPercent: { type: 'number', description: 'Relative humidity in percent.' },
          windSpeedKmh: { type: 'number', description: 'Wind speed in km/h.' },
        },
        required: [],
      },
    },
  },
]

// -------------------------------------------------------------
// Unified Deterministic Tool Execution Engine with Caching
// -------------------------------------------------------------
const TOOL_NAME_ALIASES: Record<string, string> = {
  analyzeenvironmentalconditions: 'analyzeEnvironmentalConditions',
  analyzeenvironmentalcondition: 'analyzeEnvironmentalConditions',
  analyze_environmental_conditions: 'analyzeEnvironmentalConditions',
  generatedailyroutine: 'generateDailyRoutine',
  generatedailyroutines: 'generateDailyRoutine',
  generate_daily_routine: 'generateDailyRoutine',
  getcurrentairquality: 'getCurrentAirQuality',
  get_current_air_quality: 'getCurrentAirQuality',
  getairqualityforecast: 'getAirQualityForecast',
  get_air_quality_forecast: 'getAirQualityForecast',
  getindoorairguidance: 'getIndoorAirGuidance',
  get_indoor_air_guidance: 'getIndoorAirGuidance',
  comparesustainablealternatives: 'compareSustainableAlternatives',
  compare_sustainable_alternatives: 'compareSustainableAlternatives',
  calculateenvironmentalimpact: 'calculateEnvironmentalImpact',
  calculate_environmental_impact: 'calculateEnvironmentalImpact',
}

export function canonicalizeToolName(name: string): string {
  if (!name) return 'unknown'
  const trimmed = name.trim().replace(/\s+/g, '')
  const lower = trimmed.toLowerCase()
  return TOOL_NAME_ALIASES[lower] || trimmed
}

export async function executeDeterministicTool(rawName: string, rawArgs: Record<string, unknown>): Promise<unknown> {
  const name = canonicalizeToolName(rawName)
  const cacheKey = `${name}:${JSON.stringify(rawArgs)}`
  const cached = getCachedToolResult(cacheKey)
  if (cached) return cached

  let result: any
  switch (name) {
    case 'getCurrentAirQuality': {
      const lat = Number(rawArgs.latitude)
      const lon = Number(rawArgs.longitude)
      result = await getCurrentAirQuality({ latitude: lat, longitude: lon })
      setCachedToolResult(cacheKey, result, 180)
      return result
    }

    case 'getAirQualityForecast': {
      const lat = Number(rawArgs.latitude)
      const lon = Number(rawArgs.longitude)
      result = await getAirQualityForecast({ latitude: lat, longitude: lon })
      setCachedToolResult(cacheKey, result, 300)
      return result
    }

    case 'generateDailyRoutine': {
      const currentAqi = Number(rawArgs.currentAqi)
      const householdProfile = String(rawArgs.householdProfile || 'general') as any
      const plannedActivity = String(rawArgs.plannedActivity || 'routine daily tasks')
      const cleanestWindowDescription = rawArgs.cleanestWindowDescription
        ? String(rawArgs.cleanestWindowDescription)
        : null
      result = generateDailyRoutine({
        currentAqi,
        householdProfile,
        plannedActivity,
        cleanestWindowDescription,
      })
      setCachedToolResult(cacheKey, result, 300)
      return result
    }

    case 'getIndoorAirGuidance': {
      const outdoorAqi = Number(rawArgs.outdoorAqi)
      const outdoorPm25 = typeof rawArgs.outdoorPm25 === 'number' ? rawArgs.outdoorPm25 : null
      const housingContext = rawArgs.housingContext ? (String(rawArgs.housingContext) as any) : undefined
      result = getIndoorAirGuidance({
        outdoorAqi,
        outdoorPm25,
        housingContext,
      })
      setCachedToolResult(cacheKey, result, 300)
      return result
    }

    case 'compareSustainableAlternatives': {
      const baselineModeId = String(rawArgs.baselineModeId || 'car-petrol')
      const distanceKm = Number(rawArgs.distanceKm || 10)
      const currentAqi = Number(rawArgs.currentAqi || 100)
      result = compareSustainableAlternatives({
        baselineModeId,
        distanceKm,
        currentAqi,
      })
      setCachedToolResult(cacheKey, result, 600)
      return result
    }

    case 'calculateEnvironmentalImpact': {
      const baselineModeId = String(rawArgs.baselineModeId || 'car-petrol')
      const alternativeModeId = String(rawArgs.alternativeModeId || 'rail')
      const distanceKm = Number(rawArgs.distanceKm || 10)
      const tripsPerWeek = Number(rawArgs.tripsPerWeek || 5)
      result = calculateEnvironmentalImpact({
        baselineModeId,
        alternativeModeId,
        distanceKm,
        tripsPerWeek,
      })
      setCachedToolResult(cacheKey, result, 600)
      return result
    }

    case 'analyzeEnvironmentalConditions': {
      const currentAqi = typeof rawArgs.currentAqi === 'number' ? rawArgs.currentAqi : null
      const pm25 = typeof rawArgs.pm25 === 'number' ? rawArgs.pm25 : null
      const temperatureC = typeof rawArgs.temperatureC === 'number' ? rawArgs.temperatureC : null
      const relativeHumidityPercent = typeof rawArgs.relativeHumidityPercent === 'number' ? rawArgs.relativeHumidityPercent : null
      const windSpeedKmh = typeof rawArgs.windSpeedKmh === 'number' ? rawArgs.windSpeedKmh : null
      result = analyzeEnvironmentalConditions({
        currentAqi,
        pm25,
        temperatureC,
        relativeHumidityPercent,
        windSpeedKmh,
      })
      setCachedToolResult(cacheKey, result, 180)
      return result
    }

    default:
      throw new Error(`Undeclared tool call rejected: ${name}`)
  }
}

// -------------------------------------------------------------
// Groq Function Calling Orchestrator (OpenAI-compatible)
// -------------------------------------------------------------
export async function runGroqOrchestration(
  apiKey: string,
  modelName: string,
  userPrompt: string
): Promise<{ text: string; toolRounds: number }> {
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions'
  const messages: any[] = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    { role: 'user', content: userPrompt },
  ]

  let round = 0
  const maxRounds = 3

  while (round < maxRounds) {
    round++

    // On round 1, enable tool calling. Once tools have executed, force final synthesis (tool_choice: 'none')
    // to prevent repetitive tool queries from exceeding token limits.
    const toolChoice = round === 1 ? 'auto' : 'none'

    let response: Response | null = null
    let lastFetchError: Error | null = null

    // Transient network retry with backoff (e.g. ECONNRESET or transient socket drops)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages,
            tools: GROQ_OPENAI_TOOLS,
            tool_choice: toolChoice,
            temperature: 0.2,
            max_tokens: 800,
          }),
          signal: AbortSignal.timeout(15000),
        })
        break
      } catch (netErr: any) {
        lastFetchError = netErr
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 800))
        }
      }
    }

    if (!response) {
      throw lastFetchError || new Error('Network failure communicating with Groq API.')
    }

    if (!response.ok) {
      const errText = await response.text()
      let parsedMsg = `Groq API responded with HTTP ${response.status}`
      try {
        const errJson = JSON.parse(errText)
        parsedMsg = errJson.error?.message || parsedMsg
      } catch {}
      const error: any = new Error(parsedMsg)
      error.status = response.status
      throw error
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    const message = choice?.message

    if (!message) {
      throw new Error('No message returned from Groq model.')
    }

    messages.push(message)

    const toolCalls = message.tool_calls || []
    if (toolCalls.length === 0) {
      const finalText = (message.content || '').trim()
      if (!finalText) {
        throw new Error('Groq model returned an empty response.')
      }
      return { text: finalText, toolRounds: round - 1 }
    }

    // Execute tool calls in parallel with canonicalization and argument parsing validation
    const toolResults = await Promise.all(
      toolCalls.map(async (tc: any) => {
        const fnName = tc.function?.name || 'unknown'
        let fnArgs: Record<string, unknown> = {}
        try {
          fnArgs = JSON.parse(tc.function?.arguments || '{}')
        } catch {
          fnArgs = {}
        }

        try {
          const toolRes = await executeDeterministicTool(fnName, fnArgs)
          return {
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolRes),
          }
        } catch (err: any) {
          return {
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: err?.message || 'Execution error' }),
          }
        }
      })
    )

    messages.push(...toolResults)
  }

  throw new Error('Maximum Groq tool orchestration rounds exceeded.')
}

// -------------------------------------------------------------
// Master Provider Orchestration Dispatcher
// -------------------------------------------------------------
export async function orchestrateDualAIProvider(
  context: AssistantContext
): Promise<OrchestrationResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim()
  const groqApiKey = process.env.GROQ_API_KEY?.trim()
  const groqModel = process.env.GROQ_MODEL?.trim() || 'qwen/qwen3.8-27b'

  const userPrompt = JSON.stringify({
    location: context.locationName || 'Unknown locality',
    coordinates:
      typeof context.latitude === 'number' && typeof context.longitude === 'number'
        ? { latitude: context.latitude, longitude: context.longitude }
        : null,
    currentUsAqi: context.aqi,
    pm25MicrogramsPerCubicMeter: context.pm25,
    pm10MicrogramsPerCubicMeter: context.pm10,
    readingSource: context.readingLabel,
    householdProfile: context.audience,
    plannedActivity: context.activity,
    customQuery: context.userQuery ?? null,
    providedForecastHours: context.forecast ?? null,
    weatherTelemetry: context.weather ?? null,
  })

  // 1. ATTEMPT PRIMARY: Google Gemini 2.5 Flash
  let geminiAuthError: Error | null = null
  let geminiFailedDueToQuotaOrNetwork = false
  let geminiErrorMessage = ''

  if (context.simulateGeminiQuota) {
    geminiFailedDueToQuotaOrNetwork = true
    geminiErrorMessage = 'Simulated Gemini HTTP 429 Quota Exhausted'
  } else if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey, apiVersion: 'v1beta' })
      const modelName = 'gemini-2.5-flash'
      const contents: any[] = [{ role: 'user', parts: [{ text: userPrompt }] }]

      let round = 0
      const maxRounds = 5

      while (round < maxRounds) {
        round++

        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [
              {
                functionDeclarations: GROQ_OPENAI_TOOLS.map((t) => ({
                  name: t.function.name,
                  description: t.function.description,
                  parameters: t.function.parameters as any,
                })),
              },
            ] as any,
            temperature: 0.2,
            maxOutputTokens: 1200,
          },
        })

        const candidate = response.candidates?.[0]
        const modelContent = candidate?.content
        if (!modelContent) throw new Error('No content returned from Gemini model.')

        contents.push(modelContent)
        const functionCalls = modelContent.parts?.filter((p) => p.functionCall) ?? []

        if (functionCalls.length === 0) {
          const finalText = modelContent.parts?.map((p) => p.text || '').join('').trim()
          if (!finalText) throw new Error('Gemini produced an empty response.')

          return {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            text: finalText,
            toolRounds: round - 1,
            isFallback: false,
          }
        }

        const toolResponseParts = await Promise.all(
          functionCalls.map(async (part) => {
            const call = part.functionCall!
            const toolName = call.name || 'unknown'
            const toolArgs = (call.args || {}) as Record<string, unknown>
            try {
              const toolResult = await executeDeterministicTool(toolName, toolArgs)
              return { functionResponse: { name: toolName, response: { result: toolResult } } }
            } catch (toolError: any) {
              return { functionResponse: { name: toolName, response: { error: toolError?.message || 'Error' } } }
            }
          })
        )

        contents.push({ role: 'user', parts: toolResponseParts })
      }
    } catch (err: any) {
      const msg = err?.message || ''
      const status = err?.status || 500

      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || status === 400 || status === 401) {
        // Explicit authentication failure should not be silently masked
        geminiAuthError = new Error('Authentication failed: The configured GEMINI_API_KEY is invalid.')
      } else {
        geminiFailedDueToQuotaOrNetwork = true
        geminiErrorMessage = msg
      }
    }
  } else {
    geminiFailedDueToQuotaOrNetwork = true
    geminiErrorMessage = 'Gemini API key is not configured.'
  }

  // If Gemini failed with a critical Auth error and no fallback is desired, throw unless Groq is configured
  if (geminiAuthError && !groqApiKey) {
    throw geminiAuthError
  }

  // 2. ATTEMPT SECONDARY FALLBACK: Groq API
  if (groqApiKey && (geminiFailedDueToQuotaOrNetwork || geminiAuthError)) {
    try {
      console.log(`[AI Provider Manager] Primary Gemini unavailable (${geminiErrorMessage || 'Auth/Quota'}). Attempting Groq fallback (${groqModel})...`)
      const groqRes = await runGroqOrchestration(groqApiKey, groqModel, userPrompt)
      console.log(`[AI Provider Manager] Groq fallback succeeded with ${groqRes.toolRounds} tool round(s).`)
      return {
        provider: 'groq',
        model: groqModel,
        text: groqRes.text,
        toolRounds: groqRes.toolRounds,
        isFallback: true,
        providerNotice: 'Served via Groq fallback copilot while primary Gemini quota resets.',
      }
    } catch (groqErr: any) {
      console.error(`[AI Provider Manager] Groq fallback failed: ${groqErr?.message || groqErr}. Falling back to deterministic engine.`)
    }
  }

  // 3. TERTIARY DETERMINISTIC FALLBACK: Verified Rule-Based Guidance
  const fallbackText = generateDeterministicFallbackGuidance({
    locationName: context.locationName,
    currentAqi: context.aqi,
    pm25: context.pm25,
    pm10: context.pm10,
    readingLabel: context.readingLabel,
    householdProfile: context.audience,
    plannedActivity: context.activity,
    userQuery: context.userQuery,
    weatherContext: context.weather,
  })

  return {
    provider: 'deterministic',
    model: 'Rule-Based Engine (Fallback)',
    text: fallbackText,
    toolRounds: 0,
    isFallback: true,
    providerNotice:
      'Google Gemini 2.5 Flash reached its daily Free Tier quota limit (20 req/day). Showing verified deterministic calculations.',
  }
}
