import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { EnvironmentalCalculator, TRANSPORT_MODES } from '@/components/environmental-calculator'
import { SmartDailyPlannerTab } from '@/components/tabs/smart-daily-planner-tab'

describe('React Component Rendering & User Guidance State', () => {
  describe('EnvironmentalCalculator Component', () => {
    it('renders the interactive transit comparison options and default calculations', () => {
      const html = renderToString(
        React.createElement(EnvironmentalCalculator, { currentAqi: 75 })
      )

      expect(html).toContain('SUSTAINABLE TRANSIT MODAL COMPARISON')
      expect(html).toContain('Environmental Impact &amp; Carbon Savings Calculator')
      expect(html).toContain('Solo Petrol/Diesel Car')
      expect(html).toContain('Metro / Electric Rail')
      expect(html).toContain('One-Way Distance')
      expect(html).toContain('Weekly Commute Frequency')
      expect(html).toContain('kg CO₂e')
      expect(html).toContain('12') // Default distance 12 km
      expect(html).toContain('Methodology Disclosure')
    })

    it('renders emission factors correctly from verified transport modes', () => {
      expect(TRANSPORT_MODES.find((m) => m.id === 'car-petrol')?.factor).toBe(171)
      expect(TRANSPORT_MODES.find((m) => m.id === 'rail')?.factor).toBe(35)
      expect(TRANSPORT_MODES.find((m) => m.id === 'bus')?.factor).toBe(82)
      expect(TRANSPORT_MODES.find((m) => m.id === 'walking')?.factor).toBe(0)
    })

    it('calculates carbon reduction accurately for baseline vs alternative', () => {
      // 12 km petrol car (171 g/km) -> 2.052 kg; rail (35 g/km) -> 0.42 kg.
      // Savings = ~1.63 kg per trip, ~80% reduction.
      const html = renderToString(
        React.createElement(EnvironmentalCalculator, { currentAqi: 45 })
      )
      expect(html).toContain('2.05')
      expect(html).toContain('0.42')
      expect(html).toContain('Carbon Reduction')
      expect(html).toContain('16.3') // Weekly saved kg
    })
  })

  describe('SmartDailyPlannerTab Component', () => {
    const mockForecast = {
      0: { time: '2026-11-23T12:00', aqi: 145, pm25: 58.0, pm10: 90.0 },
      3: { time: '2026-11-23T15:00', aqi: 85, pm25: 28.0, pm10: 45.0 },
      6: { time: '2026-11-23T18:00', aqi: 120, pm25: 45.0, pm10: 70.0 },
    }

    it('identifies and renders the optimal relative outdoor window from forecast telemetry', () => {
      const html = renderToString(
        React.createElement(SmartDailyPlannerTab, {
          locationName: 'Vijayawada, AP',
          aqi: 145,
          pm25: 58.0,
          pm10: 90.0,
          advice: 'Limit strenuous outdoor exercise during peak pollution.',
          forecastHour: 0,
          forecastData: mockForecast,
          weather: {
            temperatureC: 28,
            relativeHumidityPercent: 70,
            windSpeedKmh: 14.5,
          },
          audience: 'children',
          activity: 'outdoor exercise or play',
        })
      )

      expect(html).toContain('Relative Outdoor Window Recommendation')
      expect(html).toContain('2026-11-23 15:00') // lowest AQI (85)
      expect(html).toContain('85')
      expect(html).toContain('Surface breeze (~14.5 km/h) aids localized mixing')
      expect(html).toContain('Copy Daily Plan')
      expect(html).toContain('Targeted Daily Routines')
    })

    it('displays stagnant wind disclaimer when wind speed is calm (<6 km/h)', () => {
      const html = renderToString(
        React.createElement(SmartDailyPlannerTab, {
          locationName: 'Vijayawada, AP',
          aqi: 145,
          pm25: 58.0,
          pm10: 90.0,
          advice: 'Caution advised.',
          forecastHour: 0,
          forecastData: mockForecast,
          weather: {
            temperatureC: 25,
            relativeHumidityPercent: 80,
            windSpeedKmh: 3.5,
          },
          audience: 'older-adult',
          activity: 'walking or cycling',
        })
      )

      expect(html).toContain('calm (&lt;6 km/h), indicating potential ground-level pollutant stagnation')
    })

    it('tailors routine recommendation copy specifically for sensitive audiences', () => {
      const htmlChildren = renderToString(
        React.createElement(SmartDailyPlannerTab, {
          locationName: 'Test Location',
          aqi: 154,
          pm25: 61.7,
          pm10: 95.0,
          advice: 'High pollution caution.',
          forecastHour: 0,
          audience: 'children',
          activity: 'school and work commute',
        })
      )

      expect(htmlChildren).toContain('Avoid Solo Car Driving')
      expect(htmlChildren).toContain('N95 mask')
    })
  })
})
