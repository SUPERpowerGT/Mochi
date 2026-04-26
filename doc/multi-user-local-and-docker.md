# Multi-User Local Isolation And Docker Services

## What This Adds

This phase introduces two concrete foundations:

- local user isolation inside the VS Code extension through identity-scoped memory storage
- a minimal Docker Compose deployment with PostgreSQL and an identity API service
- summary-level cross-device session sync through the identity API

## Local User Isolation

The extension now supports a development-only profile switch command:

- `Local Agent: Switch User Profile`
- `Local Agent: Switch Device Profile`

Built-in local profiles:

- `Alice`
- `Bob`
- `Charlie`

Each profile is stored under a separate memory root:

```text
<extension global storage>/tenants/<tenantId>/users/<userId>/devices/<deviceId>/
```

This isolates:

- session history
- task state
- user preferences
- workspace memory

## Cross-Device Session Continuity

Mochi now supports summary-level cross-device continuity for the same user.

What is synced:

- session summary
- last prompt
- active task summary and status
- latest run summary
- user preferences
- workspace detection facts

What is not synced:

- full raw chat history
- full source code
- full editor buffer contents

How it works:

1. after a run completes, Mochi uploads a summary snapshot to the identity API
2. when the same user opens Mochi on another device profile for the same workspace key, Mochi hydrates local memory from the latest synced snapshot
3. the next prompt can continue from that summary context instead of starting from an empty state

Configuration:

- default API base URL: `http://127.0.0.1:4000`
- override with environment variable: `MOCHI_IDENTITY_API_URL`

Built-in device profiles:

- `This Machine`
- `Lab PC`
- `Dorm Laptop`

## Docker Services

The repository now includes:

- `postgres`: PostgreSQL for tenant and user data
- `identity-api`: a small Node.js service for profile lookup and health checks

Start both services:

```bash
docker compose up --build
```

Useful endpoints:

- `GET http://localhost:4000/health`
- `GET http://localhost:4000/api/v1/profiles`
- `GET http://localhost:4000/api/v1/profiles/alice`
- `GET http://localhost:4000/api/v1/devices`
- `GET http://localhost:4000/api/v1/devices?userId=alice`
- `GET http://localhost:4000/api/v1/devices/lab-pc`
- `GET http://localhost:4000/api/v1/session-sync/latest?tenantId=local-dev&userId=alice&workspaceKey=workspace-sync:mochi`
- `POST http://localhost:4000/api/v1/session-sync/snapshot`

## Why This Is The First Step

This phase does not yet move Mochi runtime execution to the cloud.
It creates the minimum isolation and deployment surface needed before adding:

- real authentication
- tenant membership checks
- session sync
- trace uploads
- shared knowledge services