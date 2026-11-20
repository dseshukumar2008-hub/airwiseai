'use client'

import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Station = { id: string; name: string; lat: number; lng: number; aqi: number; pm25: number; pm10: number }
function layerValue(station: Station, layer: string) { return layer === 'PM2.5' ? station.pm25.toFixed(1) : layer === 'PM10' ? station.pm10.toFixed(1) : String(station.aqi) }
type Reading = { aqi: number | null; pm25: number | null; pm10: number | null; label: string }
type Props = { stations: Station[]; selectedId: string; layer: string; satellite: boolean; onSelect: (id: string) => void; center?: { lat: number; lng: number } | null; reading?: Reading | null }

declare global { interface Window { google?: any } }

const AQI_COLORS = ['#6cae82', '#d4ac4d', '#df8d54', '#ce6a65', '#a27ba5', '#74566e']
function colorFor(aqi: number) { return AQI_COLORS[aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5] }
function readingColor(value: number, layer: string) {
  if (layer === 'PM2.5') return value <= 9 ? AQI_COLORS[0] : value <= 35.4 ? AQI_COLORS[1] : AQI_COLORS[3]
  if (layer === 'PM10') return value <= 54 ? AQI_COLORS[0] : value <= 154 ? AQI_COLORS[1] : AQI_COLORS[3]
  return colorFor(value)
}
function addGoogleScript(key: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.maps) return resolve()
    const existing = document.querySelector<HTMLScriptElement>('[data-google-maps]')
    if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(new Error('Google Maps did not load')), { once: true }); return }
    const script = document.createElement('script')
    script.dataset.googleMaps = 'true'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google Maps did not load. Check the browser API key and Maps JavaScript API access.'))
    document.head.appendChild(script)
  })
}

function isLive(instance: any) {
  return Boolean(instance && !instance.disposed && (instance.kind !== 'leaflet' || instance.map?._container))
}

function removeOverlay(item: any) {
  item.unbindTooltip?.()
  item.unbindPopup?.()
  item.remove?.()
  item.setMap?.(null)
}

export function GoogleMap({ stations, selectedId, layer, satellite, onSelect, center, reading }: Props) {
  const element = useRef<HTMLDivElement>(null)
  const instance = useRef<any>(null)
  const [status, setStatus] = useState('loading')
  const [tileWarning, setTileWarning] = useState('')
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    let cancelled = false
    let leafletMap: Leaflet.Map | undefined
    let ownedInstance: any = null
    const start = async () => {
      if (!element.current) return
      if (!key) {
        const L = await import('leaflet')
        if (cancelled || !element.current) return
        leafletMap = L.map(element.current, { zoomControl: false, attributionControl: true, minZoom: 2, maxZoom: 20 }).setView(center ? [center.lat, center.lng] : [0, 0], center ? 12 : 2)
        const street = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 17, attribution: 'Street map &copy; <a href="https://goto.arcgisonline.com/maps/World_Street_Map" target="_blank">Esri</a>, HERE, Garmin, OpenStreetMap contributors' })
        const aerial = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 17, attribution: 'Imagery &copy; <a href="https://www.esri.com/" target="_blank">Esri</a>, Maxar, Earthstar Geographics' })
        street.on('tileerror', () => setTileWarning('Street map tiles could not be loaded. Check your connection or switch to Satellite.'))
        aerial.on('tileerror', () => setTileWarning('Satellite imagery tiles could not be loaded. Check your connection or switch to Map.'))
        ;(satellite ? aerial : street).addTo(leafletMap)
        const markers = new Map<string, Leaflet.CircleMarker>()
        const circles: Leaflet.Circle[] = []
        stations.forEach(station => {
          const marker = L.circleMarker([station.lat, station.lng], { radius: station.id === selectedId ? 13 : 10, color: '#fff', weight: 3, fillColor: colorFor(station.aqi), fillOpacity: .96 }).addTo(leafletMap!)
          marker.bindTooltip(layerValue(station, layer), { permanent: true, direction: 'center', className: 'aqi-tooltip' })
          marker.bindPopup(`<strong>${station.name}</strong><br/>Illustrative ${layer}: ${layerValue(station, layer)}`)
          marker.on('click', () => onSelect(station.id))
          markers.set(station.id, marker)
          circles.push(L.circle([station.lat, station.lng], { radius: station.id === selectedId ? 600 : 410, stroke: false, fillColor: colorFor(station.aqi), fillOpacity: .12, interactive: false }).addTo(leafletMap!))
        })
        const chosen = stations.find(item => item.id === selectedId)
        if (center) leafletMap.panTo([center.lat, center.lng])
        else if (chosen) leafletMap.panTo([chosen.lat, chosen.lng])
        const user = center ? L.circleMarker([center.lat, center.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2871bc', fillOpacity: 1 }).bindTooltip('Selected location').addTo(leafletMap) : undefined
        if (cancelled) { leafletMap.stop(); leafletMap.remove(); return }
        ownedInstance = { kind: 'leaflet', map: leafletMap, markers, circles, street, aerial, user, disposed: false }
        instance.current = ownedInstance
        setStatus('demo')
        return
      }
      await addGoogleScript(key)
      if (cancelled || !element.current) return
      const google = window.google!
      const map = new google.maps.Map(element.current, { center: center ?? { lat: 0, lng: 0 }, zoom: center ? 12 : 2, mapTypeId: satellite ? 'satellite' : 'roadmap', mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: true })
      const markers = new Map<string, any>()
      const circles: any[] = []
      stations.forEach(station => {
        const marker = new google.maps.Marker({ map, position: { lat: station.lat, lng: station.lng }, title: `${station.name} · ${layer} ${layerValue(station, layer)}`, label: { text: layerValue(station, layer), color: '#fff', fontSize: '10px', fontWeight: '700' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: station.id === selectedId ? 13 : 10, fillColor: colorFor(station.aqi), fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } })
        marker.addListener('click', () => onSelect(station.id))
        markers.set(station.id, marker)
        circles.push(new google.maps.Circle({ map, center: { lat: station.lat, lng: station.lng }, radius: station.id === selectedId ? 600 : 410, strokeOpacity: 0, fillColor: colorFor(station.aqi), fillOpacity: .12, clickable: false }))
      })
      const user = center ? new google.maps.Marker({ map, position: center, title: 'Selected location', icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#2871bc', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }) : undefined
      ownedInstance = { kind: 'google', map, markers, circles, user, disposed: false }
      instance.current = ownedInstance
      const chosen = stations.find(item => item.id === selectedId)
      if (center) map.panTo(center)
      else if (chosen) map.panTo({ lat: chosen.lat, lng: chosen.lng })
      setStatus('google')
    }
    start().catch(() => { if (!cancelled) setStatus('error') })
    return () => {
      cancelled = true
      const current = ownedInstance
      if (current) {
        current.disposed = true
        if (instance.current === current) instance.current = null
      }
      if (current?.kind === 'leaflet' && current.map._container) {
        current.map.stop()
        if (current.readingMarker) removeOverlay(current.readingMarker)
        current.markers.forEach((marker: Leaflet.CircleMarker) => { marker.off(); marker.unbindTooltip(); marker.unbindPopup(); marker.remove() })
        current.circles.forEach((circle: Leaflet.Circle) => circle.remove())
        current.user?.remove()
        current.street.remove()
        current.aerial.remove()
        current.map.off()
        current.map.remove()
      } else if (current?.kind === 'google') {
        if (current.readingMarker) removeOverlay(current.readingMarker)
        current.markers.forEach((marker: any) => { window.google?.maps?.event?.clearInstanceListeners(marker); marker.setMap(null) })
        current.circles.forEach((circle: any) => circle.setMap(null))
        current.user?.setMap(null)
        window.google?.maps?.event?.clearInstanceListeners(current.map)
      } else if (leafletMap && (leafletMap as any)._container) {
        leafletMap.stop()
        leafletMap.off()
        leafletMap.remove()
      }
      leafletMap = undefined
    }
  }, [key, stations])

  useEffect(() => {
    const current = instance.current
    if (!isLive(current) || !center) return
    if (current.kind === 'leaflet') { current.map.stop(); current.map.flyTo([center.lat, center.lng], 12, { duration: 0.7 }); current.user?.setLatLng([center.lat, center.lng]) }
    else { current.map.panTo(center); current.map.setZoom(12); current.user?.setPosition(center) }
  }, [center?.lat, center?.lng])

  useEffect(() => {
    const current = instance.current
    if (!isLive(current)) return
    if (current.kind === 'leaflet') {
      current.map.eachLayer((item: any) => { if (item === current.street || item === current.aerial) current.map.removeLayer(item) })
      ;(satellite ? current.aerial : current.street).addTo(current.map)
    } else current.map.setMapTypeId(satellite ? 'satellite' : 'roadmap')
  }, [satellite, status])

  useEffect(() => {
    const current = instance.current
    const chosen = stations.find(item => item.id === selectedId)
    if (!isLive(current) || !chosen) return
    if (current.kind === 'leaflet') { current.markers.forEach((marker: any, id: string) => marker.setStyle({ radius: id === selectedId ? 13 : 10 })); current.circles.forEach((circle: any, i: number) => circle.setStyle({ fillColor: colorFor(stations[i].aqi), radius: stations[i].id === selectedId ? 600 : 410 })); current.markers.forEach((marker: any, id: string) => { const station = stations.find(item => item.id === id); if (station) { marker.setStyle({ fillColor: colorFor(station.aqi) }); marker.setTooltipContent(layerValue(station, layer)); marker.setPopupContent(`<strong>${station.name}</strong><br/>${layer}: ${layerValue(station, layer)}`) } }) }
    else { current.markers.forEach((marker: any, id: string) => { const station = stations.find(item => item.id === id); if (station) marker.setIcon({ ...marker.getIcon(), scale: id === selectedId ? 13 : 10, fillColor: colorFor(station.aqi) }); marker.setLabel({ text: station ? layerValue(station, layer) : '', color: '#fff', fontSize: '10px', fontWeight: '700' }) }); current.circles.forEach((circle: any, i: number) => { circle.setOptions({ fillColor: colorFor(stations[i].aqi), radius: stations[i].id === selectedId ? 600 : 410 }) }) }
  }, [selectedId, stations, layer, status])

  useEffect(() => {
    const current = instance.current
    if (!isLive(current)) return
    const value = reading ? layer === 'PM2.5' ? reading.pm25 : layer === 'PM10' ? reading.pm10 : reading.aqi : null
    if (!center || !reading || value === null) {
      if (current.readingMarker) removeOverlay(current.readingMarker)
      current.readingMarker = null
      return
    }

    const label = layer === 'AQI' ? `US AQI ${Math.round(value)}` : `${value.toFixed(1)} µg/m³`
    const description = `${reading.label} · ${label}`
    const color = readingColor(value, layer)

    if (current.kind === 'leaflet') {
      if (current.readingMarker) {
        current.readingMarker.setLatLng([center.lat, center.lng])
        current.readingMarker.setStyle({ fillColor: color })
        current.readingMarker.setTooltipContent(label)
        current.readingMarker.setPopupContent(`<strong>${description}</strong><br/>Coordinate-based air-quality estimate; not a monitoring station.`)
      } else {
        import('leaflet').then(({ default: L }) => {
          if (!isLive(current) || current.readingMarker) return
          current.readingMarker = L.circleMarker([center.lat, center.lng], { radius: 11, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 })
            .bindTooltip(label, { permanent: true, direction: 'top', className: 'aqi-tooltip' })
            .bindPopup(`<strong>${description}</strong><br/>Coordinate-based air-quality estimate; not a monitoring station.`)
            .addTo(current.map)
        })
      }
    } else if (current.readingMarker) {
      current.readingMarker.setPosition(center)
      current.readingMarker.setTitle(`${description} · coordinate-based estimate, not a monitoring station`)
      current.readingMarker.setLabel({ text: layer === 'AQI' ? String(Math.round(value)) : value.toFixed(1), color: '#fff', fontSize: '10px', fontWeight: '700' })
      current.readingMarker.setIcon({ ...current.readingMarker.getIcon(), fillColor: color })
    } else {
      current.readingMarker = new window.google!.maps.Marker({
        map: current.map,
        position: center,
        title: `${description} · coordinate-based estimate, not a monitoring station`,
        label: { text: layer === 'AQI' ? String(Math.round(value)) : value.toFixed(1), color: '#fff', fontSize: '10px', fontWeight: '700' },
        icon: { path: window.google!.maps.SymbolPath.CIRCLE, scale: 11, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      })
    }
  }, [center?.lat, center?.lng, layer, reading, status])

  useEffect(() => {
    const onZoomIn = () => { const current = instance.current; if (!isLive(current)) return; if (current.kind === 'leaflet') current.map.zoomIn(); else current.map.setZoom(current.map.getZoom() + 1) }
    const onZoomOut = () => { const current = instance.current; if (!isLive(current)) return; if (current.kind === 'leaflet') current.map.zoomOut(); else current.map.setZoom(current.map.getZoom() - 1) }
    window.addEventListener('airwise-zoom-in', onZoomIn); window.addEventListener('airwise-zoom-out', onZoomOut)
    return () => { window.removeEventListener('airwise-zoom-in', onZoomIn); window.removeEventListener('airwise-zoom-out', onZoomOut) }
  }, [status])


  return <div className="map-canvas" ref={element} aria-label={`${status === 'google' ? 'Google Maps' : 'Interactive geographic map'}${center ? ` centered at ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}` : ' waiting for a selected location'}${reading ? ' with a coordinate-based air-quality estimate' : ' without a returned air-quality reading'}`}>
    {status === 'loading' && key && <div className="map-status">Connecting to Google Maps…</div>}
    {status === 'error' && <div className="map-status map-status-error">Google Maps could not load. Check the browser API key and Maps JavaScript API access.</div>}
    {tileWarning && <div className="map-status map-status-error" role="status">{tileWarning}</div>}
  </div>
}
