'use client'

import { useId, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Bike,
  Bot,
  BusFront,
  CheckCircle2,
  Clock,
  Compass,
  CookingPot,
  Flame,
  Home,
  Info,
  Leaf,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserCheck,
  Wind,
  Zap,
} from 'lucide-react'
import { EnvironmentalCalculator } from './environmental-calculator'

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
  readingLabel: string
  forecast?: Record<number, ForecastItem> | null
}

const audienceOptions = [
  ['general', 'General Household', 'Standard adults without known respiratory sensitivities'],
  ['children', 'Children & School Students', 'Developing lungs; higher air volume per kg body weight'],
  ['older-adult', 'Older Adults (65+)', 'Elevated cardiovascular & pulmonary sensitivity'],
  ['respiratory', 'Asthma / Heart & Lung Conditions', 'Requires minimized exposure to fine particulates'],
  ['outdoor-worker', 'Outdoor Workers & Couriers', 'Prolonged high-ventilation physical exertion'],
]

const activityOptions = [
  ['school and work commute', 'Daily Commute & Travel', 'Morning & evening transit decisions'],
  ['walking or cycling', 'Active Walking & Cycling', 'Pedestrian & micro-mobility routes'],
  ['outdoor exercise or play', 'Outdoor Sports & Exercise', 'High-respiration cardio activities'],
  ['ventilation and indoor air', 'Indoor Air & Home Ventilation', 'Window timing & HEPA air cleaner usage'],
  ['daily errands and household energy', 'Household Energy & Errands', 'Heating, cooking & errand scheduling'],
]

export function AirQualityAssistant({
  locationName,
  aqi,
  pm25,
  pm10,
  readingLabel,
  forecast,
}: Props) {
  const [audience, setAudience] = useState('general')
  const [activity, setActivity] = useState('school and work commute')
  const [plan, setPlan] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [modelBadge, setModelBadge] = useState<string | null>(null)

  const audienceSelectId = useId()
  const activitySelectId = useId()

  // Dynamic Routines based on actual live AQI
  const dynamicRoutines = useMemo(() => {
    const isClean = aqi !== null && aqi <= 50
    const isModerate = aqi !== null && aqi > 50 && aqi <= 100
    const isPoor = aqi !== null && aqi > 100

    return [
      {
        icon: BusFront,
        title: 'Transit & Commuter Planning',
        badge: isPoor ? 'Avoid Solo Car Driving' : 'Trip Consolidation',
        badgeType: isPoor ? 'alert' : 'info',
        summary: isPoor
          ? 'Air quality is degraded along urban arteries. Solo vehicle trips multiply heavy localized roadside exhaust.'
          : 'Combining errands or carpooling avoids cold-start emissions and cuts congestion along major commute routes.',
        action: isPoor
          ? 'Shift to metro/rail or cabin-filtered transit. Keeps you off congested corridors where PM2.5 concentrates.'
          : 'Plan errands along a continuous circular loop to minimize total vehicle starts.',
        impact: 'Cuts street-level NOx & direct diesel tailpipe exhaust.',
      },
      {
        icon: Bike,
        title: 'Active Mobility & Workout Window',
        badge: isClean ? 'Ideal for Active Transit' : isModerate ? 'Moderate Intensity' : 'Relocate Indoors',
        badgeType: isClean ? 'success' : isModerate ? 'info' : 'alert',
        summary: isClean
          ? 'Optimal atmospheric dispersal today. Clean conditions encourage active pedestrian and cycling routes.'
          : isModerate
          ? 'Acceptable for most, but choose routes buffered by urban greenery rather than high-density truck corridors.'
          : 'Heavy exertion increases breathing rate by 300–500%, pulling ultrafine PM deep into pulmonary alveoli.',
        action: isClean
          ? 'Replace a short car drive with walking or biking for zero-carbon transit.'
          : isModerate
          ? 'Plan cycling along designated residential greenways or quiet backstreets.'
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
  }, [aqi])

  // Dynamic Indoor Strategy based on live outdoor conditions
  const dynamicIndoorTips = useMemo(() => {
    const isHighPollution = aqi !== null && aqi > 100
    const isModerate = aqi !== null && aqi > 50 && aqi <= 100

    return [
      {
        icon: Wind,
        title: 'Smart Infiltration & Window Strategy',
        status: isHighPollution ? 'Seal Windows & Openings' : isModerate ? 'Selective Ventilation' : 'Full Natural Ventilation',
        statusType: isHighPollution ? 'alert' : isModerate ? 'warning' : 'success',
        description: isHighPollution
          ? 'Outdoor particulates are elevated. Keep windows, skylights, and outer doors firmly sealed to prevent fine PM2.5 infiltration into living quarters.'
          : isModerate
          ? 'Open windows briefly for 10–15 minutes mid-day when local traffic dips. Avoid ventilating during morning and evening rush hour spikes.'
          : 'Fresh outdoor air is currently cleaner than stagnant indoor air. Open cross-ventilation windows to flush indoor moisture, CO2, and cooking VOCs.',
      },
      {
        icon: ShieldCheck,
        title: 'Mechanical Air Filtration (HEPA)',
        status: 'Continuous Room Filtration',
        statusType: 'info',
        description:
          'Run a verified true HEPA (High-Efficiency Particulate Air) filtration unit in the primary occupied bedroom or living area. Avoid ozone generators or uncertified ionizing cleaners which emit harmful respiratory irritants.',
      },
      {
        icon: CookingPot,
        title: 'Eliminate Indoor Combustion Sources',
        status: 'Source Elimination',
        statusType: 'info',
        description:
          'Indoor frying, searing, and gas burners generate intense ultrafine particulate spikes. Always operate an externally venting range hood, avoid scented candles/incense, and use damp microfiber cloths instead of dry dust sweeping.',
      },
    ]
  }, [aqi])

  // Stream-compatible AI Assistant Request
  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || aqi === null) return

    setLoading(true)
    setError('')
    setPlan('')
    setModelBadge(null)

    try {
      const response = await fetch('/api/air-quality-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationName,
          aqi,
          pm25,
          pm10,
          readingLabel,
          audience,
          activity,
          forecast: forecast ?? null,
          stream: true,
        }),
      })

      const modelHeader = response.headers.get('X-AI-Model')
      if (modelHeader) setModelBadge(modelHeader)

      if (!response.ok) {
        let errMessage = 'The AI assistant is temporarily unavailable.'
        try {
          const errData = await response.json()
          errMessage = errData.error || errMessage
        } catch {
          // ignore parsing error
        }
        throw new Error(errMessage)
      }

      if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          accumulated += chunk
          setPlan(accumulated)
        }
      } else {
        const fallbackData = await response.json()
        setPlan(fallbackData.recommendation || '')
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The AI assistant could not generate guidance. Please refer to the verified checklists below.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="assistant-section-premium" aria-labelledby="assistant-title">
      {/* Premium Hero Header */}
      <div className="assistant-hero">
        <div className="assistant-hero-text">
          <div className="assistant-badge-tag">
            <Sparkles size={13} />
            <span>GENAI ENVIRONMENTAL ENGINE · GOOGLE GEMINI</span>
          </div>
          <h2 id="assistant-title" className="assistant-headline">
            Personalized Urban Air Quality Assistant
          </h2>
          <p className="assistant-hero-desc">
            Transform real-time environmental telemetry into targeted household routines, exposure defense strategies, and emission-reducing transit alternatives.
          </p>
        </div>

        <div className="assistant-telemetry-badge">
          <div className="telemetry-item">
            <span className="telemetry-label">Monitored Area</span>
            <strong className="telemetry-val">{locationName ?? 'Awaiting coordinates'}</strong>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">Active Scale</span>
            <strong className="telemetry-val highlight">{aqi !== null ? `US AQI ${aqi}` : 'Offline'}</strong>
          </div>
        </div>
      </div>

      {/* Assistant Configuration Panel */}
      <div className="assistant-card-config">
        <form className="assistant-config-form" onSubmit={createPlan}>
          <div className="config-inputs-grid">
            <div className="config-field">
              <label htmlFor={audienceSelectId}>
                <UserCheck size={14} /> Household Profile
              </label>
              <select
                id={audienceSelectId}
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
              >
                {audienceOptions.map(([value, label, desc]) => (
                  <option key={value} value={value}>
                    {label} — {desc}
                  </option>
                ))}
              </select>
            </div>

            <div className="config-field">
              <label htmlFor={activitySelectId}>
                <Compass size={14} /> Target Daily Activity
              </label>
              <select
                id={activitySelectId}
                value={activity}
                onChange={(event) => setActivity(event.target.value)}
              >
                {activityOptions.map(([value, label, desc]) => (
                  <option key={value} value={value}>
                    {label} — {desc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="config-action-row">
            <p className="assistant-privacy-disclaimer">
              <Info size={13} />
              Sends selected household category, activity, and local AQI to Google Gemini for synthesis. Never stores user identity or coordinates.
            </p>

            <button
              type="submit"
              className="btn-gemini-generate"
              disabled={loading || aqi === null}
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Synthesizing Plan…
                </>
              ) : (
                <>
                  <Zap size={16} /> Generate Gemini Plan <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {aqi === null && (
        <div className="assistant-notice-banner" role="status">
          <Info size={16} />
          <span>Select or detect a location on the map above to enable live Gemini AI guidance.</span>
        </div>
      )}

      {error && (
        <div className="assistant-error-banner" role="alert">
          <ShieldAlert size={20} />
          <div>
            <strong>Intelligence Engine Notice:</strong> {error}
            <div className="error-subtext">
              The dynamic routines, indoor infiltration guides, and environmental emission calculator below are fully operational.
            </div>
          </div>
        </div>
      )}

      {/* Streamed or Completed AI Response Card */}
      {(plan || loading) && (
        <div className="assistant-ai-result-panel" role="status" aria-live="polite">
          <div className="ai-result-header">
            <div className="ai-result-title">
              <Bot size={20} />
              <div>
                <h3>AI Environmental Action Plan</h3>
                <span>Tailored for {locationName ?? 'the selected locality'}</span>
              </div>
            </div>
            {modelBadge && (
              <span className="ai-model-tag">
                <Sparkles size={11} /> {modelBadge}
              </span>
            )}
          </div>

          <div className="ai-result-body">
            {plan || (
              <div className="ai-loading-state">
                <RefreshCw size={18} className="animate-spin" />
                <span>Analyzing current particulate concentration, forecast curves, and household vulnerability…</span>
              </div>
            )}
          </div>

          <div className="ai-result-footer">
            <ShieldCheck size={14} />
            <span>
              Generated using Google Gemini grounded in verified meteorological readings. Provides environmental recommendations only; does not replace clinician or medical advice.
            </span>
          </div>
        </div>
      )}

      {/* Two Balanced Recommendation Panels */}
      <div className="recommendations-twin-grid">
        {/* Panel 1: Dynamic Low-Emission Daily Routines */}
        <article className="recommendation-card-premium">
          <div className="card-header-styled">
            <div className="header-icon-box green">
              <Leaf size={18} />
            </div>
            <div>
              <h3>Dynamic Low-Emission Routines</h3>
              <p>Real-time adaptations based on current AQI ({aqi !== null ? `AQI ${aqi}` : 'Awaiting data'})</p>
            </div>
          </div>

          <div className="card-items-list">
            {dynamicRoutines.map(({ icon: Icon, title, badge, badgeType, summary, action, impact }) => (
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
        </article>

        {/* Panel 2: Indoor Air Quality & Infiltration Defense */}
        <article className="recommendation-card-premium">
          <div className="card-header-styled">
            <div className="header-icon-box blue">
              <Home size={18} />
            </div>
            <div>
              <h3>Indoor Air Quality & Infiltration Defense</h3>
              <p>Practical non-sensor protective protocols for residential and indoor spaces</p>
            </div>
          </div>

          <div className="card-items-list">
            {dynamicIndoorTips.map(({ icon: Icon, title, status, statusType, description }) => (
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

          <div className="card-bottom-disclaimer">
            <Info size={14} />
            <span>
              <strong>Sensor Disclaimer:</strong> AIRWISE AI does not connect to indoor hardware sensors. All indoor advisories are calculated protective guidelines based on outdoor infiltration principles.
            </span>
          </div>
        </article>
      </div>

      {/* Environmental Impact & Emission Calculator */}
      <EnvironmentalCalculator currentAqi={aqi} />

      {/* Health Safety Guidelines Grid */}
      <article className="safety-standards-card">
        <div className="safety-card-header">
          <ShieldCheck size={18} />
          <div>
            <h3>EPA Air Quality Index (AQI) Health Thresholds</h3>
            <p>Regulatory guidance thresholds for outdoor exposure and sensitive demographics</p>
          </div>
        </div>

        <div className="safety-bands-grid">
          <div className="band-box good">
            <div className="band-header">
              <span className="dot" />
              <strong>0–50 · Good</strong>
            </div>
            <p>Air quality is satisfactory and poses little or no risk. Safe for all outdoor activities and open-window home airing.</p>
          </div>

          <div className="band-box moderate">
            <div className="band-header">
              <span className="dot" />
              <strong>51–100 · Moderate</strong>
            </div>
            <p>Air quality is acceptable. Exceptionally sensitive individuals should monitor unusual respiratory symptoms during heavy exertion.</p>
          </div>

          <div className="band-box sensitive">
            <div className="band-header">
              <span className="dot" />
              <strong>101–150 · Sensitive Groups</strong>
            </div>
            <p>Children, older adults, and individuals with respiratory conditions (e.g. asthma) should limit prolonged outdoor exertion.</p>
          </div>

          <div className="band-box unhealthy">
            <div className="band-header">
              <span className="dot" />
              <strong>151+ · Unhealthy</strong>
            </div>
            <p>Everyone may experience health effects. Keep home windows sealed, operate HEPA filtration, and reschedule outdoor sports indoors.</p>
          </div>
        </div>

        <div className="medical-legal-footer">
          <Info size={13} />
          <span>
            <strong>Health Advisory Notice:</strong> Information provided by AIRWISE AI represents environmental intelligence screening and does not constitute clinical diagnostic medical advice. Consult medical professionals for clinical management.
          </span>
        </div>
      </article>
    </section>
  )
}
