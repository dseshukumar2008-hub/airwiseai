'use client'

import { useId, useRef, useState, useEffect, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  ArrowRight,
  Bot,
  Compass,
  CornerDownLeft,
  Info,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  Zap,
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
  latitude?: number | null
  longitude?: number | null
  aqi: number | null
  pm25: number | null
  pm10: number | null
  readingLabel: string
  forecast?: Record<number, ForecastItem> | null
  weather?: WeatherData | null
  audience: string
  setAudience: (val: string) => void
  activity: string
  setActivity: (val: string) => void
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  modelBadge?: string | null
  timestamp: string
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

const suggestedPrompts = [
  'Is it safe for children to play soccer outside today?',
  'When should I open windows to ventilate my apartment?',
  'What are the emission and health differences between driving vs. taking the metro?',
  'Give me a low-emission routine based on today’s pollution forecast.',
]

function renderCleanMarkdown(content: string): string {
  if (!content) return ''
  // 1. Unescape any backslashes before markdown formatting symbols
  const unescaped = content
    .replace(/\\([*_{}[\]()#+\-.!~`>|])/g, '$1')
    .replace(/\\\\/g, '\\')

  // 2. Parse Markdown to HTML
  const rawHtml = marked.parse(unescaped, { async: false, breaks: true }) as string

  // 3. Sanitize HTML via DOMPurify in browser environment to protect against XSS
  if (typeof window !== 'undefined' && DOMPurify.sanitize) {
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'b', 'i', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'hr', 'span',
      ],
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
    })
  }

  return rawHtml
}

export function AIAirCoachTab({
  locationName,
  latitude,
  longitude,
  aqi,
  pm25,
  pm10,
  readingLabel,
  forecast,
  weather,
  audience,
  setAudience,
  activity,
  setActivity,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputQuery, setInputQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeModel, setActiveModel] = useState<string | null>(null)

  const audienceSelectId = useId()
  const activitySelectId = useId()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(queryText?: string) {
    const textToSend = (queryText ?? inputQuery).trim()
    if (!textToSend || loading) return

    setInputQuery('')
    setError('')
    setLoading(true)

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMessage])

    // Create placeholder assistant message for streaming
    const assistantMsgId = `assistant-${Date.now()}`
    const placeholderAssistant: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      modelBadge: activeModel || 'gemini-2.5-flash',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages((prev) => [...prev, placeholderAssistant])

    try {
      const response = await fetch('/api/air-quality-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationName,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          aqi: aqi ?? 50,
          pm25,
          pm10,
          readingLabel,
          audience,
          activity,
          forecast: forecast ?? null,
          weather: weather ?? null,
          userQuery: textToSend,
          stream: true,
        }),
      })

      const modelHeader = response.headers.get('X-AI-Model')
      const providerHeader = response.headers.get('X-AI-Provider')
      const isFallbackHeader = response.headers.get('X-Is-Fallback') === 'true'
      const providerNoticeHeader = response.headers.get('X-Provider-Notice')
        ? decodeURIComponent(response.headers.get('X-Provider-Notice')!)
        : null

      let badgeLabel = modelHeader || 'gemini-2.5-flash'
      if (providerHeader === 'gemini') {
        badgeLabel = 'Gemini Active · gemini-2.5-flash'
      } else if (providerHeader === 'groq') {
        badgeLabel = `Groq Active (Fallback) · ${modelHeader || 'qwen3.8-27b'}`
      } else if (providerHeader === 'deterministic') {
        badgeLabel = 'Deterministic Fallback'
      }

      setActiveModel(badgeLabel)
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, modelBadge: badgeLabel } : m))
      )

      if (providerNoticeHeader) {
        setError(providerNoticeHeader)
      }

      if (!response.ok) {
        let errMessage = 'The AI Air Quality Assistant is temporarily unavailable.'
        let fallbackGuidance: string | null = null
        try {
          const errData = await response.json()
          errMessage = errData.error || errMessage
          fallbackGuidance = errData.fallbackGuidance || null
        } catch {
          // ignore parsing error
        }

        if (fallbackGuidance) {
          // Set deterministic fallback directly into the assistant message bubble
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: fallbackGuidance!,
                    modelBadge: 'Deterministic Engine (Fallback)',
                  }
                : m
            )
          )
          setError(errMessage)
          return
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

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, content: accumulated } : m))
          )
        }
      } else {
        const fallbackData = await response.json()
        const fullText = fallbackData.recommendation || ''
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullText } : m))
        )
      }
    } catch (cause) {
      const errMsg =
        cause instanceof Error
          ? cause.message
          : 'Could not generate AI guidance. Please try again or consult the verified tabs below.'
      setError(errMsg)
      // Remove empty placeholder if failed
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId || m.content.length > 0))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="assistant-section-prominent">
      {/* Prominent Header */}
      <div className="assistant-hero">
        <div className="assistant-hero-text">
          <div className="assistant-badge-tag">
            <Sparkles size={13} />
            <span>INTELLIGENT ENVIRONMENTAL COPILOT · GOOGLE GEMINI 2.5 FLASH</span>
          </div>
          <h2 className="assistant-headline">
            Your Personal AI Air Quality Assistant
          </h2>
          <p className="assistant-hero-desc">
            Ask about your local air quality, healthier routines, indoor protection and sustainable choices.
          </p>
        </div>

        <div className="assistant-telemetry-badge">
          <div className="telemetry-item">
            <span className="telemetry-label">Monitored Area</span>
            <strong className="telemetry-val">{locationName ?? 'Awaiting coordinates'}</strong>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">Active Scale</span>
            <strong className="telemetry-val highlight">
              {aqi !== null ? `US AQI ${aqi}` : 'Offline'}
            </strong>
          </div>
        </div>
      </div>

      {/* Compact Personalization Panel */}
      <div className="assistant-context-panel">
        <div className="assistant-context-toolbar">
          <div className="context-select-group">
            <label htmlFor={audienceSelectId}>
              <UserCheck size={13} /> Profile:
            </label>
            <select
              id={audienceSelectId}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              {audienceOptions.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="context-select-group">
            <label htmlFor={activitySelectId}>
              <Compass size={13} /> Priority:
            </label>
            <select
              id={activitySelectId}
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
            >
              {activityOptions.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Source Attribution Note */}
        <div className="context-source-badge">
          <Info size={11} />
          <span>{readingLabel}</span>
        </div>
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="assistant-suggestions-bar">
        <span className="suggestions-label">Suggested:</span>
        <div className="suggestions-chips-scroll">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="suggestion-chip"
              onClick={() => handleSend(prompt)}
              disabled={loading}
            >
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Conversation Stream Box */}
      <div className="assistant-chat-window" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-welcome-state">
            <Bot size={36} className="welcome-bot-icon" />
            <h3>How can AIRWISE AI assist you today?</h3>
            <p>
              Type a custom question below or click any of the suggested prompts above to receive verified, tool-grounded air quality guidance.
            </p>
          </div>
        ) : (
          <div className="chat-messages-container">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-bubble-row ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`}
              >
                <div className="chat-avatar">
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="chat-bubble-content">
                  <div className="chat-bubble-meta">
                    <strong>{msg.role === 'user' ? 'You' : 'AIRWISE Copilot'}</strong>
                    {msg.modelBadge && <span className="model-pill">{msg.modelBadge}</span>}
                    <time>{msg.timestamp}</time>
                  </div>
                  <div className="chat-bubble-body">
                    {msg.content ? (
                      msg.role === 'assistant' ? (
                        <div
                          className="markdown-prose"
                          dangerouslySetInnerHTML={{
                            __html: renderCleanMarkdown(msg.content),
                          }}
                        />
                      ) : (
                        <div className="user-prose whitespace-pre-wrap">{msg.content}</div>
                      )
                    ) : (
                      <div className="chat-thinking-indicator">
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Consulting verified environmental tools & synthesis…</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="assistant-error-banner" role="alert">
          <ShieldAlert size={18} />
          <div className="error-body">
            <strong>Assistant Notice:</strong> {error}
          </div>
        </div>
      )}

      {/* Message Input Form */}
      <form
        className="assistant-input-box"
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about local smog, windows, school transit, or emissions..."
          disabled={loading}
          aria-label="Ask your air quality assistant"
        />
        <button
          type="submit"
          className="btn-send-message"
          disabled={loading || !inputQuery.trim()}
          aria-label="Send message"
        >
          {loading ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <>
              <span>Send</span>
              <Send size={15} />
            </>
          )}
        </button>
      </form>
    </div>
  )
}
