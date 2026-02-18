# ChatBridge — Progress Checklist

Tracks remaining work to take ChatBridge from working extension to deployable product.
Last updated: 2026-02-18

**Legend:** `[x]` Done — `[-]` In progress — `[ ]` Not started

---

## Phase 1 — Finish Core Features

### 🔍 Smart Query Tab
- [x] UI shell (header, close button, intro text)
- [x] Suggestion chips (Key decisions, Unresolved questions, Code examples, Important dates)
- [x] Filter row (host, tag, date range)
- [x] Search input + button
- [x] Results display with expandable excerpts
- [x] Ask AI button + AI synthesis answer
- [x] Index Chats button
- [x] Provenance / source citations
- [ ] Performance audit — large index sets
- [ ] Edge cases: no results, partial index, stale index
- [ ] Accessibility pass (keyboard nav, ARIA labels)

### ◈ Agent Tab
- [ ] Header ("Agent Utilities" + close)
- [ ] Intro text
- [ ] Agent selection cards / buttons
- [ ] Agent output display area
- [ ] Loading skeleton states
- [ ] Error handling + retry
- [ ] Wire to background API calls
- [ ] Accessibility pass

### 🔧 Overall Fixes
- [ ] Deduplicate `call_openai` handler in background.js
- [ ] Replace `setInterval` in background.js with `chrome.alarms` (MV3 compliance)
- [ ] Remove dead `window` references in background.js service worker
- [ ] Add missing `router.huggingface.co` to manifest host_permissions
- [ ] Audit `idle` / `alarms` / `tabs` permission usage and add to manifest or remove calls
- [ ] Settings panel — verify all sections render and persist correctly
- [ ] Toast notification animations (slide-in / slide-out / auto-dismiss)
- [ ] Theme persistence across sessions
- [ ] Insight Finder modal polish and theme sync

---

## Phase 2 — Core AI Infrastructure

### 🤖 API & Token Management
- [ ] Token counting system — track usage per call and cumulative
- [ ] Token budget / cap per user session
- [ ] Display usage stats in settings or sidebar
- [ ] Rate limiting hardening — per-key, per-endpoint
- [ ] Fallback chain tuning (Gemini → HuggingFace → OpenAI)

### ☁️ Cloud & Hosting
- [ ] Cloud server connection with auth + encryption
- [ ] Serverless hosting exploration (Cloudflare Workers / Vercel Edge)
- [ ] Cloudflare environment setup (wrangler config, secrets, routes)
- [ ] API gateway / proxy to protect raw keys from client

### 📐 API Planning & Optimization
- [ ] Prompt size optimization — trim context to stay under token limits
- [ ] Response caching strategy (TTL, invalidation)
- [ ] Batch request support where applicable
- [ ] API versioning plan for future endpoints

---

## Phase 3 — Reliability & Engineering Quality

### 🧪 Testing
- [ ] Unit tests for core utilities (storage, adapters, normalizeMessages)
- [ ] Integration tests for scan → transform → restore flow
- [ ] Edge case tests (empty chats, single message, 1000+ messages)
- [ ] Cross-browser smoke tests (Chrome stable, Beta, Canary)
- [ ] Adapter regression tests per platform

### 🛡️ Error Handling
- [ ] Global error boundary in content script
- [ ] Background service worker crash recovery
- [ ] Empty state handling (no conversations, no API key, no results)
- [ ] User-facing error banner with retry + report
- [ ] Structured error logging (severity, context, stack)

### ⚡ Performance
- [ ] Load balancing / request distribution for higher traffic
- [ ] Performance profiling (scan time, UI render, API latency)
- [ ] Lazy-load heavy views (Smart Query, Agent, Knowledge Graph)
- [ ] Debounce / throttle frequent DOM operations
- [ ] Memory leak audit on long-running tabs

---

## Phase 4 — Analytics & Product Intelligence

### 📊 Analytics
- [ ] Privacy-respecting analytics integration (opt-in only)
- [ ] Track feature usage (scan, summarize, rewrite, translate, sync tone)
- [ ] Monitor token consumption trends per model
- [ ] Observe user behavior patterns (which platforms, which transforms)
- [ ] Dashboard or export for usage data

### 📈 Instrumentation
- [ ] API call success / failure rate tracking
- [ ] Latency percentiles (p50, p95, p99)
- [ ] Error rate monitoring with alerting
- [ ] Session duration and engagement metrics

---

## Phase 5 — UX & Product Polish

### 🎨 Interface
- [ ] Snappy responsive UX — audit all interactions for lag
- [ ] Skeleton loaders for every async view
- [ ] Micro-animations (fade-in, slide-up, scale-pop)
- [ ] Focus-visible outlines + high-contrast mode
- [ ] ARIA live regions for screen readers
- [ ] Mobile-friendly sidebar layout (if applicable)

### 🖼️ Branding
- [ ] Logo finalization (avatar, toolbar icon, options page)
- [ ] Consistent icon set across all views
- [ ] Extension store assets (screenshots, promo tiles, description)

### 🚀 Onboarding
- [ ] On-install explainer page (welcome flow)
- [ ] First-scan guided walkthrough
- [ ] Tooltip hints for new users
- [ ] API key setup wizard with validation

---

## Phase 6 — Productization

### 🔐 Auth & Login
- [ ] Login page UI
- [ ] Auth provider integration (Google / GitHub OAuth)
- [ ] Session management (token refresh, logout)
- [ ] Account settings page

### 💳 Token Management & Freemium
- [ ] Token quota system (free tier limits, paid tiers)
- [ ] Usage meter in sidebar / popup
- [ ] Upgrade prompt when quota approached
- [ ] Payment integration (Stripe or equivalent)
- [ ] Server-side quota enforcement

### 📦 Ship It
- [ ] Chrome Web Store listing preparation
- [ ] Privacy policy + terms of service pages
- [ ] Version bump and changelog
- [ ] CI/CD pipeline (lint, test, build, package .crx)
- [ ] Staged rollout plan (beta → public)

---

_Keep this file updated as items are completed. Mark `[-]` when actively working on something._
