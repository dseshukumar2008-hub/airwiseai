# AIRWISE AI — Google Antigravity handover

## Project layout

```text
app/
  api/
    air-quality/route.ts                 # Validates coordinates; calls air-quality providers
    air-quality-assistant/route.ts       # Server-side AI Gateway recommendations
    geocode/route.ts                     # Nominatim search and reverse geocoding
  globals.css
  layout.tsx                             # Metadata, viewport, response headers are configured in next.config.mjs
  page.tsx                               # Location-aware map and AQI dashboard
components/
  air-quality-assistant.tsx              # Household and indoor/outdoor recommendations
  forecast-analytics.tsx                 # AQI, PM2.5, PM10 forecast selector and chart
  google-map.tsx                         # Google Maps when configured; Leaflet/Esri otherwise
  ui/button.tsx
lib/utils.ts
.env.example
package.json
pnpm-lock.yaml
next.config.mjs
```

There is no separate backend service: the Next.js App Router API handlers are the backend. Keep provider credentials server-side and never commit `.env.development.local` or production secrets.

## Data and product boundaries

- Current US AQI and PM2.5/PM10 come from Google Air Quality API when its server key is configured; otherwise they come from Open-Meteo Air Quality API. AQI values are requested as US AQI. Open-Meteo provides gridded/model-based data, not named monitoring-station observations.
- Forecast horizons are selected from Open-Meteo hourly fields near +3, +6, +12, and +24 hours. Each point includes its provider timestamp where available. Missing readings remain unavailable rather than being filled with sample values.
- The map is Leaflet with Esri street/imagery tiles unless an optional browser-restricted Google Maps key is configured. The air-quality marker represents the selected coordinate/API estimate, not a regulatory monitor. Tile attribution is displayed by the map library.
- Geocoding uses OpenStreetMap Nominatim. Follow its usage policy and move to a service with an appropriate service agreement and request controls before scaling.
- The server-side AI SDK endpoint targets Vercel AI Gateway (`openai/gpt-4.1-mini`). The integration is reported connected, but an actual preview request returned `GatewayAuthenticationError: Unauthenticated request to AI Gateway`; AI generation is therefore wired but not operationally verified in this workspace. The UI reports failures and keeps practical non-AI guidance visible; it never labels fallback copy as generated AI.
- AI input includes the place name, selected AQI/PM values, data-period label, and the user-selected household/activity categories. It does not send exact coordinates. The app does not persist that input or response.

## Environment configuration

Copy `.env.example` to the framework's local environment file only when configuring providers. Both keys are optional:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: browser-visible; restrict to Maps JavaScript API and approved origins.
- `GOOGLE_MAPS_API_KEY`: server-only; restrict to Google Air Quality API. Do not add a `NEXT_PUBLIC_` prefix.
- No AI provider key is embedded in source. Although the Vercel AI Gateway integration is connected in the v0 project, the preview server currently reports an unauthenticated Gateway request. Verify the destination runtime's Vercel AI Gateway authentication/configuration before expecting generated recommendations to work. Do not commit or expose gateway credentials.

No credentials were present in the workspace when this handover was prepared. The app therefore uses the Open-Meteo/Leaflet path by default unless keys are configured in the destination environment.

## Security and operational notes

- Air-quality and geocoding handlers validate coordinate bounds and limit outbound requests with timeouts. The AI route validates fixed-choice inputs, caps request size and output tokens, and applies a small in-memory per-IP request limit.
- The in-memory AI limit is best-effort only: it is not shared across serverless instances and resets on restart. Replace it with a shared rate limiter before public production use if abuse or spend limits require enforcement.
- The Next.js config sets `nosniff`, referrer, HSTS, and a geolocation-aware Permissions Policy. There is no custom wildcard CORS policy.
- Do not infer nearby station readings from the selected location. No verified station provider is currently connected.
- Keep a clear distinction between provider current conditions and hourly forecasts; never label gridded estimates as station readings or imply that AQI is medical advice.

## Starting point

The project uses `pnpm` and the lockfile is `pnpm-lock.yaml`. Install from the lockfile and start the Next.js development server using the existing `dev` script. The existing preview service is `pnpm run dev` on port 3000.

Before shipping from Antigravity, verify provider credentials and API access, current and forecast timestamps, Esri tile availability/attribution in the target region, AI Gateway authentication in the target runtime, mobile/tablet layout, and production build. This handover does not claim that Google Maps, Google Air Quality API, or a nearby monitoring-station feed is configured.
