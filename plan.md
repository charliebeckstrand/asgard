# Vidar: Security Monitoring Service - Implementation Plan

## Overview
Vidar is a security monitoring microservice that detects suspicious activity (brute force, registration spam, credential stuffing), enforces bans, and optionally integrates an AI assistant for threat analysis.

## Architecture
- **Event ingestion**: Direct HTTP API for real-time events + Ratatoskr subscription for async events
- **Rule engine**: Predefined rules that evaluate ingested events and trigger actions
- **Ban enforcement**: PostgreSQL-backed IP ban list with expiration, queryable by other services
- **AI placeholder**: Interface for plugging in an AI provider later
- **Port**: 3002, prefix: `/sentinel`

## Files to Create

### 1. Service scaffolding
- `services/vidar/package.json`
- `services/vidar/tsconfig.json`
- `services/vidar/tsup.config.ts`
- `services/vidar/.env.example`
- `services/vidar/Dockerfile`

### 2. Core source files
- `services/vidar/src/index.ts` — server bootstrap
- `services/vidar/src/app.ts` — OpenAPIHono app factory
- `services/vidar/src/lib/env.ts` — Zod env validation
- `services/vidar/src/lib/db.ts` — mimir pool wrapper
- `services/vidar/src/lib/openapi.ts` — OpenAPI config
- `services/vidar/src/lib/schemas.ts` — all Zod/OpenAPI schemas

### 3. Middleware
- `services/vidar/src/middleware/api-key.ts` — API key auth for Vidar endpoints

### 4. Routes (all under /sentinel)
- `services/vidar/src/routes/health.ts` — `GET /health`
- `services/vidar/src/routes/events.ts` — `POST /events` (ingest security events)
- `services/vidar/src/routes/check-ip.ts` — `GET /check-ip` (is IP banned?)
- `services/vidar/src/routes/bans.ts` — `GET /bans`, `POST /bans`, `DELETE /bans/:ip`
- `services/vidar/src/routes/threats.ts` — `GET /threats` (list detected threats)
- `services/vidar/src/routes/rules.ts` — `GET /rules` (list rules + config)
- `services/vidar/src/routes/analyze.ts` — `POST /analyze` (AI analysis placeholder)

### 5. Services (business logic)
- `services/vidar/src/services/events.ts` — store events, trigger rule evaluation
- `services/vidar/src/services/bans.ts` — CRUD for bans, expiration check
- `services/vidar/src/services/threats.ts` — threat queries
- `services/vidar/src/services/rules.ts` — rule engine with predefined rules
- `services/vidar/src/services/analyzer.ts` — AI analyzer interface + placeholder

### 6. Database
- `services/vidar/migrations/0001_create_tables.sql` — security_events, bans, threats, rules_config

### 7. Heimdall integration
- `services/heimdall/src/lib/vidar.ts` — client helper to report events + check bans
- `services/heimdall/src/middleware/vidar.ts` — middleware that checks ban list before processing
- Update `services/heimdall/src/app.ts` — add vidar middleware
- Update `services/heimdall/src/routes/login.ts` — report failed/successful logins
- Update `services/heimdall/src/routes/register.ts` — report registrations
- Update `services/heimdall/src/lib/env.ts` — add VIDAR_URL env var

## Predefined Rules
1. **brute_force** — 10 failed logins from same IP in 15 min → ban 1 hour
2. **registration_spam** — 5 registrations from same IP in 30 min → ban 24 hours
3. **rate_limit_abuse** — 20 rate-limit hits from same IP in 10 min → ban 2 hours
4. **credential_stuffing** — 15 failed logins across 10+ distinct accounts from same IP in 30 min → ban 24 hours

## Database Schema (vidar schema)

```sql
CREATE SCHEMA IF NOT EXISTS vidar;

CREATE TABLE vidar.security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip VARCHAR(45) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    service VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vidar.bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip VARCHAR(45) NOT NULL,
    reason TEXT NOT NULL,
    rule_id VARCHAR(100),
    created_by VARCHAR(100) NOT NULL DEFAULT 'system',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vidar.threats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    ip VARCHAR(45) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    action_taken VARCHAR(100),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Implementation Order
1. Service scaffolding (package.json, tsconfig, etc.)
2. Database migration
3. Core lib files (env, db, openapi, schemas)
4. Middleware (api-key)
5. Services (bans → events → rules → threats → analyzer)
6. Routes (health → check-ip → bans → events → threats → rules → analyze)
7. App factory + index
8. Heimdall integration (vidar client, middleware, route updates)
