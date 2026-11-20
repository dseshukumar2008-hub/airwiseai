'use client'

import { useMemo } from 'react'
import {
  Bike,
  BusFront,
  Clock,
  Compass,
  Info,
  Leaf,
  Sparkles,
  TrendingDown,
  UserCheck,
} from 'lucide-react'

type ForecastItem = {
  time?: string | null
  aqi?: number | null
  pm25?: number | null
  pm10?: number | null
}

type Props = {
  locationName: string | null
  aqi: number | null
  pm25: number | null
  pm10: number | null
  advice: string
  forecastHour: number
  forecastData?: Record<number, ForecastItem> | null
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
  audience,
  activity,
}: Props) {
  // Compute best outdoor window from forecast data
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
    return {
      hour: minEntry.hour,
      aqi: minEntry.aqi,
      time: formattedTime,
    }
  }, [forecastData])

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
            <strong>Optimal Outdoor Window:</strong> Forecast projections indicate cleaner atmospheric dispersal near <strong>{bestOutdoorWindow.time}</strong> (Estimated AQI: {bestOutdoorWindow.aqi}). Ideal for scheduling outdoor commutes or workouts.
          </div>
        </div>
      )}

      {/* Dynamic Routine Cards */}
      <div className="routines-grid-container">
        <div className="section-subheading">
          <Compass size={16} />
          <h3>Targeted Daily Routines ({locationName ?? 'Local Area'})</h3>
        </div>

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
