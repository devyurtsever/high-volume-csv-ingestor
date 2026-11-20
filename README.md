# High-Volume CSV Customer Ingestion Service

High-volume, resilient, and stream-based customer CSV ingestion system capable of handling up to 1,000,000 records per file.

## 1. Overview

- **Architecture**: Monorepo with two decoupled processes (API Server + BullMQ Worker).
- **Core Principles**: Constant memory streaming (backpressure), transactional batch commits with checkpointing, database-level deduplication, deadlock mitigation.
- **Tech Stack**: Node.js 24, TypeScript (strict), Express, PostgreSQL (raw SQL with `pg`), Redis (BullMQ), Vitest.

## 2. Requirements

- Node.js >= 24.x
- Docker & Docker Compose
- PostgreSQL 16 & Redis 7 (or via Docker Compose)

## 3. Quick Start

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Start PostgreSQL & Redis
docker compose up -d

# 3. Install dependencies
npm install

# 4. Run database migrations
npm run migrate:up

# 5. Start API server
npm run dev

# 6. Start Worker process (separate terminal)
npm run dev:worker
```

## 4. Environment Variables

See [.env.example](file:///.env.example) for detailed environment configuration.

## 5. API Flow Example

_(To be completed in Phase 7)_

## 6. Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration
```

## 7. Project Structure

```text
├── src/
│   ├── api/            # Express controllers, routes, middlewares
│   ├── application/    # Use cases, interfaces, queue contracts
│   ├── domain/         # Core business logic, rules, pure validators
│   ├── infrastructure/ # Database, Redis, file storage implementations
│   ├── config/         # Environment validation with Zod
│   └── shared/         # Logger (Pino), utility types, errors
├── migrations/         # Up/down database migrations
├── tests/              # Unit and integration tests
├── docs/               # Architecture, API docs, performance reports
├── sample-data/        # Benchmark CSV data
└── scripts/            # Data generators and maintenance scripts
```
