'use client'

import { useMemo } from 'react'
import {
  CookingPot,
  Flame,
  Home,
  Info,
  ShieldCheck,
  Sparkles,
  Wind,
  Wrench,
} from 'lucide-react'

type ForecastItem = {
  time?: string | null
  aqi?: number | null
  pm25?: number | null
  pm10?: number | null
}

type Props = {
  aqi: number | null
  pm25: number | null
  forecastData?: Record<number, ForecastItem> | null
}

export function IndoorGuardianTab({ aqi, pm25, forecastData }: Props) {
  // Compute best ventilation hour from forecast
  const bestVentilationWindow = useMemo(() => {
    if (!forecastData) return null
    const entries = Object.entries(forecastData)
      .map(([hr, item]) => ({ hour: Number(hr), pm25: item?.pm25, time: item?.time }))
      .filter((e) => e.pm25 != null)

    if (entries.length === 0) return null
    let minEntry = entries[0]
    for (const e of entries) {
      if ((e.pm25 ?? 999) < (minEntry.pm25 ?? 999)) {
        minEntry = e
      }
    }

    const formattedTime = minEntry.time ? minEntry.time.replace('T', ' ') : `+${minEntry.hour}h`
    return {
      hour: minEntry.hour,
      pm25: minEntry.pm25,
      time: formattedTime,
    }
  }, [forecastData])

  const isHighPollution = aqi !== null && aqi > 100
  const isModerate = aqi !== null && aqi > 50 && aqi <= 100

  const tips = useMemo(() => {
    return [
      {
        icon: Wind,
        title: 'Smart Window Ventilation Protocol',
        status: isHighPollution ? 'Keep Windows Closed' : isModerate ? 'Selective Ventilation' : 'Natural Cross-Ventilation',
        statusType: isHighPollution ? 'alert' : isModerate ? 'warning' : 'success',
        description: isHighPollution
          ? 'Outdoor particulates are elevated. Keep windows, skylights, and balcony doors tightly closed to block particulate infiltration into living and sleeping areas.'
          : isModerate
          ? 'Open windows briefly for 10–15 minutes mid-day when traffic volume dips. Avoid airing out during morning and evening rush hours.'
          : 'Outdoor air is cleaner than stagnant indoor air. Open cross-ventilation windows to flush indoor carbon dioxide, humidity, and volatile chemicals.',
      },
      {
        icon: ShieldCheck,
        title: 'Mechanical Air Filtration (HEPA)',
        status: 'Active Air Cleaning',
        statusType: 'info',
        description:
          'Operate a true HEPA (High-Efficiency Particulate Air) filtration unit in primary occupied bedrooms or living spaces. Ensure air cleaner intake is unobstructed and avoid ozone-emitting units.',
      },
      {
        icon: CookingPot,
        title: 'Kitchen & Combustion Safety',
        status: 'Source Elimination',
        statusType: 'info',
        description:
          'Always use an externally vented exhaust hood while cooking, searing, or boiling. Eliminate indoor candles, incense, and smoking. Damp-mop floors with microfiber cloths instead of dry dust sweeping.',
      },
      {
        icon: Wrench,
        title: 'HVAC & Filter Maintenance',
        status: 'Quarterly Check',
        statusType: 'info',
        description:
          'Upgrade residential central HVAC filters to MERV 13 or higher if system fan specs permit. Inspect weatherstripping around exterior door thresholds to prevent infiltration drafts.',
      },
    ]
  }, [isHighPollution, isModerate])

  return (
    <div className="tab-pane-content">
      {/* Header */}
      <div className="planner-header-grid">
        <div>
          <div className="kicker">
            <span /> RESIDENTIAL AIR QUALITY & INFILTRATION DEFENSE
          </div>
          <h2 className="planner-title">Indoor Guardian & Home Air Defense</h2>
          <p className="planner-subtitle">
            Scientific, practical strategies to minimize outdoor particulate penetration and reduce indoor combustion hazards.
          </p>
        </div>
      </div>

      {/* Best Ventilation Window Banner */}
      {bestVentilationWindow && (
        <div className="best-window-callout">
          <Sparkles size={16} />
          <div>
            <strong>Recommended Window Airing Window:</strong> The cleanest forecast outdoor window occurs around <strong>{bestVentilationWindow.time}</strong> (Projected PM2.5: {bestVentilationWindow.pm25?.toFixed(1)} µg/m³). Ventilate briefly at this time.
          </div>
        </div>
      )}

      {/* Protective Strategies List */}
      <div className="card-items-list" style={{ marginTop: 14 }}>
        {tips.map(({ icon: Icon, title, status, statusType, description }) => (
          <div className="routine-item-styled" key={title}>
            <div className="routine-item-top">
              <div className="routine-item-title-row">
                <Icon size={16} className="routine-icon" />
                <strong>{title}</strong>
              </div>
              <span className={`status-pill ${statusType}`}>{status}</span>
            </div>
            <p className="routine-desc">{description}</p>
          </div>
        ))}
      </div>

      {/* Sensor Transparency Card */}
      <div className="card-bottom-disclaimer" style={{ marginTop: 16 }}>
        <Info size={16} />
        <div>
          <strong>Sensor Data Transparency:</strong> AIRWISE AI monitors outdoor meteorological and satellite telemetry and does not possess indoor hardware sensors. All indoor advisories are calculated protective guidelines based on outdoor infiltration principles and EPA/WHO indoor environmental standards.
        </div>
      </div>
    </div>
  )
}
