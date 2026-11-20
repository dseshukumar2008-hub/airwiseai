'use client'

import { useId, useMemo, useState } from 'react'
import {
  Bike,
  Bus,
  Car,
  Footprints,
  Info,
  Leaf,
  Scale,
  Sparkles,
  Train,
  TrendingDown,
  Zap,
} from 'lucide-react'

// Emission factors based on European Environment Agency (EEA) and UK DEFRA transport conversion averages
// Measured in grams of CO2 equivalent per passenger-kilometer (g CO2e / pass-km)
export const TRANSPORT_MODES = [
  {
    id: 'car-petrol',
    name: 'Solo Petrol/Diesel Car',
    factor: 171,
    category: 'private',
    icon: Car,
    description: 'Average combustion vehicle with single occupant.',
  },
  {
    id: 'car-ev',
    name: 'Electric Car (EV)',
    factor: 48,
    category: 'private',
    icon: Zap,
    description: 'Battery electric vehicle running on average power grid.',
  },
  {
    id: 'bus',
    name: 'City Bus / Transit',
    factor: 82,
    category: 'public',
    icon: Bus,
    description: 'Municipal transit bus with typical passenger load.',
  },
  {
    id: 'rail',
    name: 'Metro / Electric Rail',
    factor: 35,
    category: 'public',
    icon: Train,
    description: 'Electric commuter rail or underground subway.',
  },
  {
    id: 'ebike',
    name: 'E-Bike / Micro-Mobility',
    factor: 12,
    category: 'active',
    icon: Bike,
    description: 'Light electric battery-assisted mobility.',
  },
  {
    id: 'walking',
    name: 'Walking / Bicycle',
    factor: 0,
    category: 'active',
    icon: Footprints,
    description: 'Human-powered active transport with zero tailpipe emissions.',
  },
] as const

type Props = {
  currentAqi: number | null
}

export function EnvironmentalCalculator({ currentAqi }: Props) {
  const [distanceKm, setDistanceKm] = useState<number>(12)
  const [baseModeId, setBaseModeId] = useState<string>('car-petrol')
  const [altModeId, setAltModeId] = useState<string>('rail')
  const [tripsPerWeek, setTripsPerWeek] = useState<number>(5)

  const distanceInputId = useId()
  const baseModeSelectId = useId()
  const altModeSelectId = useId()
  const tripsSelectId = useId()

  const baseMode = TRANSPORT_MODES.find((m) => m.id === baseModeId) ?? TRANSPORT_MODES[0]
  const altMode = TRANSPORT_MODES.find((m) => m.id === altModeId) ?? TRANSPORT_MODES[3]

  const calculation = useMemo(() => {
    const singleTripBaseKg = (baseMode.factor * distanceKm) / 1000
    const singleTripAltKg = (altMode.factor * distanceKm) / 1000
    const singleTripSavedKg = Math.max(0, singleTripBaseKg - singleTripAltKg)

    const weeklyBaseKg = singleTripBaseKg * tripsPerWeek * 2 // round trip
    const weeklyAltKg = singleTripAltKg * tripsPerWeek * 2
    const weeklySavedKg = Math.max(0, weeklyBaseKg - weeklyAltKg)

    const percentReduction =
      singleTripBaseKg > 0 ? Math.round((singleTripSavedKg / singleTripBaseKg) * 100) : 0

    return {
      singleTripBaseKg,
      singleTripAltKg,
      singleTripSavedKg,
      weeklyBaseKg,
      weeklyAltKg,
      weeklySavedKg,
      percentReduction,
    }
  }, [baseMode, altMode, distanceKm, tripsPerWeek])

  const aqiCaution = currentAqi !== null && currentAqi > 100 && (altMode.id === 'walking' || altMode.id === 'ebike')

  return (
    <article className="calculator-section-premium">
      <div className="calculator-header">
        <div className="calculator-header-icon">
          <Scale size={20} />
        </div>
        <div>
          <div className="kicker">
            <span /> SUSTAINABLE TRANSIT MODAL COMPARISON
          </div>
          <h3 className="calculator-title">Environmental Impact & Carbon Savings Calculator</h3>
          <p className="calculator-subtitle">
            Quantify the atmospheric emission reduction of shifting daily commutes to lower-emission transit options.
          </p>
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div className="calculator-controls-grid">
        <div className="calc-field">
          <label htmlFor={baseModeSelectId}>Baseline Commute Mode</label>
          <select
            id={baseModeSelectId}
            value={baseModeId}
            onChange={(e) => setBaseModeId(e.target.value)}
          >
            {TRANSPORT_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.factor} g CO₂e/km)
              </option>
            ))}
          </select>
        </div>

        <div className="calc-field">
          <label htmlFor={altModeSelectId}>Sustainable Alternative</label>
          <select
            id={altModeSelectId}
            value={altModeId}
            onChange={(e) => setAltModeId(e.target.value)}
          >
            {TRANSPORT_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.factor} g CO₂e/km)
              </option>
            ))}
          </select>
        </div>

        <div className="calc-field">
          <label htmlFor={distanceInputId}>
            One-Way Distance: <strong>{distanceKm} km</strong>
          </label>
          <input
            id={distanceInputId}
            type="range"
            min={1}
            max={75}
            step={1}
            value={distanceKm}
            onChange={(e) => setDistanceKm(Number(e.target.value))}
            className="calc-range-slider"
          />
        </div>

        <div className="calc-field">
          <label htmlFor={tripsSelectId}>Weekly Commute Frequency</label>
          <select
            id={tripsSelectId}
            value={tripsPerWeek}
            onChange={(e) => setTripsPerWeek(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {d} days / week (round trips)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Air Quality Active Commute Caution */}
      {aqiCaution && (
        <div className="calc-caution-banner">
          <Info size={16} />
          <div>
            <strong>Air Quality Advisory:</strong> Outdoor US AQI is currently elevated ({currentAqi}). While walking or cycling generates zero direct emissions, vigorous active transit increases inhalation rates of PM2.5 by up to 5x. On high-pollution days, prioritize electrified public transit (metro, electric bus) over active roadside cycling.
          </div>
        </div>
      )}

      {/* Calculated Results Cards */}
      <div className="calculator-results-grid">
        <div className="calc-result-box baseline">
          <span className="box-tag">Current Baseline Footprint</span>
          <div className="box-val">
            <strong>{calculation.singleTripBaseKg.toFixed(2)}</strong>
            <small>kg CO₂e / trip</small>
          </div>
          <p className="box-sub">
            {calculation.weeklyBaseKg.toFixed(1)} kg CO₂e weekly across {distanceKm * tripsPerWeek * 2} km
          </p>
        </div>

        <div className="calc-result-box alternative">
          <span className="box-tag">Alternative Travel Footprint</span>
          <div className="box-val">
            <strong>{calculation.singleTripAltKg.toFixed(2)}</strong>
            <small>kg CO₂e / trip</small>
          </div>
          <p className="box-sub">
            {calculation.weeklyAltKg.toFixed(1)} kg CO₂e weekly across {distanceKm * tripsPerWeek * 2} km
          </p>
        </div>

        <div className="calc-result-box savings">
          <div className="savings-badge">
            <TrendingDown size={14} />
            <span>{calculation.percentReduction}% Carbon Reduction</span>
          </div>
          <div className="box-val highlight">
            <strong>−{calculation.weeklySavedKg.toFixed(1)}</strong>
            <small>kg CO₂e / week</small>
          </div>
          <p className="box-sub highlight">
            Estimated avoided emissions on this route per commuter
          </p>
        </div>
      </div>

      <div className="calc-methodology-note">
        <Info size={13} />
        <span>
          <strong>Methodology Disclosure:</strong> Emission factors reflect European Environment Agency (EEA) and UK DEFRA transport averages. Calculations are model estimations, not certified real-world measurements. Actual savings vary by vehicle efficiency, vehicle occupancy, terrain, and power grid generation fuel mix.
        </span>
      </div>
    </article>
  )
}
