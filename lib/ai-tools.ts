/**
 * AIRWISE AI — Deterministic AI Tool Engine
 * 
 * Provides verified data retrieval and deterministic mathematical/exposure calculations
 * for the Google Gemini assistant, preventing hallucinations and ensuring grounded recommendations.
 * 
 * Sources:
 * - Air Quality & Weather: Open-Meteo Air Quality & Weather APIs (and Google AQI API when key is configured)
 * - Emission Factors: European Environment Agency (EEA) / UK DEFRA passenger-km standards
 * - Health Guidelines: US EPA Air Quality Index (AQI) exposure standards & WHO particulate guidelines
 */

// In-memory cache for deterministic tool executions (5-minute TTL)
type CacheEntry = { data: any; expiresAt: number }
const toolCache = new Map<string, CacheEntry>()

export function getCachedToolResult<T>(cacheKey: string): T | null {
  const entry = toolCache.get(cacheKey)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    toolCache.delete(cacheKey)
    return null
  }
  return entry.data as T
}

export function setCachedToolResult(cacheKey: string, data: any, ttlSeconds = 300) {
  toolCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

/**
 * Deterministic Environmental Fallback Synthesizer
 * Formats verified, calculated environmental tool guidance when Gemini API quota or network is unavailable.
 */
export function generateDeterministicFallbackGuidance(params: {
  locationName: string | null
  currentAqi: number
  pm25: number | null
  pm10: number | null
  readingLabel: string
  householdProfile: string
  plannedActivity: string
  userQuery?: string | null
  weatherContext?: {
    temperatureC?: number | null
    relativeHumidityPercent?: number | null
    windSpeedKmh?: number | null
  } | null
}): string {
  const query = (params.userQuery || '').toLowerCase()
  const loc = params.locationName ?? 'Local Coordinates'
  const aqi = params.currentAqi
  const pm25Str = params.pm25 != null ? `${params.pm25.toFixed(1)} µg/m³` : 'N/A'

  // Determine category
  let cat = 'Moderate'
  if (aqi <= 50) cat = 'Good'
  else if (aqi <= 100) cat = 'Moderate'
  else if (aqi <= 150) cat = 'Unhealthy for Sensitive Groups'
  else if (aqi <= 200) cat = 'Unhealthy'
  else if (aqi <= 300) cat = 'Very Unhealthy'
  else cat = 'Hazardous'

  const banner = `> **AIRWISE Verified Rule-Based Response** · *Calculated directly from verified environmental algorithms while AI providers are offline or rate-limited.*`

  // 1. FAMILY MULTI-MEMBER SCENARIO / COMPREHENSIVE PLAN
  if (
    query.includes('family') ||
    (query.includes('children') && query.includes('elderly')) ||
    (query.includes('parent') && (query.includes('children') || query.includes('commute'))) ||
    query.includes('plan')
  ) {
    // Extract user-specified commute distance if mentioned (e.g. "12 km" or "15km")
    let commuteDistance = 12
    const distMatch = query.match(/(\d+(?:\.\d+)?)\s*km/)
    if (distMatch) {
      const parsedDist = parseFloat(distMatch[1])
      if (Number.isFinite(parsedDist) && parsedDist > 0 && parsedDist < 300) {
        commuteDistance = parsedDist
      }
    }

    const routineChildren = generateDailyRoutine({
      currentAqi: aqi,
      householdProfile: 'children',
      plannedActivity: 'outdoor exercise or play',
      weatherContext: params.weatherContext,
    })
    const routineElderly = generateDailyRoutine({
      currentAqi: aqi,
      householdProfile: 'older-adult',
      plannedActivity: 'walking or cycling',
      weatherContext: params.weatherContext,
    })
    const commuteImpact = calculateEnvironmentalImpact({
      baselineModeId: 'car-petrol',
      alternativeModeId: 'rail',
      distanceKm: commuteDistance,
      tripsPerWeek: 5,
    })
    const transitAlts = compareSustainableAlternatives({
      baselineModeId: 'car-petrol',
      distanceKm: commuteDistance,
      currentAqi: aqi,
    })
    const indoor = getIndoorAirGuidance({
      outdoorAqi: aqi,
      outdoorPm25: params.pm25,
      weatherContext: params.weatherContext,
    })

    const roundTripKm = (commuteDistance * 2).toFixed(1)
    const annualKg = commuteImpact.calculations.annualSavedKgCO2e.toFixed(1)

    return [
      banner,
      '',
      `### 1. Current Air-Quality Situation`,
      `Location: **${loc}** | US AQI: **${aqi}** (${cat})${params.pm25 != null ? ` | PM2.5: **${pm25Str}**` : ''}.`,
      params.weatherContext?.windSpeedKmh != null
        ? `Surface Wind: **${params.weatherContext.windSpeedKmh.toFixed(1)} km/h** | Relative Humidity: **${params.weatherContext.relativeHumidityPercent ?? 'N/A'}%**.`
        : 'Local surface wind and humidity telemetry unavailable.',
      `Atmospheric conditions currently restrict dispersion. Note: surface observations indicate ground-level stagnation, but upper-air temperature inversions cannot be confirmed by surface telemetry alone.`,
      '',
      `### 2. Recommendations for the Children`,
      `- **School Commute & Play:** ${routineChildren.activityGuidance}`,
      `- **Sports & Outdoor Exertion:** Suspend high-intensity outdoor soccer/cricket. Physical exertion significantly increases respiratory ventilation rate, multiplying particulate inhalation. Children should avoid vigorous outdoor play during elevated pollution.`,
      `- **Indoor Alternatives:** Relocate games indoors; use quiet indoor play or indoor community centers. Avoid tight-fitting industrial respirators for small children unless prescribed and fitted by a pediatrician.`,
      '',
      `### 3. Recommendations for the Elderly Member`,
      `- **Outdoor Walks & Errands:** ${routineElderly.activityGuidance}`,
      `- **Precautions:** Avoid morning and evening rush-hour traffic hours when vehicular exhaust pools near ground level. For individuals with cardiovascular or respiratory history, follow personal physician advice and check with local public health advisories.`,
      `- **Indoor Alternatives:** Gentle indoor walking, stretching, or reading in an interior room with stable air.`,
      '',
      `### 4. Working Parent's Commute Plan`,
      `- **Transit Evaluation:** Baseline commute evaluated at **${commuteDistance} km one-way** (${roundTripKm} km daily round-trip across 5 working days/week).`,
      `- **Lower-Emission Options:** If electric metro/rail or high-occupancy buses are available on your route, shifting from a solo petrol car avoids **${commuteImpact.calculations.singleTripSavedKgCO2e} kg CO₂e per one-way trip** (an ${commuteImpact.calculations.percentReduction}% reduction). If public rail/bus routes are not accessible, consider organized carpooling or ridesharing to cut per-person vehicle trips.`,
      `- **Exposure Reduction During Travel:** If driving, keep vehicle windows rolled up and switch ventilation to cabin recirculation. Avoid cycling or walking along congested traffic corridors at AQI ${aqi}.`,
      `- **Tailpipe Benefit:** ${commuteImpact.directPollutantReductionMechanism}`,
      '',
      `### 5. Indoor Air-Quality and Ventilation Plan`,
      `- **Window Strategy:** ${indoor.windowVentilationStrategy}`,
      `- **Air Purifiers & Low-Infiltration Guidance:** ${indoor.airPurificationGuidance}`,
      `- **Sanctuary Room Caution:** Note that designating an interior room with closed doors limits drafts and infiltration, but does not actively scrub ultrafine particulates unless dedicated filtration is present.`,
      `- **Combustion Safety & Ventilation:** ${indoor.indoorCombustionPrecautions} Never seal homes indefinitely or block building fresh-air intakes or combustion appliance safety vents.`,
      `- **Cleaning:** ${indoor.dustAndCleaningAdvice}`,
      '',
      `### 6. Sustainable Alternatives and Environmental Impact`,
      `- **Calculation Assumptions:** Based on **${commuteDistance} km one-way** (petrol car factor: 171 g CO₂e/km vs. electric rail: 35 g CO₂e/km, UK DEFRA/EEA factors). Single one-way trip baseline: **${commuteImpact.calculations.singleTripBaseKgCO2e} kg CO₂e**; rail alternative: **${commuteImpact.calculations.singleTripAltKgCO2e} kg CO₂e**.`,
      `- **Annual & Weekly Savings:** Across 5 commute days (10 trips/week, 48 working weeks/year), this switch avoids **${commuteImpact.calculations.weeklySavedKgCO2e} kg CO₂e weekly** (~**${annualKg} kg CO₂e annually**).`,
      `- **Distinction between CO₂e and Local Toxics:** CO₂e reductions mitigate global greenhouse forcing, whereas shifting off combustion engines directly removes toxic street-level tailpipe nitric oxides (NOx) and fine elemental black carbon from neighborhoods.`,
      '',
      `### 7. Family Daily Action Checklist`,
      `- **Morning (07:00–09:00):** Keep windows shut; parent commutes via public transit or carpool with cabin recirculation; children take enclosed transit to school.`,
      `- **Midday & Afternoon (12:00–16:00):** Keep children's sports indoors; elderly relative rests or exercises in interior room; avoid frying food or unvented indoor burning.`,
      `- **Evening & Night (18:00–22:00):** Check forecast before brief airing; if AQI remains elevated, maintain closed windows and run bedroom air filtration; damp-wipe surfaces before bed.`,
      '',
      `*Sensor Transparency: ${indoor.sensorDisclaimer}*`,
    ].filter(Boolean).join('\n')
  }

  // 2. WINDOWS & INDOOR VENTILATION
  if (query.includes('window') || query.includes('ventil') || query.includes('indoor') || query.includes('air purifier')) {
    const indoor = getIndoorAirGuidance({
      outdoorAqi: aqi,
      outdoorPm25: params.pm25,
      weatherContext: params.weatherContext,
    })
    return [
      banner,
      '',
      `### Window & Indoor Air Guidance for ${loc}`,
      `- **Current Outdoor Air Quality:** US AQI **${aqi}** (${cat}), PM2.5 **${pm25Str}**.`,
      `- **Window Strategy:** ${indoor.windowVentilationStrategy}`,
      `- **Air Purifier Recommendation:** ${indoor.airPurificationGuidance}`,
      `- **Indoor Combustion Precautions:** ${indoor.indoorCombustionPrecautions}`,
      `- **Dust & Maintenance:** ${indoor.dustAndCleaningAdvice}`,
      '',
      `*Sensor Transparency: ${indoor.sensorDisclaimer}*`,
    ].join('\n')
  }

  // 2. SPORTS, PLAY & OUTDOOR ACTIVITIES
  if (query.includes('play') || query.includes('football') || query.includes('cricket') || query.includes('sport') || query.includes('outside') || query.includes('child') || query.includes('exercise')) {
    const routine = generateDailyRoutine({
      currentAqi: aqi,
      householdProfile: (params.householdProfile as any) || (query.includes('child') ? 'children' : 'general'),
      plannedActivity: 'outdoor exercise or play',
      weatherContext: params.weatherContext,
    })
    return [
      banner,
      '',
      `### Outdoor Activity Guidance for ${loc}`,
      `- **Current Condition:** US AQI **${aqi}** (${cat}), PM2.5 **${pm25Str}**.`,
      `- **Activity Suitability:** **${routine.activityGuidance}** (${routine.suitability})`,
      `- **Timing Strategy:** ${routine.recommendedTiming}`,
      `- **Respiratory Mitigation:** ${routine.exposureMitigation}`,
      `- **Rationale:** ${routine.rationale}`,
    ].join('\n')
  }

  // 3. COMMUTE, EMISSIONS & TRANSIT
  if (query.includes('emiss') || query.includes('co2') || query.includes('commut') || query.includes('car') || query.includes('metro') || query.includes('transit') || query.includes('bus')) {
    const impact = calculateEnvironmentalImpact({
      baselineModeId: 'car-petrol',
      alternativeModeId: 'rail',
      distanceKm: 10,
      tripsPerWeek: 5,
    })
    const alternatives = compareSustainableAlternatives({
      baselineModeId: 'car-petrol',
      distanceKm: 10,
      currentAqi: aqi,
    })
    return [
      banner,
      '',
      `### Commute Emissions & Low-Emission Transit (10 km daily baseline)`,
      `- **Current Ambient AQI:** US AQI **${aqi}** (${cat}).`,
      `- **Carbon Savings:** Shifting from a solo petrol car to electric rail saves **${impact.calculations.singleTripSavedKgCO2e} kg CO₂e** per 10 km trip (${impact.calculations.percentReduction}% reduction).`,
      `- **Weekly & Annual Impact:** Saves **${impact.calculations.weeklySavedKgCO2e} kg CO₂e** weekly (~${impact.calculations.annualSavedKgCO2e} kg CO₂e per year).`,
      `- **Tailpipe Pollution Benefits:** ${impact.directPollutantReductionMechanism}`,
      `- **Health & Active Travel Safety:** ${alternatives.advisory}`,
    ].join('\n')
  }

  // 4. CURRENT AQI / POLLUTANTS QUERY
  if (query.includes('aqi') || query.includes('pm2.5') || query.includes('pm10') || query.includes('current') || query.includes('level')) {
    const intelligence = analyzeEnvironmentalConditions({
      currentAqi: aqi,
      pm25: params.pm25,
      pm10: params.pm10,
      temperatureC: params.weatherContext?.temperatureC,
      relativeHumidityPercent: params.weatherContext?.relativeHumidityPercent,
      windSpeedKmh: params.weatherContext?.windSpeedKmh,
    })
    return [
      banner,
      '',
      `### Current Air Quality Telemetry: ${loc}`,
      `- **US AQI:** **${aqi}** (${cat})`,
      `- **PM2.5:** **${pm25Str}**`,
      params.pm10 != null ? `- **PM10:** **${params.pm10.toFixed(1)} µg/m³**` : '',
      `- **Atmospheric Dispersion:** **${intelligence.stagnationStatus}** (${params.weatherContext?.windSpeedKmh != null ? `${params.weatherContext.windSpeedKmh.toFixed(1)} km/h wind` : 'calm'})`,
      `- **Action Advice:** ${intelligence.recommendedAction}`,
      `- **Data Source:** ${params.readingLabel} (coordinate-based estimate)`,
    ].filter(Boolean).join('\n')
  }

  // 5. GENERAL COMPREHENSIVE BRIEFING (when no specific intent matches or full plan requested)
  const routine = generateDailyRoutine({
    currentAqi: aqi,
    householdProfile: params.householdProfile as any,
    plannedActivity: params.plannedActivity,
    weatherContext: params.weatherContext,
  })
  const indoor = getIndoorAirGuidance({
    outdoorAqi: aqi,
    outdoorPm25: params.pm25,
    weatherContext: params.weatherContext,
  })

  return [
    banner,
    '',
    `### Environmental Health Summary for ${loc}`,
    `- **Air Quality:** US AQI **${aqi}** (${cat}) | PM2.5: **${pm25Str}**`,
    `- **Activity Guidance:** ${routine.activityGuidance}`,
    `- **Windows & Ventilation:** ${indoor.windowVentilationStrategy}`,
    `- **Indoor Care:** ${indoor.airPurificationGuidance}`,
  ].join('\n')
}

export const TRANSPORT_MODES = [
  {
    id: 'car-petrol',
    name: 'Solo Petrol/Diesel Car',
    factor: 171,
    category: 'private',
    description: 'Average combustion vehicle with single occupant.',
  },
  {
    id: 'car-ev',
    name: 'Electric Car (EV)',
    factor: 48,
    category: 'private',
    description: 'Battery electric vehicle running on average power grid.',
  },
  {
    id: 'bus',
    name: 'City Bus / Transit',
    factor: 82,
    category: 'public',
    description: 'Municipal transit bus with typical passenger load.',
  },
  {
    id: 'rail',
    name: 'Metro / Electric Rail',
    factor: 35,
    category: 'public',
    description: 'Electric commuter rail or underground subway.',
  },
  {
    id: 'ebike',
    name: 'E-Bike / Micro-Mobility',
    factor: 12,
    category: 'active',
    description: 'Light electric battery-assisted mobility.',
  },
  {
    id: 'walking',
    name: 'Walking / Bicycle',
    factor: 0,
    category: 'active',
    description: 'Human-powered active transport with zero tailpipe emissions.',
  },
] as const

export type CoordinateInput = {
  latitude: number
  longitude: number
}

export type CurrentAirQualityResult = {
  source: 'google-air-quality-api' | 'open-meteo-air-quality-api'
  aqi: number
  category: string
  dominantPollutant: string | null
  pm25: number | null
  pm10: number | null
  updatedAt: string | null
  timezone: string | null
  units: {
    pm25: string
    pm10: string
  }
  coordinates: {
    latitude: number
    longitude: number
  }
}

export type ForecastHourData = {
  hourAhead: number
  time: string | null
  aqi: number | null
  pm25: number | null
  pm10: number | null
}

export type AirQualityForecastResult = {
  source: string
  timezone: string | null
  coordinates: {
    latitude: number
    longitude: number
  }
  forecast: ForecastHourData[]
  cleanestWindow: {
    startHourAhead: number
    endHourAhead: number
    bestAqi: number | null
    description: string
  } | null
}

export type DailyRoutineInput = {
  currentAqi: number
  householdProfile: 'general' | 'children' | 'older-adult' | 'respiratory' | 'outdoor-worker'
  plannedActivity: string
  cleanestWindowDescription?: string | null
  weatherContext?: {
    temperatureC?: number | null
    relativeHumidityPercent?: number | null
    windSpeedKmh?: number | null
    windDirectionDeg?: number | null
  } | null
}

export type DailyRoutineResult = {
  suitability: 'Favorable' | 'Moderate / Caution' | 'Unfavorable / Restrict' | 'Hazardous'
  activityGuidance: string
  recommendedTiming: string
  exposureMitigation: string
  rationale: string
  disclaimer: string
}

export type IndoorGuidanceInput = {
  outdoorAqi: number
  outdoorPm25?: number | null
  housingContext?: 'apartment' | 'detached-house' | 'naturally-ventilated' | 'hvac-filtered'
  weatherContext?: {
    temperatureC?: number | null
    relativeHumidityPercent?: number | null
    windSpeedKmh?: number | null
  } | null
}

export type IndoorGuidanceResult = {
  windowVentilationStrategy: string
  airPurificationGuidance: string
  indoorCombustionPrecautions: string
  dustAndCleaningAdvice: string
  sensorDisclaimer: string
}

export type SustainableAlternativesInput = {
  baselineModeId: string
  distanceKm: number
  currentAqi: number
}

export type TransportAlternativeOption = {
  id: string
  name: string
  emissionFactorGPerKm: number
  category: 'private' | 'public' | 'active'
  estimatedTripKgCO2e: number
  respiratoryExposureRisk: 'Low' | 'Moderate' | 'High' | 'Severe'
  recommendationNote: string
}

export type SustainableAlternativesResult = {
  baseline: {
    id: string
    name: string
    factorGPerKm: number
    tripKgCO2e: number
  }
  alternatives: TransportAlternativeOption[]
  advisory: string
}

export type EnvironmentalImpactInput = {
  baselineModeId: string
  alternativeModeId: string
  distanceKm: number
  tripsPerWeek: number
}

export type EnvironmentalImpactResult = {
  baselineMode: {
    id: string
    name: string
    factorGCO2ePerKm: number
  }
  alternativeMode: {
    id: string
    name: string
    factorGCO2ePerKm: number
  }
  inputs: {
    distanceKm: number
    tripsPerWeek: number
    weeklyKm: number
  }
  calculations: {
    singleTripBaseKgCO2e: number
    singleTripAltKgCO2e: number
    singleTripSavedKgCO2e: number
    weeklyBaseKgCO2e: number
    weeklyAltKgCO2e: number
    weeklySavedKgCO2e: number
    annualSavedKgCO2e: number
    percentReduction: number
  }
  directPollutantReductionMechanism: string
  methodologyDisclosure: string
}

// -------------------------------------------------------------
// Validation Utilities
// -------------------------------------------------------------

export function validateCoordinates(lat: unknown, lon: unknown): { valid: boolean; error?: string } {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return { valid: false, error: 'Coordinates must be valid numbers.' }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { valid: false, error: 'Coordinates must be finite numbers.' }
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90 degrees.' }
  }
  if (lon < -180 || lon > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180 degrees.' }
  }
  return { valid: true }
}

function getAqiCategory(aqi: number): string {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for sensitive groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very unhealthy'
  return 'Hazardous'
}

// -------------------------------------------------------------
// TOOL 1: getCurrentAirQuality
// -------------------------------------------------------------
export async function getCurrentAirQuality(input: CoordinateInput): Promise<CurrentAirQualityResult> {
  const check = validateCoordinates(input.latitude, input.longitude)
  if (!check.valid) {
    throw new Error(check.error || 'Invalid coordinates provided.')
  }

  const { latitude, longitude } = input

  // Check if Google Air Quality API key is configured
  const googleKey = process.env.GOOGLE_MAPS_API_KEY
  if (googleKey) {
    try {
      const response = await fetch(
        `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${encodeURIComponent(googleKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: { latitude, longitude },
            extraComputations: ['POLLUTANT_CONCENTRATION'],
          }),
          signal: AbortSignal.timeout(6000),
          cache: 'no-store',
        }
      )

      if (response.ok) {
        const data = await response.json()
        const index = data.indexes?.find(
          (item: { code?: string; displayName?: string }) =>
            item.code === 'uaqi' || item.displayName === 'US AQI'
        )

        if (index && typeof index.aqi === 'number') {
          const concentrations = Object.fromEntries(
            (data.pollutants ?? []).map((item: { code?: string; concentration?: { value?: number } }) => [
              item.code,
              item.concentration,
            ])
          )

          return {
            source: 'google-air-quality-api',
            aqi: Math.round(index.aqi),
            category: index.category || getAqiCategory(index.aqi),
            dominantPollutant: index.dominantPollutant ?? null,
            pm25: typeof concentrations['pm25']?.value === 'number' ? concentrations['pm25'].value : null,
            pm10: typeof concentrations['pm10']?.value === 'number' ? concentrations['pm10'].value : null,
            updatedAt: data.dateTime ?? null,
            timezone: null,
            units: { pm25: 'µg/m³', pm10: 'µg/m³' },
            coordinates: { latitude, longitude },
          }
        }
      }
    } catch {
      // Fall through to Open-Meteo
    }
  }

  // Open-Meteo Air Quality API
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('current', 'us_aqi,pm2_5,pm10')
  url.searchParams.set('timezone', 'auto')

  const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Open-Meteo Air Quality service failed with HTTP ${response.status}.`)
  }

  const data = await response.json()
  const current = data.current
  if (!current || typeof current.us_aqi !== 'number' || !Number.isFinite(current.us_aqi)) {
    throw new Error('No valid AQI reading returned from the air quality provider.')
  }

  return {
    source: 'open-meteo-air-quality-api',
    aqi: Math.round(current.us_aqi),
    category: getAqiCategory(current.us_aqi),
    dominantPollutant: null,
    pm25: typeof current.pm2_5 === 'number' && Number.isFinite(current.pm2_5) ? current.pm2_5 : null,
    pm10: typeof current.pm10 === 'number' && Number.isFinite(current.pm10) ? current.pm10 : null,
    updatedAt: current.time ?? null,
    timezone: data.timezone ?? null,
    units: {
      pm25: data.current_units?.pm2_5 ?? 'µg/m³',
      pm10: data.current_units?.pm10 ?? 'µg/m³',
    },
    coordinates: {
      latitude: data.latitude ?? latitude,
      longitude: data.longitude ?? longitude,
    },
  }
}

// -------------------------------------------------------------
// TOOL 2: getAirQualityForecast
// -------------------------------------------------------------
export async function getAirQualityForecast(
  input: CoordinateInput & { hoursAhead?: number[] }
): Promise<AirQualityForecastResult> {
  const check = validateCoordinates(input.latitude, input.longitude)
  if (!check.valid) {
    throw new Error(check.error || 'Invalid coordinates provided.')
  }

  const { latitude, longitude } = input
  const targetHours = input.hoursAhead ?? [3, 6, 12, 24]

  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('current', 'us_aqi,pm2_5,pm10')
  url.searchParams.set('hourly', 'us_aqi,pm2_5,pm10')
  url.searchParams.set('timezone', 'auto')

  const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Open-Meteo Hourly Forecast service failed with HTTP ${response.status}.`)
  }

  const data = await response.json()
  const current = data.current
  const times: string[] = data.hourly?.time ?? []
  const aqiList: Array<number | null> = data.hourly?.us_aqi ?? []
  const pm25List: Array<number | null> = data.hourly?.pm2_5 ?? []
  const pm10List: Array<number | null> = data.hourly?.pm10 ?? []

  const currentTimestamp = current?.time ? Date.parse(current.time) : Date.now()

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

  const forecastItems: ForecastHourData[] = targetHours.map((hour) => {
    const idx = nearestIndex(currentTimestamp + hour * 60 * 60 * 1000)
    const val = (arr: Array<number | null>) =>
      idx >= 0 && typeof arr[idx] === 'number' && Number.isFinite(arr[idx]) ? arr[idx] : null

    return {
      hourAhead: hour,
      time: idx >= 0 ? times[idx] : null,
      aqi: val(aqiList),
      pm25: val(pm25List),
      pm10: val(pm10List),
    }
  })

  // Determine cleanest / safest window across available future hourly slots (up to 24h)
  let bestAqi: number | null = null
  let bestHourIndex = -1

  forecastItems.forEach((item, idx) => {
    if (item.aqi !== null && (bestAqi === null || item.aqi < bestAqi)) {
      bestAqi = item.aqi
      bestHourIndex = idx
    }
  })

  let cleanestWindow: AirQualityForecastResult['cleanestWindow'] = null
  if (bestHourIndex >= 0 && bestAqi !== null) {
    const bestItem = forecastItems[bestHourIndex]
    cleanestWindow = {
      startHourAhead: bestItem.hourAhead,
      endHourAhead: bestItem.hourAhead + 2,
      bestAqi,
      description: `Lowest projected AQI is ~${bestAqi} around +${bestItem.hourAhead}h (${bestItem.time ? bestItem.time.split('T')[1] || bestItem.time : 'ahead'}).`,
    }
  }

  return {
    source: 'open-meteo-air-quality-api',
    timezone: data.timezone ?? null,
    coordinates: {
      latitude: data.latitude ?? latitude,
      longitude: data.longitude ?? longitude,
    },
    forecast: forecastItems,
    cleanestWindow,
  }
}

// -------------------------------------------------------------
// TOOL 3: generateDailyRoutine
// -------------------------------------------------------------
export function generateDailyRoutine(input: DailyRoutineInput): DailyRoutineResult {
  const { currentAqi, householdProfile, plannedActivity, cleanestWindowDescription, weatherContext } = input

  if (typeof currentAqi !== 'number' || !Number.isFinite(currentAqi) || currentAqi < 0) {
    throw new Error('A valid non-negative AQI number is required.')
  }

  const isVulnerable = ['children', 'older-adult', 'respiratory'].includes(householdProfile)
  const isOutdoorWorker = householdProfile === 'outdoor-worker'

  let suitability: DailyRoutineResult['suitability'] = 'Favorable'
  let activityGuidance = ''
  let recommendedTiming = ''
  let exposureMitigation = ''
  let rationale = ''

  // Meteorological stagnation awareness
  let weatherNote = ''
  if (weatherContext) {
    const isStagnant = typeof weatherContext.windSpeedKmh === 'number' && weatherContext.windSpeedKmh < 6
    const isHighHumidity = typeof weatherContext.relativeHumidityPercent === 'number' && weatherContext.relativeHumidityPercent > 80
    const isCold = typeof weatherContext.temperatureC === 'number' && weatherContext.temperatureC < 12

    if (isStagnant && (isHighHumidity || isCold)) {
      weatherNote = ` Atmospheric conditions are calm (${weatherContext.windSpeedKmh?.toFixed(1)} km/h wind) with high humidity/cool surface air, which promotes local particulate stagnation and smog trapping.`
    } else if (typeof weatherContext.windSpeedKmh === 'number' && weatherContext.windSpeedKmh >= 15) {
      weatherNote = ` Surface winds (${weatherContext.windSpeedKmh.toFixed(1)} km/h) are actively assisting atmospheric dispersal.`
    }
  }

  if (currentAqi <= 50) {
    suitability = 'Favorable'
    activityGuidance = `Optimal conditions for ${plannedActivity}. Full outdoor exertion and active transit are fully suitable.`
    recommendedTiming = 'Any time throughout the day is suitable for outdoor plans.'
    exposureMitigation = 'No special respiratory filters or route restrictions needed.'
    rationale = 'Ambient particulate levels are within WHO and EPA safety thresholds; negligible cardiovascular or pulmonary stress.'
  } else if (currentAqi <= 100) {
    suitability = isVulnerable ? 'Moderate / Caution' : 'Favorable'
    activityGuidance = isVulnerable
      ? `Acceptable for ${plannedActivity}, but sensitive individuals should moderate continuous high-intensity cardio outdoors.`
      : `Standard conditions for ${plannedActivity}. Proceed with normal schedules.`
    recommendedTiming = cleanestWindowDescription
      ? `Prioritize outdoor segments during: ${cleanestWindowDescription}`
      : 'Midday dispersion hours (11:00–15:00) generally feature better mixing than early rush hour.'
    exposureMitigation = isVulnerable
      ? 'Avoid heavy traffic corridors; choose parkside or quieter residential paths.'
      : 'Maintain standard hydration and awareness.'
    rationale = 'Moderate particulate presence can cause subtle airway irritation in hyper-reactive airways.'
  } else if (currentAqi <= 150) {
    suitability = isVulnerable ? 'Unfavorable / Restrict' : 'Moderate / Caution'
    activityGuidance = isVulnerable
      ? `Avoid strenuous outdoor ${plannedActivity}. Relocate cardio, training, or long play sessions indoors.`
      : `Limit prolonged vigorous exertion outdoors during ${plannedActivity}. Take frequent breaks.`
    recommendedTiming = cleanestWindowDescription
      ? `If outdoor presence is unavoidable, restrict to: ${cleanestWindowDescription}`
      : 'Midday dispersion hours (11:00–15:00) generally feature better mixing than early rush hour when surface-level exhaust pools.'
    exposureMitigation = isOutdoorWorker || isVulnerable
      ? 'Wear a fitted N95/FFP2 respirator when along major traffic arteries (consult pediatrician/physician for small children or severe COPD).'
      : 'Reduce duration of intense physical breathing.'
    rationale =
      'Elevated PM2.5 triggers pulmonary irritation and respiratory strain in developing or compromised airways.'
  } else if (currentAqi <= 200) {
    suitability = 'Unfavorable / Restrict'
    activityGuidance = `Unhealthy air. Cancel outdoor sports, long jogs, and unessential outdoor segments of ${plannedActivity}.`
    recommendedTiming = 'Reschedule outdoor physical activity to indoor climate-filtered spaces.'
    exposureMitigation = 'Fitted N95/FFP2 respirator advised for unavoidable outdoor transit (pediatric/clinical suitability applies).'
    rationale =
      'Fine particulate concentrations elevate respiratory irritation and cardiovascular strain across sensitive groups and the general population.'
  } else {
    // 201+
    suitability = 'Hazardous'
    activityGuidance = `Severe smog episode. Keep all household members indoors. Suspend all outdoor exercise or unnecessary travel for ${plannedActivity}.`
    recommendedTiming = 'Remain indoors in sealed, filtered environments until emergency smog advisories lift.'
    exposureMitigation = 'Well-fitted N95/FFP2 respirator mandatory if stepping outdoors; operate indoor HEPA purifiers continuously.'
    rationale =
      'Extremely hazardous concentrations of ultrafine PM and combustion copollutants pose acute pulmonary and cardiovascular risks.'
  }

  return {
    suitability,
    activityGuidance,
    recommendedTiming,
    exposureMitigation,
    rationale: `${rationale}${weatherNote}`,
    disclaimer:
      'General exposure guidance based on regulatory AQI thresholds and surface weather; does not constitute individualized clinical or medical advice.',
  }
}

// -------------------------------------------------------------
// TOOL 4: getIndoorAirGuidance
// -------------------------------------------------------------
export function getIndoorAirGuidance(input: IndoorGuidanceInput): IndoorGuidanceResult {
  const { outdoorAqi, outdoorPm25, weatherContext } = input

  if (typeof outdoorAqi !== 'number' || !Number.isFinite(outdoorAqi) || outdoorAqi < 0) {
    throw new Error('Valid non-negative outdoor AQI is required.')
  }

  let windowVentilationStrategy = ''
  let airPurificationGuidance = ''
  let indoorCombustionPrecautions = ''
  let dustAndCleaningAdvice = ''

  let humidityNote = ''
  if (weatherContext && typeof weatherContext.relativeHumidityPercent === 'number') {
    if (weatherContext.relativeHumidityPercent > 75) {
      humidityNote = ` High ambient humidity (${weatherContext.relativeHumidityPercent.toFixed(0)}%) slows particulate evaporation and keeps moisture elevated; avoid prolonged open airing during damp periods.`
    }
  }

  if (outdoorAqi <= 50) {
    windowVentilationStrategy =
      'Open windows for cross-ventilation (30–60 minutes) to flush indoor CO₂, volatile organic compounds (VOCs), and moisture.'
    airPurificationGuidance =
      'HEPA air purifiers can be run on low or eco mode; if you do not have a purifier, natural ventilation currently provides clean air exchange.'
    indoorCombustionPrecautions =
      'Standard kitchen ventilation: use an exhaust hood when frying or cooking with gas burners.'
    dustAndCleaningAdvice =
      'Standard regular vacuuming and damp wiping maintain good indoor baseline cleanliness.'
  } else if (outdoorAqi <= 100) {
    windowVentilationStrategy =
      'Selective airing: open windows briefly for 10–15 minutes during early afternoon when traffic dips. Keep closed during morning and evening rush hour spikes. Never seal permanently.'
    airPurificationGuidance =
      'Run HEPA air cleaner in primary living areas and bedrooms at moderate speed. If no purifier is available, limit airing to the cleanest afternoon window and avoid stirring up dust.'
    indoorCombustionPrecautions =
      'Always run kitchen range hood to exterior. Avoid burning candles, incense, or unvented indoor burners.'
    dustAndCleaningAdvice =
      'Use microfiber damp wiping to prevent resuspending settled dust into breathing zones.'
  } else if (outdoorAqi <= 150) {
    windowVentilationStrategy =
      'Keep windows and balcony doors closed while outdoor pollution is elevated, but do not block required building fresh-air or combustion vents. Ventilate briefly later when outdoor air quality improves.'
    airPurificationGuidance =
      'Operate verified HEPA air purifiers continuously in bedrooms and main rooms. If a HEPA purifier is unavailable: create a designated interior cleaner room with closed doors, place damp towels along drafty door gaps, minimize indoor activity that resuspends dust, and use central HVAC with high-efficiency filters on recirculation.'
    indoorCombustionPrecautions =
      'Strictly avoid indoor smoking, frying, charring food, or lighting scented candles/incense. These generate intense localized PM2.5 spikes.'
    dustAndCleaningAdvice =
      'Damp mop hard floors and wipe surfaces with damp cloths. Do NOT use dry brooms or feather dusters which resuspend fine dust.'
  } else {
    // 151+
    windowVentilationStrategy =
      'Keep windows, outer doors, and unneeded external vents closed during this high-pollution episode. Crucial: never seal homes indefinitely or block required gas/combustion appliance safety vents. Air out the home briefly only when forecast shows outdoor AQI dropping to safer levels.'
    airPurificationGuidance =
      'Run HEPA filtration on high/turbo continuously in bedrooms and primary rooms. If no HEPA purifier is owned: designate one interior room as a low-infiltration sanctuary, keep doors shut, avoid indoor cooking smoke or vacuuming, use damp cloths to trap dust, and maintain central HVAC on recirculate with high-efficiency filters if available.'
    indoorCombustionPrecautions =
      'Zero unnecessary indoor combustion: no open flames, no smoking, avoid unvented stovetop cooking, avoid aerosol sprays or harsh chemical cleaning agents.'
    dustAndCleaningAdvice =
      'Wet-mop floors only. For vulnerable individuals (children, asthmatics, older adults), rest in the interior room away from perimeter windows.'
  }

  const pmDetail = outdoorPm25 ? ` (Outdoor PM2.5: ${outdoorPm25.toFixed(1)} µg/m³)` : ''

  return {
    windowVentilationStrategy: `${windowVentilationStrategy}${humidityNote}`,
    airPurificationGuidance,
    indoorCombustionPrecautions,
    dustAndCleaningAdvice: `${dustAndCleaningAdvice}${pmDetail}`,
    sensorDisclaimer:
      'AIRWISE AI does not possess indoor hardware sensors. All indoor advisories are calculated protective guidelines based on outdoor atmospheric infiltration physics.',
  }
}

// -------------------------------------------------------------
// TOOL 5: compareSustainableAlternatives
// -------------------------------------------------------------
export function compareSustainableAlternatives(input: SustainableAlternativesInput): SustainableAlternativesResult {
  const { baselineModeId, distanceKm, currentAqi } = input

  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 300) {
    throw new Error('Distance must be a valid positive number under 300 km.')
  }
  if (typeof currentAqi !== 'number' || !Number.isFinite(currentAqi) || currentAqi < 0) {
    throw new Error('Current AQI must be a valid non-negative number.')
  }

  const baseline = TRANSPORT_MODES.find((m) => m.id === baselineModeId) ?? TRANSPORT_MODES[0]
  const baseTripKg = (baseline.factor * distanceKm) / 1000

  const alternatives: TransportAlternativeOption[] = TRANSPORT_MODES.filter((m) => m.id !== baseline.id).map((m) => {
    const tripKg = (m.factor * distanceKm) / 1000

    let respiratoryExposureRisk: TransportAlternativeOption['respiratoryExposureRisk'] = 'Low'
    let recommendationNote = ''

    if (m.category === 'active') {
      if (currentAqi <= 50) {
        respiratoryExposureRisk = 'Low'
        recommendationNote = 'Zero emissions and optimal atmospheric conditions for active aerobic travel.'
      } else if (currentAqi <= 100) {
        respiratoryExposureRisk = 'Moderate'
        recommendationNote = 'Zero tailpipe emissions. Choose quiet greenways over congested truck routes.'
      } else if (currentAqi <= 150) {
        respiratoryExposureRisk = 'High'
        recommendationNote =
          'Zero emissions, but elevated breathing rates increase inhaled particulate dose by 300–500%. Exercise caution or switch to metro.'
      } else {
        respiratoryExposureRisk = 'Severe'
        recommendationNote =
          'Not recommended. Inhaling high particulate concentrations during active cycling/walking outweighs short-term emission benefits. Prefer filtered mass transit.'
      }
    } else if (m.category === 'public') {
      respiratoryExposureRisk = currentAqi > 150 ? 'Moderate' : 'Low'
      recommendationNote =
        'Massively cuts per-passenger emissions. Electric rail and modern buses keep you off congested street-level pollution corridors.'
    } else {
      // electric car
      respiratoryExposureRisk = 'Low'
      recommendationNote = 'Cuts direct roadside emissions by ~72% compared to petrol vehicles; utilize cabin HEPA recirculation.'
    }

    return {
      id: m.id,
      name: m.name,
      emissionFactorGPerKm: m.factor,
      category: m.category,
      estimatedTripKgCO2e: Number(tripKg.toFixed(3)),
      respiratoryExposureRisk,
      recommendationNote,
    }
  })

  let advisory = ''
  if (currentAqi > 100) {
    advisory =
      'Due to elevated outdoor AQI, active transport (walking/cycling) carries elevated respiratory exposure. Prioritize electrified public transit (metro, rail, or electric bus) for combined low emissions and respiratory protection.'
  } else {
    advisory =
      'Air quality is currently acceptable. Active micro-mobility (e-bikes, walking, cycling) offers zero-emission transit with personal wellness benefits.'
  }

  return {
    baseline: {
      id: baseline.id,
      name: baseline.name,
      factorGPerKm: baseline.factor,
      tripKgCO2e: Number(baseTripKg.toFixed(3)),
    },
    alternatives,
    advisory,
  }
}

// -------------------------------------------------------------
// TOOL 6: calculateEnvironmentalImpact
// -------------------------------------------------------------
export function calculateEnvironmentalImpact(input: EnvironmentalImpactInput): EnvironmentalImpactResult {
  const { baselineModeId, alternativeModeId, distanceKm, tripsPerWeek } = input

  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 300) {
    throw new Error('Distance must be a valid positive number between 0.1 and 300 km.')
  }
  if (typeof tripsPerWeek !== 'number' || !Number.isFinite(tripsPerWeek) || tripsPerWeek <= 0 || tripsPerWeek > 14) {
    throw new Error('Trips per week must be between 1 and 14 days.')
  }

  const baseMode = TRANSPORT_MODES.find((m) => m.id === baselineModeId) ?? TRANSPORT_MODES[0]
  const altMode = TRANSPORT_MODES.find((m) => m.id === alternativeModeId) ?? TRANSPORT_MODES[3] // default rail

  const singleTripBaseKg = (baseMode.factor * distanceKm) / 1000
  const singleTripAltKg = (altMode.factor * distanceKm) / 1000
  const singleTripSavedKg = Math.max(0, singleTripBaseKg - singleTripAltKg)

  const weeklyKm = distanceKm * tripsPerWeek * 2 // round trips
  const weeklyBaseKg = singleTripBaseKg * tripsPerWeek * 2
  const weeklyAltKg = singleTripAltKg * tripsPerWeek * 2
  const weeklySavedKg = Math.max(0, weeklyBaseKg - weeklyAltKg)

  // 48 working weeks per year approximation
  const annualSavedKg = weeklySavedKg * 48

  const percentReduction =
    singleTripBaseKg > 0 ? Math.round((singleTripSavedKg / singleTripBaseKg) * 100) : 0

  return {
    baselineMode: {
      id: baseMode.id,
      name: baseMode.name,
      factorGCO2ePerKm: baseMode.factor,
    },
    alternativeMode: {
      id: altMode.id,
      name: altMode.name,
      factorGCO2ePerKm: altMode.factor,
    },
    inputs: {
      distanceKm,
      tripsPerWeek,
      weeklyKm,
    },
    calculations: {
      singleTripBaseKgCO2e: Number(singleTripBaseKg.toFixed(3)),
      singleTripAltKgCO2e: Number(singleTripAltKg.toFixed(3)),
      singleTripSavedKgCO2e: Number(singleTripSavedKg.toFixed(3)),
      weeklyBaseKgCO2e: Number(weeklyBaseKg.toFixed(2)),
      weeklyAltKgCO2e: Number(weeklyAltKg.toFixed(2)),
      weeklySavedKgCO2e: Number(weeklySavedKg.toFixed(2)),
      annualSavedKgCO2e: Number(annualSavedKg.toFixed(1)),
      percentReduction,
    },
    directPollutantReductionMechanism:
      'Shifting private combustion trips avoids direct tailpipe emissions of nitric oxides (NOx), unburned hydrocarbons (VOCs), and primary elemental carbon PM2.5 at street-level breathing height.',
    methodologyDisclosure:
      'Emission factors reflect European Environment Agency (EEA) and UK Department for Environment, Food and Rural Affairs (DEFRA) passenger-kilometer standards. Actual real-world savings depend on vehicle engine efficiency, occupancy, and grid power mix.',
  }
}

// -------------------------------------------------------------
// FEATURE 1: Environmental Condition Analysis
// -------------------------------------------------------------

export type EnvironmentalAnalysisInput = {
  currentAqi?: number | null
  pm25?: number | null
  pm10?: number | null
  temperatureC?: number | null
  relativeHumidityPercent?: number | null
  windSpeedKmh?: number | null
  windDirectionDeg?: number | null
  forecast?: Array<{
    hourAhead: number
    time?: string | null
    aqi?: number | null
    pm25?: number | null
    temperatureC?: number | null
    windSpeedKmh?: number | null
  }> | null
}

export type EnvironmentalAnalysisResult = {
  severity: 'Good' | 'Moderate' | 'Unhealthy for Sensitive Groups' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous' | 'Data Unavailable'
  stagnationStatus: 'Stagnant (Trapping Suspected)' | 'Light Airflow (Partial Dispersion)' | 'Active Dispersion (Ventilated)' | 'Weather Telemetry Unavailable'
  forecastTrend: 'Improving' | 'Deteriorating' | 'Stable' | 'Insufficient Forecast Data'
  recommendedAction: string
  bestOutdoorWindow: string
  contributingFactors: string[]
  disclaimer: string
}

export function analyzeEnvironmentalConditions(input: EnvironmentalAnalysisInput): EnvironmentalAnalysisResult {
  const { currentAqi, pm25, pm10, temperatureC, relativeHumidityPercent, windSpeedKmh, forecast } = input

  // 1. Severity categorization
  let severity: EnvironmentalAnalysisResult['severity'] = 'Data Unavailable'
  if (typeof currentAqi === 'number' && Number.isFinite(currentAqi) && currentAqi >= 0) {
    if (currentAqi <= 50) severity = 'Good'
    else if (currentAqi <= 100) severity = 'Moderate'
    else if (currentAqi <= 150) severity = 'Unhealthy for Sensitive Groups'
    else if (currentAqi <= 200) severity = 'Unhealthy'
    else if (currentAqi <= 300) severity = 'Very Unhealthy'
    else severity = 'Hazardous'
  }

  // 2. Wind & Stagnation dynamics
  let stagnationStatus: EnvironmentalAnalysisResult['stagnationStatus'] = 'Weather Telemetry Unavailable'
  const contributingFactors: string[] = []

  if (typeof windSpeedKmh === 'number' && Number.isFinite(windSpeedKmh) && windSpeedKmh >= 0) {
    if (windSpeedKmh < 6) {
      stagnationStatus = 'Stagnant (Trapping Suspected)'
      contributingFactors.push(`Calm surface winds (${windSpeedKmh.toFixed(1)} km/h) restrict horizontal pollutant dispersion`)
      if (typeof temperatureC === 'number' && temperatureC < 14) {
        contributingFactors.push(`Cool surface air (${temperatureC.toFixed(1)}°C) with low wind may inhibit vertical atmospheric mixing`)
      }
      if (typeof relativeHumidityPercent === 'number' && relativeHumidityPercent > 75) {
        contributingFactors.push(`High relative humidity (${relativeHumidityPercent.toFixed(0)}%) promotes particulate moisture uptake and haze formation`)
      }
    } else if (windSpeedKmh <= 15) {
      stagnationStatus = 'Light Airflow (Partial Dispersion)'
      contributingFactors.push(`Moderate breeze (${windSpeedKmh.toFixed(1)} km/h) provides moderate horizontal dilution`)
    } else {
      stagnationStatus = 'Active Dispersion (Ventilated)'
      contributingFactors.push(`Active winds (${windSpeedKmh.toFixed(1)} km/h) assist in clearing local tailpipe emissions`)
    }
  } else {
    contributingFactors.push('Surface wind telemetry not available; relying strictly on particulate concentration')
  }

  if (typeof currentAqi === 'number') {
    contributingFactors.push(`Current AQI: ${currentAqi}${pm25 != null ? ` (PM2.5: ${pm25.toFixed(1)} µg/m³)` : ''}`)
  } else {
    contributingFactors.push('Live AQI telemetry is currently pending or unavailable')
  }

  // 3. Forecast Trend & Best Window calculation
  let forecastTrend: EnvironmentalAnalysisResult['forecastTrend'] = 'Insufficient Forecast Data'
  let bestOutdoorWindow = 'No future forecast hours available to determine outdoor windows.'

  if (forecast && Array.isArray(forecast) && forecast.length > 0) {
    const validFutureAqi = forecast.filter((f) => typeof f.aqi === 'number' && Number.isFinite(f.aqi))
    if (validFutureAqi.length > 0 && typeof currentAqi === 'number') {
      const firstValid = validFutureAqi[0].aqi!
      const lastValid = validFutureAqi[validFutureAqi.length - 1].aqi!
      
      if (lastValid < currentAqi - 15) forecastTrend = 'Improving'
      else if (lastValid > currentAqi + 15) forecastTrend = 'Deteriorating'
      else forecastTrend = 'Stable'

      // Find cleanest hour
      let lowest = validFutureAqi[0]
      validFutureAqi.forEach((f) => {
        if (f.aqi! < lowest.aqi!) lowest = f
      })

      bestOutdoorWindow = `Lowest projected AQI is ~${lowest.aqi} around +${lowest.hourAhead}h${lowest.time ? ` (${lowest.time.split('T')[1] || lowest.time})` : ''}. Plan outdoor essentials then.`
    }
  }

  // 4. Action Recommendation
  let recommendedAction = ''
  if (severity === 'Hazardous' || severity === 'Very Unhealthy') {
    recommendedAction = 'Air quality emergency: suspend all outdoor sports and non-essential travel. Seal windows and run indoor HEPA filtration.'
  } else if (severity === 'Unhealthy') {
    recommendedAction = 'Relocate vigorous workouts indoors. Sensitive individuals and children should strictly avoid prolonged outdoor exertion.'
  } else if (severity === 'Unhealthy for Sensitive Groups') {
    recommendedAction = 'Sensitive groups (children, asthma, seniors) should limit outdoor cardio. Active transit commuters should prefer metro/bus.'
  } else if (severity === 'Moderate') {
    recommendedAction = stagnationStatus.includes('Stagnant')
      ? 'Air is acceptable but low airflow limits dispersion along traffic roads. Exercise in green parks rather than roadside corridors.'
      : 'Acceptable conditions for general outdoor activities. Maintain routine ventilation.'
  } else if (severity === 'Good') {
    recommendedAction = 'Air quality is favorable. Ideal conditions for outdoor recreation, sports, and home airing.'
  } else {
    recommendedAction = 'Check local conditions or search for a nearby city to view environmental recommendations.'
  }

  return {
    severity,
    stagnationStatus,
    forecastTrend,
    recommendedAction,
    bestOutdoorWindow,
    contributingFactors,
    disclaimer: 'Based on surface telemetry and Open-Meteo models. Temperature inversions cannot be confirmed by surface temperature alone.',
  }
}
