'use client'

import { useMemo, useState } from 'react'
import {
  Bike,
  BusFront,
  Check,
  Clock,
  Compass,
  Copy,
  Info,
  Leaf,
  Sparkles,
  TrendingDown,
  UserCheck,
  Wind,
} from 'lucide-react'

type ForecastItem = {
  time?: string | null
  aqi?: number | null
  pm25?: number | null
  pm10?: number | null
}

type WeatherData = {
  temperatureC?: number | null
  relativeHumidityPercent?: number | null
  windSpeedKmh?: number | null
  windDirectionDeg?: number | null
}

type Props = {
  locationName: string | null
  aqi: number | null
  pm25: number | null
  pm10: number | null
  advice: string
  forecastHour: number
  forecastData?: Record<number, ForecastItem> | null
  weather?: WeatherData | null
  audience: string
  activity: string
}

export function SmartDailyPlannerTab({
  locationName,
  aqi,
  pm25,
  pm10,
  advice,
  forecastHour,
  forecastData,
  weather,
  audience,
  activity,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  // Compute best outdoor window from forecast data, incorporating wind dynamics and temperature
  const bestOutdoorWindow = useMemo(() => {
    if (!forecastData) return null
    const entries = Object.entries(forecastData)
      .map(([hr, item]) => ({ hour: Number(hr), aqi: item?.aqi, time: item?.time }))
      .filter((e) => e.aqi != null)

    if (entries.length === 0) return null
    // find entry with lowest AQI
    let minEntry = entries[0]
    for (const e of entries) {
      if ((e.aqi ?? 999) < (minEntry.aqi ?? 999)) {
        minEntry = e
      }
    }

    const formattedTime = minEntry.time ? minEntry.time.replace('T', ' ') : `+${minEntry.hour}h`
    const isVentilated = weather?.windSpeedKmh != null && weather.windSpeedKmh >= 12
    const isStagnant = weather?.windSpeedKmh != null && weather.windSpeedKmh < 6

    let dispersionNote = 'Atmospheric conditions appear relatively stable.'
    if (isVentilated) {
      dispersionNote = `Surface breeze (~${weather.windSpeedKmh?.toFixed(1)} km/h) aids localized mixing, but does not guarantee complete dispersion.`
    } else if (isStagnant) {
      dispersionNote = `Surface winds are calm (<6 km/h), indicating potential ground-level pollutant stagnation.`
    }

    return {
      hour: minEntry.hour,
      aqi: minEntry.aqi,
      time: formattedTime,
      dispersionNote,
    }
  }, [forecastData, weather])

  // Context-aware dynamic routines based on live AQI and audience
  const routines = useMemo(() => {
    const isClean = aqi !== null && aqi <= 50
    const isModerate = aqi !== null && aqi > 50 && aqi <= 100
    const isPoor = aqi !== null && aqi > 100
    const isVulnerable = audience === 'respiratory' || audience === 'children' || audience === 'older-adult'

    return [
      {
        icon: BusFront,
        title: 'Transit & Commute Strategy',
        badge: isPoor ? 'Avoid Solo Car Driving' : 'Trip Consolidation',
        badgeType: isPoor ? 'alert' : 'info',
        summary: isPoor
          ? 'Air quality is degraded along urban corridors. Solo driving multiplies localized ground-level exhaust.'
          : 'Combining errands or carpooling avoids cold starts and cuts congestion along major transit routes.',
        action: isPoor
          ? isVulnerable
            ? 'Use metro or cabin-filtered transit. Sensitive individuals should wear an N95 mask during roadside transit transfers.'
            : 'Shift to electrified rail or bus. Keeps you off congested corridors where PM2.5 concentrates.'
          : 'Plan errands along a continuous circular loop to minimize total vehicle starts.',
        impact: 'Cuts street-level NOx & direct diesel tailpipe exhaust.',
      },
      {
        icon: Bike,
        title: 'Active Mobility & Workout Window',
        badge: isClean ? 'Ideal for Outdoor Activity' : isModerate ? 'Moderate Intensity' : 'Relocate Indoors',
        badgeType: isClean ? 'success' : isModerate ? 'info' : 'alert',
        summary: isClean
          ? 'Optimal atmospheric dispersal today. Clean conditions encourage active pedestrian and cycling routes.'
          : isModerate
          ? 'Acceptable for most, but choose routes buffered by urban greenery rather than high-density truck corridors.'
          : 'Heavy exertion increases breathing rate by 300–500%, pulling ultrafine PM deep into pulmonary alveoli.',
        action: isClean
          ? 'Replace a short car drive with walking or biking for zero-carbon transit.'
          : isModerate
          ? isVulnerable
            ? 'Reduce strenuous jogging to a gentle walk; avoid exercising directly beside busy roads.'
            : 'Plan cycling along designated residential greenways or quiet backstreets.'
          : 'Relocate runs and workouts to an indoor gym or climate-filtered space.',
        impact: 'Zero-emission transport when clean; preserves lung tissue during peaks.',
      },
      {
        icon: Leaf,
        title: 'Residential Energy & Combustion',
        badge: 'Emission Prevention',
        badgeType: 'info',
        summary:
          'Local heating choices directly modulate neighborhood particulate blankets, especially during cool temperature inversions.',
        action:
          'Never burn open yard waste, wood logs, or idle vehicle engines outside. In peak cold/heat, calibrate thermostats by 1°C (2°F) to ease regional energy grid demand.',
        impact: 'Prevents toxic neighborhood smoke plumes and reduces power plant burn.',
      },
    ]
  }, [aqi, audience])

  return (
    <div className="tab-pane-content">
      {/* Header and Hero Banner */}
      <div className="planner-header-grid">
        <div>
          <div className="kicker">
            <span /> INTELLIGENT ROUTINE PLANNING & ADVICE
          </div>
          <h2 className="planner-title">Plan your day around local air quality</h2>
          <p className="planner-subtitle">
            {locationName ? `Personalized exposure mitigation for ${locationName}` : 'Set or detect your location to personalize your schedule'}
          </p>
        </div>

        <div className="planner-meta-status">
          <span className="forecast-tag-pill">
            <Clock size={13} />
            {forecastHour ? (aqi !== null ? `Horizon · +${forecastHour}h Forecast` : 'Forecast Unavailable') : 'Active Current Estimate'}
          </span>
        </div>
      </div>

      {/* Primary Status Banner */}
      <div className="planner-primary-banner">
        <div className="planner-banner-content">
          <div className="planner-headline-row">
            <span className={`planner-status-bullet ${aqi !== null && aqi > 100 ? 'alert' : aqi !== null && aqi > 50 ? 'warning' : 'good'}`} />
            <h3>
              {aqi === null
                ? 'Check local conditions before outdoor travel'
                : aqi <= 50
                ? 'Favorable conditions for outdoor activity'
                : aqi <= 100
                ? 'Moderate air quality — plan flexibly'
                : 'Elevated pollution — minimize heavy outdoor exertion'}
            </h3>
          </div>
          <p className="planner-advice-text">{advice}</p>
        </div>

        <div className="planner-score-block">
          <span className="score-val">{aqi ?? '—'}</span>
          <span className="score-unit">US AQI</span>
          <small className="score-label">{forecastHour ? `+${forecastHour}h Proj.` : 'Active Est.'}</small>
        </div>
      </div>

      {/* Calculated Best Outdoor Window Callout */}
      {bestOutdoorWindow && (
        <div className="best-window-callout">
          <Sparkles size={16} />
          <div>
            <strong>Relative Outdoor Window Recommendation:</strong> Forecast projections indicate relatively favorable dispersal near <strong>{bestOutdoorWindow.time}</strong> (Projected AQI: {bestOutdoorWindow.aqi}). {bestOutdoorWindow.dispersionNote} <em>Note: Wind activity alone does not guarantee clean air; monitor real-time readings before intense exertion.</em>
          </div>
        </div>
      )}

      {/* Dynamic Routine Cards */}
      <div className="routines-grid-container">
        <div className="section-subheading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={16} />
            <h3>Targeted Daily Routines ({locationName ?? 'Local Area'})</h3>
          </div>
          <button
            type="button"
            className="action-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid var(--border, #e2e8f0)',
              background: copied ? '#10b981' : 'var(--card-bg, #ffffff)',
              color: copied ? '#ffffff' : 'inherit',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            aria-label="Copy Daily Action Plan to clipboard"
            onClick={async () => {
              const planLines = [
                `AIRWISE Daily Environmental Action Plan: ${locationName ?? 'Local Coordinates'}`,
                `Current Monitored AQI: ${aqi ?? 'N/A'} | Guidance: ${advice}`,
                bestOutdoorWindow
                  ? `Best Relative Window: ${bestOutdoorWindow.time} (Est. AQI ${bestOutdoorWindow.aqi}) - ${bestOutdoorWindow.dispersionNote}`
                  : '',
                '',
                'Targeted Daily Routines:',
                ...routines.map(
                  (r) => `- [${r.title}] (${r.badge}): ${r.action} (Impact: ${r.impact})`
                ),
                '',
                '*Disclaimer: Relative recommendations based on environmental algorithms; not medical guarantees.*',
              ]
                .filter(Boolean)
                .join('\n')

              try {
                if (navigator?.clipboard?.writeText) {
                  await navigator.clipboard.writeText(planLines)
                  setCopied(true)
                  setCopyFeedback('Plan copied to clipboard!')
                  setTimeout(() => {
                    setCopied(false)
                    setCopyFeedback(null)
                  }, 3000)
                } else {
                  setCopyFeedback('Clipboard access unavailable')
                }
              } catch {
                setCopyFeedback('Failed to copy to clipboard')
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy Daily Plan'}</span>
          </button>
        </div>

        {copyFeedback && (
          <div
            role="status"
            aria-live="polite"
            style={{
              fontSize: '12px',
              color: copyFeedback.includes('copied') ? '#059669' : '#dc2626',
              marginBottom: '8px',
              fontWeight: 500,
            }}
          >
            {copyFeedback}
          </div>
        )}

        <div className="card-items-list">
          {routines.map(({ icon: Icon, title, badge, badgeType, summary, action, impact }) => (
            <div className="routine-item-styled" key={title}>
              <div className="routine-item-top">
                <div className="routine-item-title-row">
                  <Icon size={16} className="routine-icon" />
                  <strong>{title}</strong>
                </div>
                <span className={`status-pill ${badgeType}`}>{badge}</span>
              </div>
              <p className="routine-desc">{summary}</p>
              <div className="routine-action-callout">
                <strong>Recommended:</strong> {action}
              </div>
              <div className="routine-impact-line">
                <TrendingDown size={12} />
                <span>{impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
