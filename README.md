# cybersaarthi

**Sovereign Civic Shield for India DPI — cybercrime triage on Cloudflare Workers & D1.**

[![CI](https://github.com/Sandeep-Hipparagi/cybersaarthi/actions/workflows/ci.yml/badge.svg)](https://github.com/Sandeep-Hipparagi/cybersaarthi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## Product Walkthrough & Architecture Demo

https://github.com/Sandeep-Hipparagi/cybersaarthi/releases/download/media-v1/brag.mp4

[![cybersaarthi demo](assets/media/preview.webp)](https://github.com/Sandeep-Hipparagi/cybersaarthi/releases/tag/media-v1)

---

## Overview

cybersaarthi is a sovereign civic AI system for India's Digital Public Infrastructure (DPI). It provides a cybercrime triage pipeline built on Cloudflare Workers and D1 (SQLite at the edge), featuring:

- **19 API routes** with 15/15 fetch→route contract verification
- **Zero raw SQL interpolation** — Drizzle ORM parameterized binds only
- **Voice-assisted defect audit** with production-gated demo credentials
- **Forged audio integrity rejection** via validator
- **next 16.4.6** — critical+high CVEs cleared, vinext build passing

## Architecture

```
Citizen Voice/Report → Cloudflare Worker (Edge) → D1 SQLite (Edge) → Response Schema Validation → Voice Assist / Defect Audit
```

- **Edge Compute**: Cloudflare Workers for zero cold starts
- **Database**: D1 (SQLite at the edge) with Drizzle ORM
- **Schema Validation**: `CyberSaarthiResponse` schema check on every response
- **Security**: next 16.4.6, critical+high CVEs cleared, vinext build ✓

## Quickstart

```bash
# Clone and install
git clone https://github.com/Sandeep-Hipparagi/cybersaarthi.git
cd cybersaarthi
npm install

# Development
npm run dev

# Build
npm run build

# Type check
npm run typecheck

# Tests
npm test
```

## API Routes (19 routes, 15/15 fetch→route contract)

| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/reports | Submit cybercrime report |
| GET | /api/reports/:id | Get report details |
| POST | /api/audio/upload | Upload audio for verification |
| GET | /api/audio/:id/verify | Verify audio integrity |
| POST | /api/defects | Submit defect |
| GET | /api/defects/:id | Get defect details |
| POST | /api/voice/assist | Voice-assisted defect audit |
| GET | /api/voice/status | Voice assist status |
| GET | /api/analytics | Analytics dashboard |
| POST | /api/webhook | Webhook endpoint |
| GET | /api/health | Health check |
| GET | /api/version | Version info |

## Security & Verification Posture

- **20/20 workflow tests passing**
- **19 routes · 15/15 fetch→route contract verified**
- **0 raw SQL interpolation** — Drizzle ORM parameterized binds only
- **next 16.4.6** — critical+high CVEs cleared
- **vinext build ✓**
- **Zero secrets** in the tree
- **CORS runs credential-free**

## Development

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Test
npm test

# Build
npm run build
```

## License

MIT — see [LICENSE](LICENSE).