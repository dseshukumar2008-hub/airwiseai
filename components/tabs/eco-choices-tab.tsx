'use client'

import { useMemo } from 'react'
import {
  Bike,
  Bus,
  Footprints,
  Info,
  Leaf,
  ShieldCheck,
  Train,
  TrendingDown,
  Zap,
} from 'lucide-react'

type Props = {
  currentAqi: number | null
  audience: string
  activity: string
}

export function EcoChoicesTab({ currentAqi, audience, activity }: Props) {
  const isHighAqi = currentAqi !== null && currentAqi > 100
  const isVulnerable = audience === 'respiratory' || audience === 'children' || audience === 'older-adult'

  const alternatives = useMemo(() => {
    return [
      {
        icon: Train,
        mode: 'Metro & Commuter Rail',
        bestFor: 'Medium-to-long commutes & high-pollution days',
        emissions: '−79% vs solo petrol car (35 g CO₂e/km)',
        healthBenefit: 'Fully separated from ground-level road exhaust plumes.',
        recommendation: 'Top choice when outdoor AQI is moderate or elevated.',
      },
      {
        icon: Bus,
        mode: 'Municipal Bus & Rapid Transit',
        bestFor: 'Urban corridors & medium journeys',
        emissions: '−52% vs solo petrol car (82 g CO₂e/km)',
        healthBenefit: 'Carries modern cabin air filters; eliminates cold-start vehicle wear.',
        recommendation: 'Opt for electric or hybrid fleet lines when available.',
      },
      {
        icon: Bike,
        mode: 'E-Bike & Cycling',
        bestFor: 'Short commutes (<10 km) on clean air days',
        emissions: '−93% to −100% vs car (0–12 g CO₂e/km)',
        healthBenefit: isHighAqi
          ? 'CAUTION: Heavy physical exertion increases lung ventilation 5x. Avoid on high-AQI days.'
          : 'Zero tailpipe emissions and active cardiovascular conditioning.',
        recommendation: isHighAqi
          ? 'Switch to electric rail or bus until AQI improves below 100.'
          : 'Choose low-traffic residential side-streets over main truck corridors.',
      },
      {
        icon: Footprints,
        mode: 'Walking & Active Pedestrian',
        bestFor: 'Neighborhood errands (<3 km)',
        emissions: 'Zero operational emissions (0 g CO₂e/km)',
        healthBenefit: isHighAqi
          ? 'CAUTION: Limit prolonged walking along congested highways during smog peaks.'
          : 'Replaces short vehicular trips which have the highest emissions per km.',
        recommendation: 'Walk through park connectors and pedestrian zones.',
      },
    ]
  }, [isHighAqi])

  return (
    <div className="tab-pane-content">
      <div className="planner-header-grid">
        <div>
          <div className="kicker">
            <span /> LIFESTYLE & LOCATION-TAILORED SUSTAINABILITY
          </div>
          <h2 className="planner-title">Sustainable Transit Alternatives & Exposure Guidance</h2>
          <p className="planner-subtitle">
            Contextual mobility choices balancing personal respiratory protection with urban emissions reduction.
          </p>
        </div>
      </div>

      {/* Exposure Tradeoff Banner */}
      {isHighAqi && (
        <div className="calc-caution-banner">
          <Info size={16} />
          <div>
            <strong>Air Quality Advisory for Active Commuters:</strong> Outdoor US AQI is currently elevated ({currentAqi}). While walking and cycling produce zero emissions, intense roadside physical exertion causes deeper lung penetration of PM2.5. For today’s travel, electrified transit (metro, electric bus) offers the ideal balance of zero tailpipe footprint and protected in-cabin exposure.
          </div>
        </div>
      )}

      {/* Modal Cards Grid */}
      <div className="eco-choices-grid">
        {alternatives.map(({ icon: Icon, mode, bestFor, emissions, healthBenefit, recommendation }) => (
          <div className="eco-mode-card" key={mode}>
            <div className="eco-mode-header">
              <div className="eco-icon-wrapper">
                <Icon size={18} />
              </div>
              <div>
                <strong>{mode}</strong>
                <span>{bestFor}</span>
              </div>
            </div>

            <div className="eco-metric-row">
              <Leaf size={14} />
              <span>{emissions}</span>
            </div>

            <div className="eco-benefit-text">
              <strong>Health & Exposure:</strong> {healthBenefit}
            </div>

            <div className="eco-rec-callout">
              <strong>Recommended Action:</strong> {recommendation}
            </div>
          </div>
        ))}
      </div>

      {/* Safety standards grid */}
      <div className="safety-standards-card" style={{ marginTop: 20 }}>
        <div className="safety-card-header">
          <ShieldCheck size={18} />
          <div>
            <h3>EPA Air Quality Index (AQI) Guidelines</h3>
            <p>Regulatory guidance thresholds for outdoor exposure and sensitive demographics</p>
          </div>
        </div>

        <div className="safety-bands-grid">
          <div className="band-box good">
            <div className="band-header">
              <span className="dot" />
              <strong>0–50 · Good</strong>
            </div>
            <p>Air quality is satisfactory. Safe for all outdoor activities and active pedestrian/bike commutes.</p>
          </div>

          <div className="band-box moderate">
            <div className="band-header">
              <span className="dot" />
              <strong>51–100 · Moderate</strong>
            </div>
            <p>Air quality is acceptable. Sensitive individuals should monitor respiratory symptoms during heavy exercise.</p>
          </div>

          <div className="band-box sensitive">
            <div className="band-header">
              <span className="dot" />
              <strong>101–150 · Sensitive Groups</strong>
            </div>
            <p>Children, older adults, and individuals with respiratory conditions should limit prolonged outdoor exertion.</p>
          </div>

          <div className="band-box unhealthy">
            <div className="band-header">
              <span className="dot" />
              <strong>151+ · Unhealthy</strong>
            </div>
            <p>Everyone may experience health effects. Keep home windows sealed, operate HEPA filtration, and take transit.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
