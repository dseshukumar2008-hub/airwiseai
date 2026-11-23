# AIRWISE AI — Urban Air Quality & Environmental Copilot

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-000000?style=flat&logo=vercel)](https://airwise-ai-source.vercel.app)
[![PromptWars Challenge 6](https://img.shields.io/badge/PromptWars-Challenge%206-blue)](https://promptwars.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.6-000000?style=flat&logo=next.js)](https://nextjs.org)
[![Vitest](https://img.shields.io/badge/Vitest-5.1.1-6E9F18?style=flat&logo=vitest)](https://vitest.dev)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**AIRWISE AI** is an intelligent, scientifically-grounded urban environmental intelligence application developed for **PromptWars Challenge 6**. It helps households, vulnerable demographics (children, elderly, respiratory patients), and urban commuters translate ambient air quality, micro-meteorology, and particulate trends into personalized health guidance and lower-emission mobility alternatives.

**Live Production URL:** [https://airwise-ai-source.vercel.app](https://airwise-ai-source.vercel.app)  
**GitHub Repository:** [https://github.com/dseshukumar2008-hub/airwiseai](https://github.com/dseshukumar2008-hub/airwiseai)

---

## Table of Contents
1. [Core Features & Family-Focused Scenarios](#core-features--family-focused-scenarios)
2. [Dual AI Provider Architecture & Deterministic Engine](#dual-ai-provider-architecture--deterministic-engine)
3. [Scientific Grounding & Safety Protocols](#scientific-grounding--safety-protocols)
4. [Data Sources & Limitations](#data-sources--limitations)
5. [Automated Test Suite & Verification](#automated-test-suite--verification)
6. [Local Installation & Development](#local-installation--development)
7. [Environment Variables](#environment-variables)
8. [Deployment Instructions](#deployment-instructions)

---

## Core Features & Family-Focused Scenarios

AIRWISE AI evaluates complex environmental conditions for specific household needs:

- **Smart Daily Planner:** Provides actionable scheduling advice across 5 key household profiles (`children`, `older-adult`, `respiratory`, `outdoor-worker`, and `general`).
- **Indoor Guardian:** Actionable ventilation strategies distinguishing homes with HEPA filtration from those without. Provides low-cost mitigation (interior sanctuary rooms, damp dust control, avoidance of indoor combustion) without ever advising unsafe indefinite sealing of residences.
- **Eco Choices & Commute Calculator:** Directly calculates greenhouse gas savings (CO₂e) alongside street-level toxic avoidance (NOx, unburned hydrocarbons, primary elemental carbon PM2.5) for exact round-trip commute distances (e.g. 12 km one-way = 24 km daily).
- **Environmental Condition Analysis:** Combines particulate readings with surface temperature, relative humidity, and wind speed to assess atmospheric dispersion versus ground-level stagnation.
- **Precision Geolocation & Reverse Geocoding:** High-accuracy GPS with explicit fallbacks and fuzzy search resolution (e.g., resolving Kesarpalli/Kesarapalle with full coordinate synchronicity).

---

## Dual AI Provider Architecture & Deterministic Engine

AIRWISE AI implements an enterprise-grade resilient AI provider hierarchy to guarantee continuous availability:

```
[ User Query / Telemetry ]
           │
           ▼
┌──────────────────────────────────────┐
│       Google Gemini 2.5 Flash        │  ◄── Primary Provider
│  (Multi-Turn Dynamic Tool Calling)   │
└──────────────────────────────────────┘
           │
           ├─ (Success) ──► Stream Response to Client
           │
           ▼ (HTTP 429 Quota Exhausted / Network / Key Error)
┌──────────────────────────────────────┐
│           Groq LLaMA / Qwen          │  ◄── Secondary Fallback Provider
│   (OpenAI-Compatible Tool Calling)   │
└──────────────────────────────────────┘
           │
           ├─ (Success) ──► Response + Provider Notice
           │
           ▼ (Groq Unavailable / Offline / Rate Limited)
┌──────────────────────────────────────┐
│     Verified Deterministic Engine    │  ◄── Zero-Hallucination Tertiary Fallback
│  (Rule-Based Environmental Formulas) │
└──────────────────────────────────────┘
           │
           ▼
[ Grounded Response + Methodological Disclosures ]
```

### Deterministic Tool Suite
Both AI models interface with exact mathematical and environmental tools:
1. `getCurrentAirQuality`: Fetches verified US AQI, PM2.5, and PM10 concentrations.
2. `getAirQualityForecast`: Analyzes multi-hour ahead particulate trends to detect cleanest outdoor windows.
3. `generateDailyRoutine`: Computes risk scores and personalized activity timings.
4. `getIndoorAirGuidance`: Calculates natural vs. mechanical ventilation protocols.
5. `compareSustainableAlternatives`: Evaluates emission factors across transit modalities.
6. `calculateEnvironmentalImpact`: Calculates single-trip, weekly, and annual CO₂e savings.
7. `analyzeEnvironmentalConditions`: Correlates wind speeds and humidity with stagnation.

---

## Scientific Grounding & Safety Protocols

1. **No Hallucinated Indoor Sensors:** Explicit disclosures inform the user that AIRWISE AI does not possess indoor hardware sensors; all indoor advice represents physical infiltration calculations.
2. **Ventilation Safety:** Guidance strictly warns against blocking combustion safety vents or permanently sealing living spaces.
3. **Active Transport Respiratory Warnings:** When outdoor AQI exceeds 100–150, AIRWISE AI alerts users that cycling or running increases inhaled respiratory volume by 300–500%, recommending enclosed filtered public transit (rail/bus) instead.
4. **Meteorological Honesty:** Clarifies that surface temperature and calm winds indicate stagnation, but cannot confirm upper-air temperature inversions without sounding data.
5. **Medical Disclaimers:** Guidance represents environmental intelligence and does not replace individualized clinical advice from a physician or pediatrician.

---

## Data Sources & Limitations

| Provider | Data Domain | Role | Limitations |
| :--- | :--- | :--- | :--- |
| **Open-Meteo Air Quality** | US AQI, PM2.5, PM10 | Primary global air quality & hourly forecast | Atmospheric model estimates; 1-hour resolution |
| **Open-Meteo Weather** | Wind, Humidity, Temp | Surface meteorological telemetry | Surface telemetry only; cannot confirm atmospheric inversions |
| **Google Air Quality API** | Real-time UAQI & pollutants | High-resolution provider (optional key) | Requires Google Maps Platform quota |
| **OpenStreetMap Nominatim** | Forward & Reverse Geocoding | Resolves coordinates and city names | Subject to public rate limits; cached server-side |
| **EEA & DEFRA** | Transport Emission Factors | Baseline for CO₂e commute modeling | Standardized passenger averages; varies by vehicle efficiency |

---

## Automated Test Suite & Verification

The project includes automated unit and integration test suites powered by **Vitest** with coverage reporting. External APIs (Gemini, Groq, Open-Meteo, Nominatim) are cleanly mocked to ensure deterministic execution without consuming live API quotas.

### Running Tests

Both `pnpm` (the declared package manager) and `npm` are supported:

```bash
# Run all automated tests
pnpm test          # or: npm test

# Run unit tests only
pnpm run test:unit # or: npm run test:unit

# Run integration tests only
pnpm run test:integration # or: npm run test:integration

# Run tests with code coverage analysis
pnpm run test:coverage    # or: npm run test:coverage
```

### Test Coverage Summary
- **Domain Tools & Calculations:** 16 unit tests covering coordinate validation, EPA AQI breakpoints, vulnerable profile routines, indoor ventilation safety, commute calculations (1.632 kg single journey / 3.264 kg daily round trip), stagnation analysis, and live vs. hypothetical AQI context separation.
- **Provider Orchestration:** 13 unit tests covering Gemini primary execution, mocked GoogleGenAI HTTP 429 quota handling, Groq LLaMA/Qwen tool execution loops, 60s circuit breaker verification, timeout cleanup, and tertiary deterministic degradation with zero technical leak guarantees.
- **Frontend Components:** 6 React component tests covering `EnvironmentalCalculator` calculations, verified transport mode factors (171, 35, 82, 0 g/km), and `SmartDailyPlannerTab` multi-factor window recommendations and plan export.
- **API Endpoints Integration:** 15 integration tests covering `/api/air-quality`, `/api/weather`, `/api/geocode` (both forward search and reverse geocoding), upstream network failure resilience (502 status handling), and `/api/air-quality-assistant` (including IP rate limiting and friendly exception fallback).
- **Total Test Suite:** 50 automated tests with 100% pass rate.

---

## Local Installation & Development

### Prerequisites
- Node.js 20.x or higher
- **pnpm** (declared package manager: `pnpm@12.3.4`) or **npm**

### Setup Steps
```bash
# 1. Clone the repository
git clone https://github.com/dseshukumar2008-hub/airwiseai.git
cd airwiseai

# 2. Install dependencies (using pnpm or npm)
pnpm install       # or: npm install

# 3. Create .env.local from the template
cp .env.example .env.local

# 4. Run the development server
pnpm dev           # or: npm run dev

# 5. Build for production
pnpm build         # or: npm run build

# 6. Open http://localhost:3000 in your browser
```

---

## Environment Variables

Configure the following variables in `.env.local` or the Vercel Project Settings:

```env
# Required for AI Assistant Functionality
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# Optional: Groq Model Selection (Defaults to qwen/qwen3.8-27b)
GROQ_MODEL=qwen/qwen3.8-27b

# Optional: High-precision Google Maps & Air Quality Services
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_client_maps_key_here
```

> **Security Note:** Never commit `.env.local` to source control. Secret keys (`GEMINI_API_KEY`, `GROQ_API_KEY`) are kept strictly server-side and never exposed via `NEXT_PUBLIC_` prefixes.

---

## Deployment Instructions

AIRWISE AI is optimized for zero-configuration deployment on **Vercel**:

1. Import the repository `dseshukumar2008-hub/airwiseai` into the Vercel Dashboard.
2. Select **Next.js** framework preset.
3. Configure environment variables (`GEMINI_API_KEY`, `GROQ_API_KEY`).
4. Trigger production deployment. Automatic CI builds will execute linting and asset compilation.
