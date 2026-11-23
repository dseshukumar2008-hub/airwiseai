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

// -------------------------------------------------------------
// In-Memory Circuit Breaker for Gemini Quota & Transient Failures
// -------------------------------------------------------------
let geminiCircuitOpenUntil: number = 0
const GEMINI_COOLDOWN_MS = 60 * 1000 // 60 seconds circuit breaker after 429 quota exhaustion

export function getGeminiCircuitState(): { isOpen: boolean; remainingSeconds: number } {
  const now = Date.now()
  if (now < geminiCircuitOpenUntil) {
    return { isOpen: true, remainingSeconds: Math.ceil((geminiCircuitOpenUntil - now) / 1000) }
  }
  return { isOpen: false, remainingSeconds: 0 }
}

export function tripGeminiCircuit(durationMs: number = GEMINI_COOLDOWN_MS): void {
  geminiCircuitOpenUntil = Date.now() + durationMs
}

export function resetGeminiCircuit(): void {
  geminiCircuitOpenUntil = 0
}

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

export function unescapeMarkdownBackslashes(text: string): string {
  if (!text) return ''
  // Strip backslashes placed before Markdown formatting tokens: \*, \_, \[, \], \(, \), \#, \+, \-, \., \!, \~, \`, \>, \|
  return text
    .replace(/\\([*_{}[\]()#+\-.!~`>|])/g, '$1')
    .replace(/\\\\/g, '\\')
}

export const SYSTEM_INSTRUCTION = [
  'You are AIRWISE AI, an intelligent, grounded Urban Air Quality and Environmental Copilot.',
  'Your mission is to provide accurate, science-based, conversational environmental guidance tailored directly to the user\'s situation.',
  '',
  'CONVERSATIONAL RESPONSE RULES (CRITICAL):',
  '1. ANSWER THE USER\'S SPECIFIC QUESTION FIRST in a direct, natural, conversational manner. Do NOT force a rigid multi-section template or unrequested sections for simple queries.',
  '2. Tailor response length to the query: concise queries get concise direct answers; only provide extended structured plans if the user explicitly asks for a daily plan, comprehensive report, family plan, or multi-member breakdown.',
  '3. Do NOT repeat current AQI numbers, health summaries, transit advice, or emissions calculations unless directly asked or essential to answering the query.',
  '4. If essential parameters (such as trip distance, baseline vehicle type, or specific hours) are missing, provide a reasonable default assumption and ask a short, helpful clarification question.',
  '5. FORMATTING: Use clean, standard Markdown without backslash-escaping characters. Never escape asterisks, brackets, or dashes (e.g., write **bold** and * bullet, NEVER \\*\\*bold\\*\\* or \\* bullet). Use real newlines.',
  '',
  'FAMILY-CENTRIC SCENARIO STRUCTURE (WHEN ASKED ABOUT FAMILIES OR MULTI-MEMBER HOUSEHOLDS):',
  'When the user presents a family scenario (e.g. children, elderly relatives, and commuting parents) or requests a comprehensive household plan, organize the response logically to address every family member specifically:',
  '### 1. Current Air-Quality Situation',
  'Summary of current US AQI, particulate concentrations (PM2.5/PM10), and local weather dispersion conditions. Note that ground-level calm winds indicate stagnation, but surface data alone cannot confirm upper-air temperature inversions.',
  '### 2. Recommendations for the Children',
  'School commute guidance, sports/play restrictions (explaining that higher physical exertion increases respiratory rate and particulate intake), and safe indoor physical alternatives. Avoid definitive medical claims and do not advise tight-fitting industrial respirators for small children without pediatric guidance.',
  '### 3. Recommendations for the Elderly Member',
  'Precautions for outdoor walks/errands, avoiding rush-hour traffic exposure, and safe indoor activities. Recommend following personal physician advice for cardiovascular/respiratory conditions.',
  '### 4. Working Parent\'s Commute Plan',
  'Lower-emission commute modes evaluated using the user\'s exact commute distance (never invent or substitute distances if specified). Note: only suggest metro, rail, or electric buses as alternatives if available on the route; if transit availability is unknown, note it as an option or suggest carpooling. Avoid open-air cycling/walking along traffic corridors at high AQI.',
  '### 5. Indoor Air-Quality and Ventilation Plan',
  'Actionable window timing based on actual forecast data (never invent clean-air windows if forecast is missing), HEPA purifier operation, practical alternatives if no HEPA purifier is owned (interior sanctuary room, closed doors, damp cleaning; note that an unventilated room does not filter air), avoiding combustion (cooking/candles), and never blocking building fresh-air or combustion safety vents.',
  '### 6. Sustainable Alternatives and Environmental Impact',
  'Direct environmental benefits evaluated using the EXACT commute distance provided (show one-way distance, round-trip km, working days, and annual weeks). Clearly distinguish climate CO2e reductions from direct roadside tailpipe toxics (NOx, elemental carbon PM). Cite emission factor assumptions (e.g. EEA/UK DEFRA factors).',
  '### 7. Family Daily Action Checklist',
  'A practical, time-oriented checklist with clear actions for: Morning (commute/school departure), Midday/Afternoon (school/work hours and indoor play), and Evening/Night (commute return, window checks, and sleep protection).',
  '',
  'SCIENTIFIC GROUNDING & SAFETY RULES:',
  '1. You have access to deterministic tools for live telemetry, forecast horizons, vulnerability matrices, indoor protocols, transit comparisons, carbon calculations, and dispersion intelligence.',
  '2. CALL TOOLS ONLY WHEN NEEDED for the specific question. Do not execute tools that are irrelevant to the user\'s query.',
  '3. COMMUTE ACCURACY: If the user provides a specific commute distance (e.g. 12 km), pass that exact distance to calculateEnvironmentalImpact / compareSustainableAlternatives. Never default to 10 km when a distance is given.',
  '4. SENSOR TRANSPARENCY: Never claim indoor hardware sensors exist. Clarify that indoor advisories are calculated protective guidelines based on outdoor infiltration physics.',
  '5. VENTILATION SAFETY: Indoor guidance must NEVER recommend permanently sealing homes or blocking required combustion ventilation. Recommend closing windows while outdoor air is worse and airing out briefly when outdoor air improves. Provide practical low-cost alternatives when no HEPA purifier is owned (designate an interior sanctuary room, keep interior doors closed, damp-wipe surfaces, use central HVAC filtration on recirculate if available). Avoid recommending uncertified DIY box fan modifications which can present motor overheating or electrical hazards in residential spaces.',
  '6. ACTIVE TRANSPORT SAFETY: When asked about transit, explain that walking or cycling during high AQI (>100–150) increases respiratory inhalation volume 3–5x despite having zero emissions.',
  '7. EMISSIONS TRANSPARENCY: Clearly state assumed commute distances (e.g. one-way km, daily round-trip) and distinguish greenhouse gas CO2e reductions from direct roadside tailpipe toxics (NOx, elemental carbon).',
  '8. MEDICAL & FACTUAL ACCURACY:',
  '   - AQI guidance is general environmental intelligence, NOT clinical medical advice.',
  '   - Do NOT make unsupported clinical claims or invent arbitrary numerical breathing rates or exposure reduction percentages.',
  '   - Do NOT give arbitrary time limits like "under 30 minutes" without scientific basis; instead recommend reducing intensity and duration proportionally to pollution severity.',
  '   - Do NOT claim surface temperature or calm winds confirm temperature inversions (inversions cannot be confirmed by surface telemetry alone).',
  '   - When discussing forecasts, reference the actual forecast timestamp, local time, and whether conditions will realistically improve. If forecast data is missing, state so honestly without inventing a clean-air window.',
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
          outdoorAqi: { type: 'number', description: 'Current outdoor US AQI reading (optional, defaults to context AQI).' },
          outdoorPm25: { type: 'number', description: 'Current outdoor PM2.5 particulate concentration in µg/m³.' },
          housingContext: {
            type: 'string',
            enum: ['apartment', 'detached-house', 'naturally-ventilated', 'hvac-filtered'],
            description: 'Optional residential context.',
          },
        },
        required: [],
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
  {
    type: 'function',
    function: {
      name: 'getCurrentEnvironment',
      description:
        'Alias for analyzeEnvironmentalConditions.',
      parameters: {
        type: 'object',
        properties: {
          currentAqi: { type: 'number', description: 'Current US AQI reading.' },
          pm25: { type: 'number', description: 'Current PM2.5 in µg/m³.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentAcuteAirQuality',
      description:
        'Alias for getCurrentAirQuality.',
      parameters: {
        type: 'object',
        properties: {
          latitude: { type: 'number', description: 'Latitude (-90 to 90).' },
          longitude: { type: 'number', description: 'Longitude (-180 to 180).' },
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
  analyze_environmental_condition: 'analyzeEnvironmentalConditions',
  getcurrentenvironment: 'analyzeEnvironmentalConditions',
  get_current_environment: 'analyzeEnvironmentalConditions',
  getenvironmentconditions: 'analyzeEnvironmentalConditions',
  get_environment_conditions: 'analyzeEnvironmentalConditions',
  generatedailyroutine: 'generateDailyRoutine',
  generatedailyroutines: 'generateDailyRoutine',
  generate_daily_routine: 'generateDailyRoutine',
  getdailyroutine: 'generateDailyRoutine',
  get_daily_routine: 'generateDailyRoutine',
  getcurrentairquality: 'getCurrentAirQuality',
  getcurrentacuteairquality: 'getCurrentAirQuality',
  get_current_air_quality: 'getCurrentAirQuality',
  getairquality: 'getCurrentAirQuality',
  get_air_quality: 'getCurrentAirQuality',
  getairqualityforecast: 'getAirQualityForecast',
  get_air_quality_forecast: 'getAirQualityForecast',
  getforecast: 'getAirQualityForecast',
  get_forecast: 'getAirQualityForecast',
  getindoorairguidance: 'getIndoorAirGuidance',
  get_indoor_air_guidance: 'getIndoorAirGuidance',
  getindoorguidance: 'getIndoorAirGuidance',
  get_indoor_guidance: 'getIndoorAirGuidance',
  comparesustainablealternatives: 'compareSustainableAlternatives',
  compare_sustainable_alternatives: 'compareSustainableAlternatives',
  calculateenvironmentalimpact: 'calculateEnvironmentalImpact',
  calculate_environmental_impact: 'calculateEnvironmentalImpact',
  calculateemissions: 'calculateEnvironmentalImpact',
  calculate_emissions: 'calculateEnvironmentalImpact',
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
      const outdoorAqi = Number(rawArgs.outdoorAqi || 100)
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

    const bodyPayload: Record<string, unknown> = {
      model: modelName,
      messages,
      temperature: 0.2,
      max_tokens: 800,
    }

    if (round === 1) {
      bodyPayload.tools = GROQ_OPENAI_TOOLS
      bodyPayload.tool_choice = 'auto'
    }

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
          body: JSON.stringify(bodyPayload),
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
      let finalText = (message.content || '').trim()
      if (!finalText) {
        throw new Error('Groq model returned an empty response.')
      }
      // Sanitize any escaped Markdown backslashes produced by models (e.g. \*\* or \* or \_)
      finalText = unescapeMarkdownBackslashes(finalText)
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

  const promptContext = {
    location: context.locationName || 'Local coordinates',
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
    weatherTelemetry: context.weather ?? null,
  }

  const userPrompt = context.userQuery
    ? `User Question: "${context.userQuery}"\n\nCurrent Ambient Telemetry & Profile:\n${JSON.stringify(promptContext, null, 2)}\n\nPlease answer the user's specific question directly, scientifically, and concisely. Use tools if specific calculation or verification is required.`
    : `Please generate a personalized environmental health and activity briefing based on the following telemetry:\n${JSON.stringify(promptContext, null, 2)}`

  // 1. ATTEMPT PRIMARY: Google Gemini 2.5 Flash
  let geminiAuthError: Error | null = null
  let geminiFailedDueToQuotaOrNetwork = false
  let geminiErrorMessage = ''

  const circuit = getGeminiCircuitState()
  if (circuit.isOpen) {
    geminiFailedDueToQuotaOrNetwork = true
    geminiErrorMessage = `Gemini circuit open (${circuit.remainingSeconds}s cooldown remaining)`
  } else if (context.simulateGeminiQuota) {
    geminiFailedDueToQuotaOrNetwork = true
    geminiErrorMessage = 'Simulated Gemini HTTP 429 Quota Exhausted'
    tripGeminiCircuit()
  } else if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey, apiVersion: 'v1beta' })
      const modelName = 'gemini-2.5-flash'
      const contents: any[] = [{ role: 'user', parts: [{ text: userPrompt }] }]

      let round = 0
      const maxRounds = 5

      while (round < maxRounds) {
        round++

        let timeoutId: NodeJS.Timeout | undefined
        let response: any
        try {
          const generatePromise = ai.models.generateContent({
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

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Gemini API call timed out after 12s.')), 12000)
          })

          response = await Promise.race([generatePromise, timeoutPromise])
        } finally {
          if (timeoutId) clearTimeout(timeoutId)
        }

        const candidate = response.candidates?.[0]
        const modelContent = candidate?.content
        if (!modelContent) throw new Error('No content returned from Gemini model.')

        contents.push(modelContent)
        const functionCalls = modelContent.parts?.filter((p: any) => p.functionCall) ?? []

        if (functionCalls.length === 0) {
          let finalText = modelContent.parts?.map((p: any) => p.text || '').join('').trim()
          if (!finalText) throw new Error('Gemini produced an empty response.')

          finalText = unescapeMarkdownBackslashes(finalText)

          return {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            text: finalText,
            toolRounds: round - 1,
            isFallback: false,
          }
        }

        const toolResponseParts = await Promise.all(
          functionCalls.map(async (part: any) => {
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

        // If quota exhausted (429), trip circuit breaker to protect latency and quota
        if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
          tripGeminiCircuit()
        }
      }
    }
  } else {
    geminiFailedDueToQuotaOrNetwork = true
    geminiErrorMessage = 'Gemini API key is not configured.'
  }

  // If Gemini failed with an auth or config error, log internally and allow Groq or deterministic fallback to handle it
  if (geminiAuthError && !groqApiKey) {
    console.warn(`[AI Provider Manager] Gemini authentication failed: ${geminiAuthError.message}. Proceeding to deterministic fallback.`)
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
        providerNotice: 'Synthesized via secondary AI environmental intelligence.',
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
    model: 'Rule-Based Environmental Engine',
    text: fallbackText,
    toolRounds: 0,
    isFallback: true,
    providerNotice: 'Computed using verified deterministic environmental algorithms.',
  }
}
