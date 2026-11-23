import { describe, it, expect } from 'vitest'
import {
  validateCoordinates,
  generateDailyRoutine,
  getIndoorAirGuidance,
  calculateEnvironmentalImpact,
  compareSustainableAlternatives,
  analyzeEnvironmentalConditions,
  generateDeterministicFallbackGuidance,
  TRANSPORT_MODES,
} from '@/lib/ai-tools'

describe('Domain Tools & Calculations', () => {
  describe('Coordinate Validation', () => {
    it('accepts valid geographic coordinates', () => {
      expect(validateCoordinates(16.5033, 80.6465).valid).toBe(true)
      expect(validateCoordinates(0, 0).valid).toBe(true)
      expect(validateCoordinates(-90, -180).valid).toBe(true)
      expect(validateCoordinates(90, 180).valid).toBe(true)
    })

    it('rejects out of bounds coordinates', () => {
      expect(validateCoordinates(91, 50).valid).toBe(false)
      expect(validateCoordinates(-95, 50).valid).toBe(false)
      expect(validateCoordinates(20, 185).valid).toBe(false)
      expect(validateCoordinates(20, -185).valid).toBe(false)
    })

    it('rejects non-numeric and non-finite values', () => {
      expect(validateCoordinates('16.5' as any, 80).valid).toBe(false)
      expect(validateCoordinates(NaN, 80).valid).toBe(false)
      expect(validateCoordinates(Infinity, 80).valid).toBe(false)
      expect(validateCoordinates(null as any, null as any).valid).toBe(false)
    })
  })

  describe('Daily Routine Generation', () => {
    it('creates appropriate routine for children when AQI is unhealthy (AQI 154)', () => {
      const routine = generateDailyRoutine({
        currentAqi: 154,
        householdProfile: 'children',
        plannedActivity: 'outdoor exercise or play',
      })

      expect(routine.suitability).toBe('Unfavorable / Restrict')
      expect(routine.activityGuidance).toMatch(/cancel|avoid|relocate|indoor/i)
      expect(routine.exposureMitigation).toMatch(/N95|respirator/i)
      expect(routine.rationale).toMatch(/PM2.5|pulmonary|respiratory/i)
      expect(routine.disclaimer).toContain('clinical or medical advice')
    })

    it('creates appropriate routine for elderly when AQI is moderate (AQI 75)', () => {
      const routine = generateDailyRoutine({
        currentAqi: 75,
        householdProfile: 'older-adult',
        plannedActivity: 'walking or cycling',
      })

      expect(routine.suitability).toBe('Moderate / Caution')
      expect(routine.activityGuidance).toMatch(/sensitive|moderate/i)
      expect(routine.exposureMitigation).toMatch(/corridors|quieter/i)
    })

    it('creates favorable routine when AQI is good (AQI 35)', () => {
      const routine = generateDailyRoutine({
        currentAqi: 35,
        householdProfile: 'general',
        plannedActivity: 'running in the park',
      })

      expect(routine.suitability).toBe('Favorable')
      expect(routine.activityGuidance).toMatch(/optimal/i)
      expect(routine.recommendedTiming).toMatch(/any time/i)
    })
  })

  describe('Indoor Air & Ventilation Safety', () => {
    it('SAFETY: Never recommends opening windows when outdoor AQI is Unhealthy (AQI 160)', () => {
      const guidance = getIndoorAirGuidance({
        outdoorAqi: 160,
        outdoorPm25: 65,
      })

      expect(guidance.windowVentilationStrategy).toMatch(/closed/i)
      expect(guidance.windowVentilationStrategy).not.toMatch(/open windows for cross-ventilation/i)
      expect(guidance.airPurificationGuidance).toMatch(/HEPA filtration on high\/turbo/i)
      expect(guidance.sensorDisclaimer).toContain('does not possess indoor hardware sensors')
    })

    it('Provides practical indoor protection for households WITHOUT HEPA purifiers', () => {
      const guidance = getIndoorAirGuidance({
        outdoorAqi: 155,
        outdoorPm25: 60,
      })

      expect(guidance.airPurificationGuidance).toMatch(/If no HEPA purifier is owned/i)
      expect(guidance.airPurificationGuidance).toMatch(/sanctuary/i)
      expect(guidance.airPurificationGuidance).toMatch(/damp/i)
      expect(guidance.dustAndCleaningAdvice).toMatch(/Wet-mop floors only/i)
    })

    it('Allows natural ventilation when outdoor air is Good (AQI 35)', () => {
      const guidance = getIndoorAirGuidance({
        outdoorAqi: 35,
        outdoorPm25: 8.5,
      })

      expect(guidance.windowVentilationStrategy).toMatch(/Open windows for cross-ventilation/i)
      expect(guidance.airPurificationGuidance).toMatch(/natural ventilation currently provides clean air exchange/i)
    })
  })

  describe('Sustainable Transport & CO2e Calculations', () => {
    it('accurately calculates emission savings: 1.632 kg for a single 12 km journey and 3.264 kg for a 24 km daily round trip', () => {
      const impact = calculateEnvironmentalImpact({
        baselineModeId: 'car-petrol',
        alternativeModeId: 'rail',
        distanceKm: 12,
        tripsPerWeek: 5,
      })

      // Inputs: 12 km one-way, 5 days/week.
      // Emission factors: Car = 171 g CO2e/km, Rail = 35 g CO2e/km.
      // Single trip base: 12 * 171 / 1000 = 2.052 kg CO2e
      // Single trip alternative: 12 * 35 / 1000 = 0.420 kg CO2e
      // Single trip saved: 2.052 - 0.420 = 1.632 kg CO2e
      // Daily round trip (24 km) savings: 1.632 * 2 = 3.264 kg CO2e
      // Weekly round-trip savings (5 days, 120 km): 1.632 * 2 * 5 = 16.32 kg CO2e
      // Annual savings (48 working weeks): 16.32 * 48 = 783.36 kg -> 783.4 kg CO2e
      expect(impact.inputs.distanceKm).toBe(12)
      expect(impact.inputs.weeklyKm).toBe(120) // 12 * 5 * 2
      expect(impact.calculations.singleTripBaseKgCO2e).toBe(2.052)
      expect(impact.calculations.singleTripAltKgCO2e).toBe(0.42)
      expect(impact.calculations.singleTripSavedKgCO2e).toBe(1.632)
      // Daily round trip savings derived from single trip savings * 2
      const dailyRoundTripSavingsKg = impact.calculations.singleTripSavedKgCO2e * 2
      expect(dailyRoundTripSavingsKg).toBe(3.264)
      expect(impact.calculations.weeklySavedKgCO2e).toBe(16.32)
      expect(impact.calculations.annualSavedKgCO2e).toBe(783.4)
      expect(impact.calculations.percentReduction).toBe(80)
      expect(impact.directPollutantReductionMechanism).toMatch(/tailpipe emissions of nitric oxides/i)
      expect(impact.methodologyDisclosure).toMatch(/EEA|DEFRA/i)
    })

    it('rejects invalid distance or trips parameters', () => {
      expect(() =>
        calculateEnvironmentalImpact({
          baselineModeId: 'car-petrol',
          alternativeModeId: 'rail',
          distanceKm: -5,
          tripsPerWeek: 5,
        })
      ).toThrowError(/Distance must be a valid positive number/i)

      expect(() =>
        calculateEnvironmentalImpact({
          baselineModeId: 'car-petrol',
          alternativeModeId: 'rail',
          distanceKm: 10,
          tripsPerWeek: 20,
        })
      ).toThrowError(/Trips per week must be between 1 and 14/i)
    })

    it('compares all sustainable transit alternatives cleanly', () => {
      const comparison = compareSustainableAlternatives({
        baselineModeId: 'car-petrol',
        distanceKm: 15,
        currentAqi: 154,
      })

      expect(comparison.baseline.id).toBe('car-petrol')
      expect(comparison.baseline.tripKgCO2e).toBeGreaterThan(2.0)
      expect(comparison.alternatives.length).toBe(TRANSPORT_MODES.length - 1)

      // When AQI is 154, active transport (walking/bicycle) must have High or Severe respiratory risk
      const walking = comparison.alternatives.find((a) => a.id === 'walking')
      expect(walking).toBeDefined()
      expect(walking?.respiratoryExposureRisk).toMatch(/High|Severe/)
      expect(walking?.recommendationNote).toMatch(/elevated breathing rates|Not recommended/i)

      // Rail/Metro should be low or moderate risk
      const rail = comparison.alternatives.find((a) => a.id === 'rail')
      expect(rail?.respiratoryExposureRisk).toBe('Moderate')
    })
  })

  describe('Environmental Conditions Analysis', () => {
    it('analyzes particulate and meteorological telemetry accurately', () => {
      const analysis = analyzeEnvironmentalConditions({
        currentAqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        temperatureC: 28,
        relativeHumidityPercent: 83,
        windSpeedKmh: 4.0,
      })

      expect(analysis.severity).toBe('Unhealthy')
      expect(analysis.stagnationStatus).toBe('Stagnant (Trapping Suspected)')
      expect(analysis.contributingFactors.some((f) => f.includes('Calm surface winds'))).toBe(true)
      expect(analysis.contributingFactors.some((f) => f.includes('relative humidity'))).toBe(true)
      expect(analysis.disclaimer).toMatch(/cannot be confirmed by surface temperature alone/i)
    })

    it('detects active dispersion when wind speeds are elevated', () => {
      const analysis = analyzeEnvironmentalConditions({
        currentAqi: 45,
        windSpeedKmh: 22.0,
      })

      expect(analysis.severity).toBe('Good')
      expect(analysis.stagnationStatus).toBe('Active Dispersion (Ventilated)')
    })
  })

  describe('Family Routine Multi-Persona Synthesis', () => {
    it('generates complete multi-persona family plan via deterministic coach', () => {
      const result = generateDeterministicFallbackGuidance({
        locationName: 'Kesarpalli, Andhra Pradesh',
        currentAqi: 154,
        pm25: 61.7,
        pm10: 95.0,
        readingLabel: 'Current estimate',
        householdProfile: 'general',
        plannedActivity: 'school and work commute',
        userQuery:
          'A family with two children, one elderly member and a parent commuting 12km to work. Current outdoor AQI is 154.',
        weatherContext: {
          temperatureC: 28,
          relativeHumidityPercent: 83,
          windSpeedKmh: 4.0,
        },
      })

      // Must cover all required family aspects
      expect(result).toContain('Children')
      expect(result).toContain('Elderly')
      expect(result).toContain('Parent')
      expect(result).toContain('12')
      expect(result).toMatch(/CO₂e|CO2e/)
      expect(result).toMatch(/indoor|window|ventilation/i)
      expect(result).toContain('Kesarpalli')
    })

    it('clearly distinguishes live monitored AQI from a hypothetical scenario AQI', () => {
      const result = generateDeterministicFallbackGuidance({
        locationName: 'Kesarpalli, Andhra Pradesh',
        currentAqi: 104,
        pm25: 29.3,
        pm10: 31.0,
        readingLabel: 'Current estimate',
        householdProfile: 'general',
        plannedActivity: 'school and work commute',
        userQuery:
          'How should a family with a young child and an elderly person protect themselves when outdoor AQI is 165 and PM2.5 is elevated?',
        weatherContext: {
          temperatureC: 28,
          relativeHumidityPercent: 83,
          windSpeedKmh: 4.0,
        },
      })

      // Must explicitly acknowledge monitored reading 104 and scenario 165
      expect(result).toContain('104')
      expect(result).toContain('165')
      expect(result).toMatch(/monitored.*104|currently shows.*104/i)
      expect(result).toMatch(/hypothetical.*165|recommendations are based on.*165|scenario.*165/i)
      // Must not leak technical provider error messages
      expect(result).not.toContain('Gemini')
      expect(result).not.toContain('Groq')
      expect(result).not.toContain('offline or rate-limited')
      expect(result).toContain('Guidance generated using verified environmental calculations.')
    })
  })
})
