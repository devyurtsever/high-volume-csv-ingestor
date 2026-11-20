# High-Volume CSV Customer Ingestion Service

High-volume, resilient, and stream-based customer CSV ingestion system designed to scale up to 1,000,000 records per file.

## 1. Overview

- **Architecture**: Modular Multi-Process Architecture (Single Repository with decoupled API and Worker processes).
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

See [.env.example](./.env.example) for detailed environment configuration.

## 5. CSV File & Column Specifications

| Column Name      | Type / Format Rule                                                                  | Example             | Required |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------- | -------- |
| **Customer ID**  | Alphanumeric, dash, underscore, dot (`^[a-zA-Z0-9_.-]{1,100}$`)                     | `CUST-1001`         | Yes      |
| **First Name**   | String (1-100 chars, no HTML tags/scripts, not purely numeric)                      | `Ahmet Can`         | Yes      |
| **Last Name**    | String (1-100 chars, no HTML tags/scripts, not purely numeric)                      | `Yılmaz`            | Yes      |
| **National ID**  | 11 digits, Republic of Turkey TCKN checksum algorithm                               | `10000000146`       | Yes      |
| **Email**        | Valid email address, lowercase normalized, max 255 chars                            | `ahmet@example.com` | Yes      |
| **Phone**        | Turkish mobile number (`+905...`, `05...`, `5...` -> normalized to `+905XXXXXXXXX`) | `+90 555 123 4567`  | Yes      |
| **Birth Date**   | Strict `YYYY-MM-DD`, valid calendar date, year >= 1900, not in future               | `1992-06-15`        | Yes      |
| **Created Date** | Strict `YYYY-MM-DD`, not in future, on or after birth date (`>= birth_date`)        | `2024-01-10`        | Yes      |

### Tolerances & Constraints

- **Delimiters**: Supports both standard comma (`,`) and Turkish Excel semicolon (`;`).
- **UTF-8 BOM**: `\uFEFF` prefix is automatically detected and stripped from the first header.
- **Case & Space Insensitivity**: Headers are case-insensitive and spaces/hyphens are normalized to underscores (e.g. `Customer ID` -> `customer_id`).
- **Schema Strictness**: All 8 columns are required. Duplicate columns or unexpected extra columns are rejected.
- **Control Character Protection**: NUL (`\0`) and illegal ASCII control characters are rejected before database insertion to prevent transaction aborts.

## 6. Testing & Quality Checks

```bash
# Run all tests (unit + integration against isolated test database)
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Typecheck test files and source code
npm run typecheck

# Code formatting & linting
npm run format:check
npm run lint
```

## 7. Project Structure

```text
├── src/
│   ├── api/            # Express controllers, routes, middlewares
│   ├── application/    # Use cases, interfaces, queue contracts
│   ├── domain/         # Core business logic, rules, pure validators (Zero I/O)
│   ├── infrastructure/ # Database, Redis, file storage implementations
│   ├── config/         # Environment validation with Zod (Fail-fast)
│   └── shared/         # Logger (Pino), utility types, errors
├── migrations/         # Up/down database migrations (node-pg-migrate)
├── tests/              # Unit and integration tests
├── docs/               # Architecture, API docs, performance reports
├── sample-data/        # Benchmark CSV data
└── scripts/            # Data generators and maintenance scripts
```
