'use client'

import { useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  Compass,
  Home,
  Scale,
  Sparkles,
  Wind,
  ShieldCheck,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { SmartDailyPlannerTab } from './tabs/smart-daily-planner-tab'
import { IndoorGuardianTab } from './tabs/indoor-guardian-tab'
import { EcoChoicesTab } from './tabs/eco-choices-tab'
import { ForecastAnalytics } from './forecast-analytics'
import { EnvironmentalCalculator } from './environmental-calculator'
import { analyzeEnvironmentalConditions } from '@/lib/ai-tools'

type ForecastReading = { aqi: number | null; pm25: number | null; pm10: number | null; time?: string | null }
type AirQuality = {
  aqi: number
  category?: string
  source: string
  dominantPollutant?: string | null
  pm25?: number | null
  pm10?: number | null
  updatedAt?: string | null
  timezone?: string | null
  forecast?: Record<number, ForecastReading> | null
}

type WeatherData = {
  temperatureC?: number | null
  relativeHumidityPercent?: number | null
  windSpeedKmh?: number | null
  windDirectionDeg?: number | null
}

type Props = {
  locationName: string | null
  latitude?: number | null
  longitude?: number | null
  airQuality: AirQuality | null
  selectedReading?: { aqi?: number | null; pm25?: number | null; pm10?: number | null } | null
  weather?: WeatherData | null
  forecastHour: number
  onSelectForecastHour: (hour: number) => void
  readingLabel: string
  advice: string
  audience: string
  setAudience: (val: string) => void
  activity: string
  setActivity: (val: string) => void
}

export type TabKey =
  | 'planner'
  | 'indoor'
  | 'eco'
  | 'forecast'
  | 'impact'

export function BelowMapWorkspace({
  locationName,
  latitude,
  longitude,
  airQuality,
  selectedReading,
  weather,
  forecastHour,
  onSelectForecastHour,
  readingLabel,
  advice,
  audience,
  setAudience,
  activity,
  setActivity,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('planner')

  const aqi = selectedReading?.aqi ?? airQuality?.aqi ?? null
  const pm25 = selectedReading?.pm25 ?? airQuality?.pm25 ?? null
  const pm10 = selectedReading?.pm10 ?? airQuality?.pm10 ?? null

  // Deterministic Pollution Intelligence Calculation
  const forecastList = airQuality?.forecast
    ? Object.entries(airQuality.forecast).map(([hr, item]) => ({
        hourAhead: Number(hr),
        time: item.time ?? null,
        aqi: item.aqi ?? null,
        pm25: item.pm25 ?? null,
      }))
    : null

  const intelligence = analyzeEnvironmentalConditions({
    currentAqi: aqi,
    pm25,
    pm10,
    temperatureC: weather?.temperatureC,
    relativeHumidityPercent: weather?.relativeHumidityPercent,
    windSpeedKmh: weather?.windSpeedKmh,
    windDirectionDeg: weather?.windDirectionDeg,
    forecast: forecastList,
  })

  const tabs: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
    { key: 'planner', label: '1. Smart Daily Planner', icon: CalendarDays },
    { key: 'indoor', label: '2. Indoor Guardian', icon: Home },
    { key: 'eco', label: '3. Eco Choices', icon: Compass },
    { key: 'forecast', label: '4. Forecast & Analytics', icon: BarChart3 },
    { key: 'impact', label: '5. Environmental Impact', icon: Scale },
  ]

  return (
    <section className="below-map-workspace" aria-label="Air quality workspace and recommendations">
      {/* FEATURE 4: COMPACT POLLUTION INTELLIGENCE DASHBOARD SECTION */}
      <section className="pollution-intelligence-card" aria-label="Pollution Intelligence Overview">
        <div className="intelligence-card-header">
          <div className="intelligence-tag">
            <Sparkles size={13} />
            <span>DETERMINISTIC POLLUTION INTELLIGENCE</span>
          </div>
          <h3 className="intelligence-title">Environmental Condition Analysis & Trapping Risks</h3>
          <p className="intelligence-subtitle">
            Cross-referencing fine particulate concentrations with surface wind dynamics to identify atmospheric stagnation and safer activity windows.
          </p>
        </div>

        <div className="intelligence-metrics-grid">
          <div className="intelligence-metric-box">
            <span className="metric-tag">Severity Classification</span>
            <strong className={`metric-val ${intelligence.severity.toLowerCase().replace(/\s+/g, '-')}`}>
              {intelligence.severity}
            </strong>
            <small>Measured US AQI: {aqi ?? '—'}</small>
          </div>

          <div className="intelligence-metric-box">
            <span className="metric-tag">Surface Airflow & Dispersion</span>
            <strong className="metric-val">
              {intelligence.stagnationStatus}
            </strong>
            <small>
              {weather?.windSpeedKmh != null ? `${weather.windSpeedKmh.toFixed(1)} km/h wind` : 'Wind speed pending'}
            </small>
          </div>

          <div className="intelligence-metric-box">
            <span className="metric-tag">24-Hour Forecast Trend</span>
            <strong className="metric-val">
              {intelligence.forecastTrend}
            </strong>
            <small>{intelligence.bestOutdoorWindow}</small>
          </div>
        </div>

        <div className="intelligence-action-box">
          <div className="action-tag">
            <ShieldCheck size={15} />
            <strong>Recommended Immediate Action:</strong>
          </div>
          <p className="action-text">{intelligence.recommendedAction}</p>
          <div className="contributing-factors-list">
            {intelligence.contributingFactors.map((f, i) => (
              <span key={i} className="factor-pill">
                <Wind size={11} /> {f}
              </span>
            ))}
          </div>
        </div>

        <div className="intelligence-disclaimer">
          <small>{intelligence.disclaimer}</small>
        </div>
      </section>

      {/* 2. SPECIALIZED REFERENCE TABS NAVIGATION BAR */}
      <div className="workspace-tabs-section-header">
        <div className="kicker"><span></span> SPECIALIZED ENVIRONMENTAL TOOLS & PROTOCOLS</div>
        <h3 className="section-title">Explore Domain Guidance & Analytics</h3>
      </div>

      <nav className="workspace-tab-nav" role="tablist" aria-label="Airwise workspace tabs">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${key}`}
              id={`tab-${key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(key)}
              className={`workspace-tab-btn ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      {/* 3. ACTIVE SPECIALIZED TAB CONTENT PANEL */}
      <div
        className="workspace-tab-panel"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'planner' && (
          <SmartDailyPlannerTab
            locationName={locationName}
            aqi={aqi}
            pm25={pm25}
            pm10={pm10}
            advice={advice}
            forecastHour={forecastHour}
            forecastData={airQuality?.forecast ?? null}
            audience={audience}
            activity={activity}
          />
        )}

        {activeTab === 'indoor' && (
          <IndoorGuardianTab
            aqi={aqi}
            pm25={pm25}
            forecastData={airQuality?.forecast ?? null}
          />
        )}

        {activeTab === 'eco' && (
          <EcoChoicesTab
            currentAqi={aqi}
            audience={audience}
            activity={activity}
          />
        )}

        {activeTab === 'forecast' && (
          <ForecastAnalytics
            current={
              airQuality
                ? {
                    aqi: airQuality.aqi,
                    pm25: airQuality.pm25 ?? null,
                    pm10: airQuality.pm10 ?? null,
                    time: airQuality.updatedAt,
                  }
                : null
            }
            forecast={airQuality?.forecast ?? null}
            selectedHour={forecastHour}
            onSelectHour={onSelectForecastHour}
            source={
              airQuality?.source === 'google-air-quality-api'
                ? 'Google current API + Open-Meteo forecast'
                : airQuality?.source === 'open-meteo-air-quality-api'
                ? 'Open-Meteo'
                : 'API data pending'
            }
            timezone={airQuality?.timezone ?? null}
          />
        )}

        {activeTab === 'impact' && (
          <EnvironmentalCalculator currentAqi={aqi} />
        )}
      </div>
    </section>
  )
}
