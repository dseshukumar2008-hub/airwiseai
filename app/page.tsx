'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, ArrowUpRight, Clock3, Compass, Crosshair, Layers2, Leaf, Loader2, Map as MapIcon, MapPin, Search, Wind, X } from 'lucide-react'
import { GoogleMap } from '@/components/google-map'
import { BelowMapWorkspace } from '@/components/below-map-workspace'
import { AIAirCoachTab } from '@/components/tabs/ai-air-coach-tab'

type Location = { latitude: number; longitude: number; name: string; source: 'device' | 'search' }
type GeocodeResult = { name: string; displayName?: string; latitude: number; longitude: number; type?: string }
type ForecastReading = { aqi: number | null; pm25: number | null; pm10: number | null; time?: string | null }
type AirQuality = { aqi: number; category?: string; source: string; dominantPollutant?: string | null; pm25?: number | null; pm10?: number | null; updatedAt?: string | null; timezone?: string | null; forecast?: Record<number, ForecastReading> | null }
type Weather = { temperatureC: number | null; relativeHumidityPercent: number | null; windSpeedKmh: number | null; windDirectionDeg: number | null }
type Station = { id: string; name: string; lat: number; lng: number; aqi: number; pm25: number; pm10: number }
const mapStations: Station[] = []
const BANDS = [['Good', '#72bd91'], ['Moderate', '#e3c25f'], ['Sensitive groups', '#e79a5c'], ['Unhealthy', '#d87d77'], ['Very unhealthy', '#ad8bb4'], ['Hazardous', '#805b75']]
function category(aqi: number) { return BANDS[aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5] }

export default function Page() {
  const [location, setLocation] = useState<Location | null>(null)
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'ready' | 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'error'>('detecting')
  const [locationMessage, setLocationMessage] = useState('')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [searchMessage, setSearchMessage] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [layer, setLayer] = useState('AQI')
  const [satellite, setSatellite] = useState(false)
  const [forecast, setForecast] = useState(0)
  const [airQuality, setAirQuality] = useState<AirQuality | null>(null)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [apiStatus, setApiStatus] = useState<'idle' | 'loading' | 'unavailable'>('idle')
  const [refreshToken, setRefreshToken] = useState(0)

  // Shared state for household & activity between AI Copilot & Environmental Tabs
  const [audience, setAudience] = useState<string>('general')
  const [activity, setActivity] = useState<string>('school and work commute')

  // Tracking latest requests to prevent race condition overruns
  const latestAqiRequestId = useRef(0)
  const latestWeatherRequestId = useRef(0)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported')
      setLocationMessage('This browser does not support location detection. Search for a city below instead.')
      return
    }
    setLocationStatus('detecting')
    setForecast(0)
    setLocationMessage('Requesting your device location…')
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords
      setLocation({ latitude, longitude, name: 'Your current location', source: 'device' })
      setLocationStatus('ready')
      setLocationMessage('Location detected from your device.')
      try {
        const response = await fetch(`/api/geocode?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`)
        if (!response.ok) throw new Error('Reverse geocoding failed')
        const result = await response.json()
        if (result.name) setLocation((current) => current?.source === 'device' && current.latitude === latitude && current.longitude === longitude ? { ...current, name: result.name } : current)
      } catch {
        setLocationMessage('Your coordinates were detected, but the place name is unavailable. The map still uses your exact coordinates.')
      }
    }, (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        setLocationStatus('denied')
        setLocationMessage('Location access was denied. Enable location permission for this site in your browser settings, or search for a city below.')
      } else if (error.code === error.TIMEOUT) {
        setLocationStatus('timeout')
        setLocationMessage('Location detection timed out. Retry, or search for a city below.')
      } else {
        setLocationStatus('unavailable')
        setLocationMessage('Your device could not determine a location. Check device location services and retry, or search for a city below.')
      }
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 })
  }, [])

  useEffect(() => { detectLocation() }, [detectLocation])

  // Fetch AQI for selected coordinates with strict race-condition guards
  useEffect(() => {
    if (!location) {
      setAirQuality(null)
      setApiStatus('idle')
      return
    }

    const currentRequestId = ++latestAqiRequestId.current
    const controller = new AbortController()

    setApiStatus('loading')
    // Clear previous location's AQI values to prevent stale displays
    setAirQuality(null)

    fetch('/api/air-quality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: location.latitude, longitude: location.longitude }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json()
        if (currentRequestId !== latestAqiRequestId.current) return // Abandon if a newer location was picked

        if (!response.ok || !['google-air-quality-api', 'open-meteo-air-quality-api'].includes(result.source)) {
          throw new Error(result.error || 'Live air quality is unavailable for this coordinate.')
        }

        setAirQuality(result)
        setApiStatus('idle')
      })
      .catch((error) => {
        if (error.name !== 'AbortError' && currentRequestId === latestAqiRequestId.current) {
          setApiStatus('unavailable')
        }
      })

    return () => {
      controller.abort()
    }
  }, [location, refreshToken])

  // Fetch Live Weather telemetry in sync with selected coordinates
  useEffect(() => {
    if (!location) {
      setWeather(null)
      return
    }

    const currentReqId = ++latestWeatherRequestId.current
    const controller = new AbortController()

    fetch('/api/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: location.latitude, longitude: location.longitude }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (currentReqId !== latestWeatherRequestId.current) return
        if (!res.ok) throw new Error('Weather unavailable')
        const data = await res.json()
        if (data.current) {
          setWeather({
            temperatureC: data.current.temperatureC,
            relativeHumidityPercent: data.current.relativeHumidityPercent,
            windSpeedKmh: data.current.windSpeedKmh,
            windDirectionDeg: data.current.windDirectionDeg,
          })
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError' && currentReqId === latestWeatherRequestId.current) {
          setWeather(null)
        }
      })

    return () => {
      controller.abort()
    }
  }, [location, refreshToken])

  // Perform Geocode Search
  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < 2) {
      setSearchResults([])
      setSearchStatus('idle')
      return
    }

    setSearchStatus('loading')
    setSearchMessage('')

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Location search is temporarily busy. Retry shortly.')

      const results = result.results ?? []
      setSearchResults(results)
      setHighlightedIndex(-1)

      if (results.length > 0) {
        setSearchStatus('idle')
      } else {
        setSearchMessage(`No matching locations found for "${trimmed}". Try adding district or country name.`)
        setSearchStatus('error')
      }
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : 'Location search is temporarily unavailable. Retry shortly.')
      setSearchStatus('error')
    }
  }, [])

  // Debounced input change (380ms)
  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

    if (value.trim().length < 2) {
      setSearchResults([])
      setSearchStatus('idle')
      setSearchMessage('')
      return
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(value)
    }, 380)
  }

  function selectSearchResult(result: GeocodeResult) {
    setLocation({
      latitude: result.latitude,
      longitude: result.longitude,
      name: result.name,
      source: 'search',
    })
    setLocationStatus('ready')
    setLocationMessage(`Showing ${result.name}.`)
    setSearchResults([])
    setQuery('')
    setSearchStatus('idle')
    setHighlightedIndex(-1)
    setForecast(0)
  }

  function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

    if (highlightedIndex >= 0 && searchResults[highlightedIndex]) {
      selectSearchResult(searchResults[highlightedIndex])
    } else if (searchResults.length === 1) {
      selectSearchResult(searchResults[0])
    } else if (query.trim().length >= 2) {
      performSearch(query)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (searchResults.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1))
    } else if (event.key === 'Escape') {
      setSearchResults([])
      setHighlightedIndex(-1)
    }
  }

  const selectedReading = forecast === 0 ? airQuality : airQuality?.forecast?.[forecast]
  const aqi = selectedReading?.aqi ?? undefined
  const readingLabel = forecast
    ? `Open-Meteo +${forecast}h forecast`
    : airQuality?.source === 'google-air-quality-api'
    ? 'Google Air Quality API coordinate estimate'
    : 'Open-Meteo current-condition estimate'
  const selectedTimestamp = forecast ? airQuality?.forecast?.[forecast]?.time ?? null : airQuality?.updatedAt ?? null
  const advice = aqi === undefined
    ? forecast ? `The +${forecast}h AQI forecast is unavailable. Current AQI: ${airQuality?.aqi ?? 'not available'}.` : 'Live AQI is not available for this location yet. Check local conditions before making outdoor plans.'
    : aqi <= 50
      ? 'Air quality is good. Outdoor exercise and open-window ventilation are generally suitable.'
      : aqi <= 100
        ? 'Air quality is moderate. Most people can continue usual activities; sensitive people may prefer shorter or less strenuous outings. Check conditions again before opening windows.'
        : aqi <= 150
          ? 'Sensitive groups may wish to reduce prolonged or strenuous outdoor activity. Consider a cleaner indoor space and follow local air-quality alerts.'
          : 'Reduce prolonged outdoor exertion and consider moving strenuous activity indoors. Follow local public-health alerts; this general guidance is not medical advice.'

  return <main className="airwise">
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-group">
          <a className="brand" href="#">
            <span className="brand-mark"><Wind size={18} /></span>
            <span>AIRWISE <b>AI</b></span>
          </a>
          <span className="divider" />
          <span className="crumb">Live Air Quality Map</span>
        </div>
        <div className="top-actions">
          <span className="demo-pill"><i />{airQuality ? 'Current API estimate' : 'Location-aware air quality'}</span>
          <span className="avatar">AW</span>
        </div>
      </div>
    </header>
    <div className="page-wrap">
      <div className="intro">
        <div className="intro-copy">
          <div className="kicker"><span /> ENVIRONMENTAL INTELLIGENCE</div>
          <h1>Air quality explorer<span>.</span></h1>
          <p>Local air quality, pollutant levels, and health guidance.</p>
        </div>
        <div className="city">
          <MapPin size={15} />
          <span>{location?.name ?? 'Location not set'}</span>
        </div>
      </div>
      <div className="location-banner" role="status" aria-live="polite">
        <div className="location-banner-text">
          <strong>{locationStatus === 'detecting' ? 'Finding your location' : location ? 'Your map is location-aware' : 'Set your location'}</strong>
          <p>{locationStatus === 'detecting' ? 'Allow location access when your browser asks. Coordinates are sent to geocoding and air-quality services for results; AIRWISE does not save them.' : locationMessage}</p>
        </div>
        <button className="locate-action" onClick={detectLocation} disabled={locationStatus === 'detecting'}>
          <Crosshair size={14} />
          <span>{locationStatus === 'detecting' ? 'Detecting…' : 'Find my location'}</span>
        </button>
      </div>
      {/* RESPONSIVE TWO-COLUMN DASHBOARD LAYOUT */}
      <div className="app-dashboard-layout">
        {/* LEFT COLUMN: Main Environmental Workspace */}
        <div className="environmental-main-workspace">
          <div className="workspace">
            <section className="map-card">
              <div className="map-title">
                <div className="section-heading"><MapIcon size={17} /> Map overview</div>
                <span className="data-badge"><i />{airQuality ? airQuality.source === 'google-air-quality-api' ? 'Google API · coordinate estimate' : 'Open-Meteo · coordinate estimate' : 'No verified station feed'}</span>
              </div>
              <div className="map-shell">
                <GoogleMap stations={mapStations} selectedId="" layer={layer} satellite={satellite} onSelect={() => undefined} center={location ? { lat: location.latitude, lng: location.longitude } : null} reading={airQuality && aqi !== undefined ? { aqi, pm25: selectedReading?.pm25 ?? null, pm10: selectedReading?.pm10 ?? null, label: forecast ? `Open-Meteo +${forecast}h forecast` : 'Coordinate-based current estimate' } : null} />
                <div className="map-top">
                  <div className="searchbox">
                    <Search size={16} />
                    <form onSubmit={handleFormSubmit}>
                      <input
                        ref={searchInputRef}
                        aria-label="Search for a city, town, locality or postal code"
                        value={query}
                        onChange={(event) => handleQueryChange(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search city, town, or locality…"
                        autoComplete="off"
                      />
                      <button type="submit" aria-label="Search locations" disabled={searchStatus === 'loading'}>
                        {searchStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      </button>
                    </form>
                    {query && (
                      <button
                        onClick={() => {
                          setQuery('')
                          setSearchResults([])
                          setSearchStatus('idle')
                          setSearchMessage('')
                        }}
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                    {(searchResults.length > 0 || searchStatus === 'loading' || searchStatus === 'error') && (
                      <div className="search-results" role="listbox">
                        {searchStatus === 'loading' ? (
                          <span className="search-loading-row">
                            <Loader2 size={13} className="animate-spin" /> Searching global locations…
                          </span>
                        ) : searchStatus === 'error' ? (
                          <span className="search-error-row">{searchMessage}</span>
                        ) : (
                          searchResults.map((result, index) => {
                            const isHighlighted = highlightedIndex === index
                            return (
                              <button
                                key={`${result.latitude}-${result.longitude}-${index}`}
                                role="option"
                                aria-selected={isHighlighted}
                                className={isHighlighted ? 'is-highlighted' : ''}
                                onClick={() => selectSearchResult(result)}
                              >
                                <MapPin size={13} />
                                <div className="result-text-container">
                                  <strong>{result.name}</strong>
                                  {result.displayName && result.displayName !== result.name && (
                                    <small>{result.displayName}</small>
                                  )}
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                  <div className="map-tools-top"><div className="layer-switch" role="group" aria-label="Map pollution layer"><Layers2 size={15} />{['AQI', 'PM2.5', 'PM10'].map((item) => <button key={item} onClick={() => setLayer(item)} className={layer === item ? 'active' : ''} aria-pressed={layer === item}>{item}</button>)}</div><div className="basemap-switch" role="group" aria-label="Basemap view"><button onClick={() => setSatellite(false)} className={!satellite ? 'active' : ''} aria-pressed={!satellite}>Map</button><button onClick={() => setSatellite(true)} className={satellite ? 'active' : ''} aria-pressed={satellite}>Satellite</button></div></div>
                </div>
                <div className="map-controls"><button aria-label="Find my location" title="Find my location" onClick={detectLocation} disabled={locationStatus === 'detecting'}><Crosshair size={16} /></button><div className="zoom"><button aria-label="Zoom in" onClick={() => window.dispatchEvent(new Event('airwise-zoom-in'))}>+</button><button aria-label="Zoom out" onClick={() => window.dispatchEvent(new Event('airwise-zoom-out'))}>−</button></div></div>
                <span className="map-note">Map credits at lower right · marker is a coordinate-based estimate, not a station</span>
              </div>
              <div className="legend"><span className="legend-title">{layer === 'AQI' ? 'US AQI' : `${layer} · µg/m³`}</span><div className="legend-bands">{(layer === 'AQI' ? BANDS : layer === 'PM2.5' ? [['Good · 0–9', '#72bd91'], ['Moderate · 9.1–35.4', '#e3c25f'], ['Elevated · 35.5+', '#d87d77']] : [['Good · 0–54', '#72bd91'], ['Moderate · 55–154', '#e3c25f'], ['Elevated · 155+', '#d87d77']]).map(([name, color], index) => <span key={name}><i style={{ background: color }} />{name}{layer === 'AQI' && <small>{['0–50', '51–100', '101–150', '151–200', '201–300', '301+'][index]}</small>}</span>)}</div></div>
              <div className="map-footer"><span><Clock3 size={15} /> Forecast horizon</span><div className="time-switch">{[0, 3, 6, 12, 24].map((hours) => <button key={hours} onClick={() => setForecast(hours)} className={forecast === hours ? 'active' : ''}>{hours ? `+${hours}h` : 'Now'}</button>)}</div></div>
            </section>

            <aside className="sidebar">
              <section className="detail-card">
                <div className="selected-label"><i /> SELECTED LOCATION · {location ? (forecast ? aqi !== undefined ? `FORECAST +${forecast}H` : 'FORECAST UNAVAILABLE' : airQuality ? 'CURRENT API ESTIMATE' : 'AQI UNAVAILABLE') : 'AWAITING LOCATION'}</div>
                <h2>{location?.name ?? 'Choose a location'}</h2>
                <p className="coordinates">{location ? `${location.latitude.toFixed(5)}°, ${location.longitude.toFixed(5)}° · ${location.source === 'device' ? 'device location' : 'manual search'}` : 'Find your location or search for a city to begin.'}</p>
                <div className="aqi-card">
                  <div className="aqi-meta"><span>Air Quality Index {forecast ? `(+${forecast}h)` : '(now)'}</span>{aqi !== undefined && <span className="category" style={{ '--cat': category(aqi)[1] } as React.CSSProperties}><i />{category(aqi)[0]}</span>}</div>
                  <div className="aqi-score"><strong>{apiStatus === 'loading' ? '…' : aqi ?? '—'}</strong><span>US AQI</span><small>{forecast && aqi === undefined ? 'Forecast unavailable' : forecast ? 'Open-Meteo hourly forecast' : airQuality ? 'Provider current estimate' : apiStatus === 'loading' ? 'Checking selected coordinates' : 'No current estimate'}</small></div>
                  {selectedTimestamp && <p className="reading-time">Provider time · {selectedTimestamp.replace('T', ' ')}{airQuality?.timezone ? ` · ${airQuality.timezone}` : ''}</p>}
                  {aqi !== undefined && <div className="aqi-gradient"><i style={{ left: `${Math.min(aqi / 3, 98)}%` }} /></div>}
                </div>
                <div className="pollutant-grid">
                  <div><span>PM2.5</span><b>{selectedReading?.pm25 == null ? '—' : selectedReading.pm25.toFixed(1)} <small>µg/m³</small></b></div>
                  <div><span>PM10</span><b>{selectedReading?.pm10 == null ? '—' : selectedReading.pm10.toFixed(1)} <small>µg/m³</small></b></div>
                  <div><span>Dominant</span><b>{airQuality?.dominantPollutant ?? '—'}</b><small>{forecast ? 'Forecast data' : airQuality ? 'Current data' : 'Not reported'}</small></div>
                </div>
                {/* COMPACT REAL-TIME WEATHER TELEMETRY INDICATOR */}
                <div className="pollutant-grid weather-telemetry-grid">
                  <div>
                    <span>Temperature</span>
                    <b>{weather?.temperatureC != null ? `${weather.temperatureC.toFixed(1)}°` : '—'} <small>°C</small></b>
                  </div>
                  <div>
                    <span>Humidity</span>
                    <b>{weather?.relativeHumidityPercent != null ? `${weather.relativeHumidityPercent.toFixed(0)}%` : '—'} <small>RH</small></b>
                  </div>
                  <div>
                    <span>Wind Telemetry</span>
                    <b>{weather?.windSpeedKmh != null ? `${weather.windSpeedKmh.toFixed(1)}` : '—'} <small>km/h</small></b>
                  </div>
                </div>
                <div className="guidance">
                  <div className="guidance-title"><Leaf size={15} /> Health recommendations</div>
                  <p>{advice}</p>
                  <div className="sensitive"><Activity size={13} />{aqi === undefined ? forecast ? 'This forecast is not available; review current conditions instead.' : 'Recommendations update when live AQI is available.' : aqi <= 50 ? `No special precautions are indicated for ${forecast ? 'this forecast' : 'the current reading'}.` : 'Sensitive groups: consider limiting prolonged outdoor exposure.'}</div>
                </div>
                {apiStatus === 'unavailable' && <div className="api-note error">Live air-quality data is unavailable for these coordinates. No fallback city or AQI is substituted.</div>}
                <button className="refresh" onClick={() => location && setRefreshToken((token) => token + 1)} disabled={!location || apiStatus === 'loading'}>
                  {apiStatus === 'loading' ? 'Checking selected location…' : 'Refresh live reading'}
                  <ArrowUpRight size={14} />
                </button>
              </section>
              <section className="nearby-card">
                <div className="nearby-title">
                  <div className="section-heading"><Compass size={15} /> Nearby monitoring stations</div>
                  <span>No feed connected</span>
                </div>
                <p className="no-stations">{location ? 'No verified monitoring-station feed is connected. The selected AQI and particulate values come from the named coordinate-based data source and are not station readings.' : 'Set a location to see available coordinate-based air-quality data. Nearby station readings are not currently connected.'}</p>
              </section>
            </aside>
          </div>

          {/* REFINED BELOW-THE-MAP TABBED WORKSPACE */}
          <BelowMapWorkspace
            locationName={location?.name ?? null}
            latitude={location?.latitude ?? null}
            longitude={location?.longitude ?? null}
            airQuality={airQuality}
            selectedReading={selectedReading}
            weather={weather}
            forecastHour={forecast}
            onSelectForecastHour={setForecast}
            readingLabel={readingLabel}
            advice={advice}
            audience={audience}
            setAudience={setAudience}
            activity={activity}
            setActivity={setActivity}
          />
        </div>

        {/* RIGHT COLUMN: Dedicated AI Copilot Panel */}
        <aside className="ai-copilot-panel-column" aria-label="AI Air Quality Copilot">
          <AIAirCoachTab
            locationName={location?.name ?? null}
            latitude={location?.latitude ?? null}
            longitude={location?.longitude ?? null}
            aqi={aqi ?? null}
            pm25={selectedReading?.pm25 ?? null}
            pm10={selectedReading?.pm10 ?? null}
            readingLabel={readingLabel}
            forecast={airQuality?.forecast ?? null}
            weather={weather}
            audience={audience}
            setAudience={setAudience}
            activity={activity}
            setActivity={setActivity}
          />
        </aside>
      </div>
      <footer className="app-main-footer">
        <div className="footer-brand">
          <span className="brand-mark"><Wind size={15} /></span>
          <span>AIRWISE <b>AI</b> · Environmental Intelligence</span>
        </div>
        <p className="footer-disclaimer">
          AQI and pollutant values are coordinate-based estimates from live APIs; no monitoring-station data is fabricated. Indoor guidance is modeled on atmospheric infiltration principles. Not clinical medical advice.
        </p>
      </footer>
    </div>
  </main>
}
