'use client'

import { useState } from 'react'
import { Activity, BarChart3, Clock, Info } from 'lucide-react'

type Reading = { aqi: number | null; pm25: number | null; pm10: number | null; time?: string | null }
type Props = {
  current: Reading | null
  forecast: Record<number, Reading> | null
  selectedHour: number
  onSelectHour: (hour: number) => void
  source: string
  timezone: string | null
}

const horizons = [0, 3, 6, 12, 24]
const metrics = [
  { key: 'aqi', label: 'US AQI', unit: 'index', ceiling: 300, desc: 'Overall Air Quality Index' },
  { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', ceiling: 150, desc: 'Fine inhalable particles (≤2.5 µm)' },
  { key: 'pm10', label: 'PM10', unit: 'µg/m³', ceiling: 250, desc: 'Coarse dust & pollen (≤10 µm)' },
] as const

function localTime(value?: string | null) {
  if (!value) return 'Time unavailable'
  // Return format e.g. "03:00 (Today)" or similar clean format
  const parts = value.split('T')
  if (parts.length === 2) {
    return `${parts[1]} · ${parts[0].slice(5)}`
  }
  return value.replace('T', ' ')
}

export function ForecastAnalytics({ current, forecast, selectedHour, onSelectHour, source, timezone }: Props) {
  const [metricKey, setMetricKey] = useState<(typeof metrics)[number]['key']>('aqi')
  const metric = metrics.find((item) => item.key === metricKey)!
  const points = horizons.map((hour) => ({
    hour,
    reading: hour === 0 ? current : forecast?.[hour] ?? null,
  }))
  const hasData = points.some(({ reading }) => reading?.[metricKey] != null)
  const visualMax = Math.max(metric.ceiling * 0.25, ...points.map(({ reading }) => reading?.[metricKey] ?? 0))

  return (
    <section className="forecast-card" aria-labelledby="forecast-title">
      <div className="forecast-header-premium">
        <div>
          <div className="kicker">
            <span /> FORECAST INTELLIGENCE & HOURLY PROJECTIONS
          </div>
          <h2 id="forecast-title" className="forecast-title-text">
            Air quality outlook & trajectory
          </h2>
          <p className="forecast-subtitle">
            Hourly simulation horizon from {source} · Select a time horizon to sync the dashboard and map.
          </p>
        </div>
        <div className="forecast-meta-pill">
          <Clock size={14} />
          <span>{timezone ? `Timezone: ${timezone}` : 'Provider Local Time'}</span>
        </div>
      </div>

      {/* Metric Selector Bar */}
      <div className="forecast-toolbar">
        <div className="metric-switch-premium" role="group" aria-label="Forecast pollutant metric">
          {metrics.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMetricKey(item.key)}
              className={metricKey === item.key ? 'active' : ''}
              aria-pressed={metricKey === item.key}
            >
              <strong>{item.label}</strong>
              <small>{item.unit}</small>
            </button>
          ))}
        </div>
        <div className="metric-caption-text">
          <Info size={13} />
          <span>{metric.desc}</span>
        </div>
      </div>

      {!hasData ? (
        <div className="forecast-empty-state" role="status">
          <BarChart3 size={32} />
          <h3>No Forecast Projection Available</h3>
          <p>
            {current
              ? `No ${metric.label} readings returned for the forecast time horizon.`
              : 'Select or detect a location above to load hourly air quality forecasts and model trajectory.'}
          </p>
        </div>
      ) : (
        <>
          <div className="forecast-chart-container">
            <div className="forecast-chart-grid" role="group" aria-label={`${metric.label} forecast values`}>
              {points.map(({ hour, reading }) => {
                const value = reading?.[metricKey]
                const height = value == null ? 6 : Math.max(8, Math.min(100, (value / visualMax) * 100))
                const label = hour === 0 ? 'Current' : `+${hour} hrs`
                const selected = selectedHour === hour

                // Dynamic color based on value
                const barColor =
                  metricKey === 'aqi'
                    ? value == null
                      ? '#cbd5e1'
                      : value <= 50
                      ? 'linear-gradient(180deg, #60a5fa, #34d399)'
                      : value <= 100
                      ? 'linear-gradient(180deg, #fbbf24, #f59e0b)'
                      : value <= 150
                      ? 'linear-gradient(180deg, #fb923c, #f97316)'
                      : 'linear-gradient(180deg, #f87171, #ef4444)'
                    : 'linear-gradient(180deg, #38bdf8, #2563eb)'

                return (
                  <button
                    className={`forecast-card-point ${selected ? 'is-selected' : ''}`}
                    key={hour}
                    type="button"
                    onClick={() => onSelectHour(hour)}
                    aria-pressed={selected}
                    aria-label={`${label}: ${value == null ? 'Unavailable' : `${metric.label} ${value.toFixed(metricKey === 'aqi' ? 0 : 1)}`} at ${localTime(reading?.time)}`}
                  >
                    <div className="point-header">
                      <span className="point-tag">{label}</span>
                      {selected && <span className="point-active-indicator">Active</span>}
                    </div>

                    <div className="point-numeric">
                      <strong>{value == null ? '—' : value.toFixed(metricKey === 'aqi' ? 0 : 1)}</strong>
                      <span>{metric.unit}</span>
                    </div>

                    <div className="point-track">
                      <div className="point-bar-fill" style={{ height: `${height}%`, background: barColor }} />
                    </div>

                    <div className="point-footer">
                      <Clock size={11} />
                      <small>{localTime(reading?.time)}</small>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="forecast-footer-notes">
            <div className="forecast-footnote-item">
              <Activity size={14} />
              <span>
                <strong>{metric.label} Scale:</strong>{' '}
                {metricKey === 'aqi'
                  ? 'Calculated under standard US Environmental Protection Agency (EPA) AQI thresholds.'
                  : `Reported in mass concentration per volume (${metric.unit}).`}
              </span>
            </div>
            <div className="forecast-footnote-item">
              <Info size={14} />
              <span>
                Forecasts are model projections (Open-Meteo European/GFS ensemble) subject to atmospheric shifts. Click any pillar to sync map conditions.
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
