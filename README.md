# High-Volume Customer CSV Ingestion Service

### Türkçe Özet (Quick Summary in Turkish)

Bu proje, **1.000.000 satıra kadar** müşteri CSV dosyalarını sabit bellek tüketimi (bounded memory) ve veri bütünlüğü garantisiyle işleyen asenkron bir mikroservistir.

- **Hızlı Başlatma**: `cp .env.example .env && docker compose up --build` komutuyla PostgreSQL, Redis, Migrations, API ve Worker servisleri tek seferde ayağa kalkar.
- **Mimarinin Temeli**: Express ile dosya kabul edilir (`202 Accepted`), Redis/BullMQ ile arka plana aktarılır, Worker `for-await` doğal backpressure akışıyla satırları 2.000'lik batch'ler halinde okur.
- **Veritabanı & Mükerrer Yönetimi**: PostgreSQL `UNNEST` ve hedefsiz `ON CONFLICT DO NOTHING` ile hem `customer_id` hem `national_id` tekillikleri atomik olarak korunur; sayaçlar ve `last_committed_row` checkpoint'i aynı transaction'da kaydedilir.
- **1M Satır Sonucu**: 512 MiB limitli Docker container ortamında 1.000.000 satır **49.84 saniyede** (~20.066 satır/sn) işlenmiş, `docker stats` ile örneklenen en yüksek bellek **≈52 MiB** (%10.1 kapasite kullanımı) ölçülmüştür.

---

## 1. Overview & Key Capabilities

- **Bounded Memory Ingestion (Natural Backpressure)**: Ingests arbitrary file sizes (tested up to 1,000,000 rows / ~98 MB) using Node.js stream backpressure. Live container worker consumes only **≈52 MiB peak RAM** (sampled via `docker stats` under a 512 MiB cgroup ceiling).
- **Decoupled Architecture**: High-speed Express HTTP ingestion decoupled from the processing pipeline via BullMQ and Redis (`appendonly yes`).
- **Transactional Batch Checkpointing**: Inserts customer records in batches of 2,000 using PostgreSQL `UNNEST` and target-less `ON CONFLICT DO NOTHING RETURNING source_row_number`. Each batch transaction commits records, row errors, counters, and the `last_committed_row` checkpoint atomically.
- **Resilient Crash Recovery**: If a worker crashes mid-import, subsequent processing automatically resumes from `last_committed_row` without duplicate insertions or corrupted counters. BullMQ stalled job detection re-queues interrupted work cleanly.
- **Deadlock Mitigation**: Sorts batch rows by `ORDER BY national_id, source_row_number` in SQL to enforce identical lock acquisition ordering across concurrent imports, paired with automated `40P01` deadlock retries.
- **Deterministic Keyset Pagination**: Error listings use keyset cursor pagination (`row_number > cursor ORDER BY row_number ASC LIMIT limit + 1`) guaranteeing O(log n) B-Tree index seek performance independent of page depth.
- **Security & Privacy**: Timing-safe API Key authentication, IDOR isolation (404 masking), KVKK/PII sanitization in application logs, and CSV Formula Injection (DDE) mitigation.

---

## 2. Requirements

- **Node.js**: `>= 24.x` (LTS recommended, see `.nvmrc`)
- **Docker & Docker Compose**: Docker Desktop or Docker Engine `>= 24`
- **PostgreSQL**: `16` (included in Compose)
- **Redis**: `7` (included in Compose)

---

## 3. Quick Start

### Mode A: Full Docker Execution (Recommended for Evaluation)

Run the entire stack (PostgreSQL, Redis, Auto-Migrations, Express API, and BullMQ Worker) in isolated containers with a single command:

```bash
# 1. Copy environment configuration
cp .env.example .env

# 2. Build and start all services
docker compose up --build
```

The services will start with the following ports exposed:

- **API Server**: `http://localhost:3000` (Swagger UI at `http://localhost:3000/docs/`)
- **PostgreSQL**: `localhost:5433` (Database: `customer_import_db`)
- **Redis**: `localhost:6380`

To stop all services:

```bash
docker compose down
```

---

### Mode B: Local Development Execution

To run the API and Worker processes directly on your host machine while using Docker for infrastructure dependencies, start **only** PostgreSQL and Redis to avoid port 3000 collisions:

```bash
# 1. Copy environment configuration
cp .env.example .env

# 2. Start PostgreSQL and Redis containers in background
docker compose up -d postgres redis

# 3. Install npm dependencies
npm install

# 4. Run database migrations for development database
npm run migrate:up

# 5. Initialize the isolated test database
npm run migrate:test

# 6. Start API server in development mode (Terminal 1)
npm run dev

# 7. Start Worker process in development mode (Terminal 2)
npm run dev:worker
```

> [!NOTE]
> Running `docker compose up -d` without specifying `postgres redis` will also start the containerized `api` service on port 3000, causing a port collision (`EADDRINUSE`) if you subsequently execute `npm run dev` on the host. Always specify `docker compose up -d postgres redis` for local development.

---

## 4. Running Tests & Quality Checks

The test suite runs against an isolated test database (`customer_import_test`) to ensure production data is never touched or polluted.

### Prerequisites

Ensure the Docker infrastructure containers are running and the test database schema is migrated:

```bash
# Ensure PostgreSQL (port 5433) and Redis (port 6380) are active
docker compose up -d postgres redis

# Apply schema migrations to the test database
npm run migrate:test
```

### Test Commands

```bash
# Run all unit and integration tests (141 tests)
npm test

# Run unit tests only (Domain pure rules, TCKN checksum, header parsing, sanitizers)
npm run test:unit

# Run integration tests only (API endpoints, worker processing, concurrency & crash recovery)
npm run test:integration

# Run tests with code coverage report (V8 engine)
npm run test:coverage

# TypeScript strict type checking (including test files)
npm run typecheck

# Code formatting and linting
npm run format:check
npm run lint
```

---

## 5. Environment Variables

All configuration is centralized and validated at application startup using a fail-fast Zod schema (`src/config/env.ts`).

| Variable                   | Default Value                                                    | Type      | Description                                                                    |
| :------------------------- | :--------------------------------------------------------------- | :-------- | :----------------------------------------------------------------------------- |
| `NODE_ENV`                 | `development`                                                    | `enum`    | Runtime mode: `development`, `test`, or `production`.                          |
| `PORT`                     | `3000`                                                           | `number`  | Port on which the Express HTTP server listens.                                 |
| `HOST`                     | `0.0.0.0`                                                        | `string`  | Bind interface address for HTTP server.                                        |
| `LOG_LEVEL`                | `info`                                                           | `enum`    | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`). |
| `DATABASE_URL`             | `postgres://postgres:postgres@localhost:5433/customer_import_db` | `string`  | PostgreSQL connection URI for the application pool.                            |
| `DB_MAX_CONNECTIONS`       | `20`                                                             | `number`  | Maximum connection pool size for PostgreSQL client.                            |
| `REDIS_URL`                | `redis://localhost:6380`                                         | `string`  | Redis connection URI for BullMQ job queue and locking.                         |
| `UPLOAD_DIR`               | `./uploads`                                                      | `string`  | Filesystem directory for staged multipart CSV uploads.                         |
| `MAX_FILE_SIZE_BYTES`      | `524288000`                                                      | `number`  | Maximum allowed file upload size (500 MB).                                     |
| `API_KEY`                  | `dev-local-key-change-me`                                        | `string`  | Secret key for `X-API-Key` authentication header.                              |
| `WORKER_CONCURRENCY`       | `2`                                                              | `number`  | Number of simultaneous BullMQ jobs processed per worker.                       |
| `BATCH_SIZE`               | `2000`                                                           | `number`  | Number of CSV rows processed per database transaction batch.                   |
| `DELETE_FILE_AFTER_IMPORT` | `false`                                                          | `boolean` | Whether to automatically unlink the staged CSV file upon completion.           |

---

## 6. Import Job Lifecycle & Statuses

Every import job progresses through a strictly defined lifecycle stored in `import_jobs.status`:

```text
[POST /api/v1/imports]
          │
          ▼
      PENDING ──────────────────────────┐ (Redis enqueue failure / dual-write guard)
          │                             │
          ▼                             │
     PROCESSING ────────────────────────┤ (Unrecoverable failure / zero insertions)
          │                             │
          │                             ▼
          │                           FAILED
     ┌────┴─────────────────────────────┐
     ▼                                  ▼
[All rows valid]              [Mixed valid & errors]
     │                                  │
     ▼                                  ▼
 COMPLETED                      PARTIALLY_COMPLETED
```

| Status                    | Trigger Condition / Meaning                                                                                                                                                                                                                                                                                                                                                                                                              |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`PENDING`**             | File uploaded and stored to disk, initial database job record created, job enqueued to BullMQ. Worker has not yet acquired the job.                                                                                                                                                                                                                                                                                                      |
| **`PROCESSING`**          | Worker has claimed the job lock, streaming CSV parser is active, and batches are being committed with checkpoints.                                                                                                                                                                                                                                                                                                                       |
| **`COMPLETED`**           | Processing completed successfully with **100% success** (`success_rows > 0` and `failed_rows === 0` and `duplicate_rows === 0`).                                                                                                                                                                                                                                                                                                         |
| **`PARTIALLY_COMPLETED`** | Processing completed where at least one customer was inserted (`success_rows > 0`) **and** at least one row failed validation or was a duplicate (`failed_rows > 0 \|\| duplicate_rows > 0`).                                                                                                                                                                                                                                            |
| **`FAILED`**              | **Case A (Zero Insertions)**: All rows in the file failed validation or were duplicates (`success_rows === 0` and `total_rows > 0`).<br>**Case B (Unrecoverable Error)**: The file was physically missing, corrupted/unparseable CSV syntax, or database connection collapsed across all retry attempts.<br>**Case C (Dual-Write Failure)**: Redis queue was down at upload time; job is marked `FAILED` before returning 503 to client. |

---

## 7. Row-Level Error Codes (Evaluation Specification)

When an individual CSV record fails validation or conflicts with existing records, row errors are logged into the `import_row_errors` table with normalized error codes (13 row-level codes):

| Error Code                       | Category   | Cause / Validation Rule                                                                                                                                                                                                  |
| :------------------------------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQUIRED_FIELD_MISSING`         | Validation | One or more of the 8 mandatory columns are empty or contain only whitespace.                                                                                                                                             |
| `INVALID_CONTROL_CHARACTER`      | Validation | Input contains NUL (`\0`) or illegal ASCII control characters that would corrupt database transactions.                                                                                                                  |
| `INVALID_CUSTOMER_ID`            | Validation | Customer ID is longer than 100 characters or contains characters outside `^[a-zA-Z0-9_.-]+$`.                                                                                                                            |
| `INVALID_FIRST_NAME`             | Validation | First name is empty, exceeds 100 characters, is purely numeric, or contains HTML tags/scripts.                                                                                                                           |
| `INVALID_LAST_NAME`              | Validation | Last name is empty, exceeds 100 characters, is purely numeric, or contains HTML tags/scripts.                                                                                                                            |
| `INVALID_NATIONAL_ID`            | Validation | National ID fails the 11-digit Republic of Turkey TCKN checksum algorithm (first digit cannot be 0, digit 10 verification formula, digit 11 verification formula).                                                       |
| `INVALID_EMAIL`                  | Validation | Email address does not conform to pragmatic format check (`user@domain.tld`) or exceeds 255 characters.                                                                                                                  |
| `INVALID_PHONE`                  | Validation | Phone number cannot be parsed as a valid Turkish mobile number (`+905...`, `05...`, `5...`).                                                                                                                             |
| `INVALID_BIRTH_DATE`             | Validation | Birth date is not a valid ISO date (`YYYY-MM-DD`), year is prior to 1900, or invalid calendar date (e.g. `2024-02-31`).                                                                                                  |
| `INVALID_CREATED_DATE`           | Validation | Created date is not a valid ISO date (`YYYY-MM-DD`).                                                                                                                                                                     |
| `DATE_IN_FUTURE`                 | Validation | Birth date or created date is in the future relative to current server date.                                                                                                                                             |
| `CREATED_DATE_BEFORE_BIRTH_DATE` | Validation | Customer account creation date is chronologically before their birth date (`created_date < birth_date`). Same-day creation is permitted.                                                                                 |
| `DUPLICATE_RECORD`               | Conflict   | **Intra-file duplicate**: Customer ID or National ID occurred earlier within the same CSV file.<br>**Database conflict**: Customer ID or National ID already exists in the `customers` table (`ON CONFLICT DO NOTHING`). |

_(Note: File-level structural parse errors like malformed CSV syntax cause the entire import job to fail with status `FAILED` and record the reason in `import_jobs.error_message`)._

---

## 8. End-to-End API Walkthrough (`curl`)

All endpoints (except `/health`) require the `X-API-Key` header. The default local development key is `dev-local-key-change-me`.

### 1. Upload CSV File (Asynchronous Ingestion)

```bash
curl -X POST http://localhost:3000/api/v1/imports \
  -H "X-API-Key: dev-local-key-change-me" \
  -F "file=@sample-data/sample-customers-10k.csv"
```

**Response (`202 Accepted` - Live output):**

```json
{
  "id": "ca4639e1-fa6b-4a76-9782-283b70701620",
  "status": "PENDING",
  "statusUrl": "http://localhost:3000/api/v1/imports/ca4639e1-fa6b-4a76-9782-283b70701620",
  "original_filename": "sample-customers-10k.csv",
  "file_size_bytes": 1011544,
  "created_at": "2026-11-21T22:59:20.879Z"
}
```

---

### 2. Poll Ingestion Status & Progress

```bash
curl -s -H "X-API-Key: dev-local-key-change-me" \
  http://localhost:3000/api/v1/imports/ca4639e1-fa6b-4a76-9782-283b70701620
```

**Response (`200 OK` - Live output):**

```json
{
  "id": "ca4639e1-fa6b-4a76-9782-283b70701620",
  "original_filename": "sample-customers-10k.csv",
  "file_size_bytes": 1011544,
  "status": "PARTIALLY_COMPLETED",
  "total_rows": 10000,
  "processed_rows": 10000,
  "success_rows": 9319,
  "failed_rows": 504,
  "duplicate_rows": 177,
  "progress_percentage": 100,
  "last_committed_row": 10001,
  "created_at": "2026-11-21T22:59:20.879Z",
  "started_at": "2026-11-21T22:59:20.901Z",
  "finished_at": "2026-11-21T22:59:21.929Z",
  "error_message": null
}
```

---

### 3. List Row Errors (Keyset Pagination)

Retrieve paginated row errors without `OFFSET` overhead. Pass `after_row` (cursor) to seek the next page:

```bash
curl -s -H "X-API-Key: dev-local-key-change-me" \
  "http://localhost:3000/api/v1/imports/ca4639e1-fa6b-4a76-9782-283b70701620/errors?limit=1"
```

**Response (`200 OK` - Live output):**

```json
{
  "data": [
    {
      "id": "1224894",
      "import_id": "ca4639e1-fa6b-4a76-9782-283b70701620",
      "row_number": 5,
      "error_type": "VALIDATION",
      "error_codes": ["INVALID_EMAIL"],
      "error_message": "Geçersiz e-posta adresi formatı",
      "raw_data": {
        "customer_id": "CUST-0000004",
        "first_name": "Mehmet",
        "last_name": "Cetin",
        "national_id": "62623785290",
        "email": "invalid-email-address",
        "phone": "+905551000004",
        "birth_date": "1990-05-15",
        "created_date": "2023-01-10"
      },
      "created_at": "2026-11-21T22:59:20.980Z"
    }
  ],
  "pagination": {
    "next_cursor": 5,
    "has_more": true,
    "limit": 1
  }
}
```

---

### 4. Export Errors as Streaming CSV

Streams all error records for the import as an Excel-ready CSV file. Includes UTF-8 BOM (`\uFEFF`) and automatically escapes CSV formula injection characters (`=`, `+`, `-`, `@`):

```bash
curl -s -H "X-API-Key: dev-local-key-change-me" \
  http://localhost:3000/api/v1/imports/ca4639e1-fa6b-4a76-9782-283b70701620/errors/export \
  -o errors.csv
```

---

### 5. Ingestion Summary & Error Breakdown

```bash
curl -s -H "X-API-Key: dev-local-key-change-me" \
  http://localhost:3000/api/v1/imports/ca4639e1-fa6b-4a76-9782-283b70701620/summary
```

**Response (`200 OK` - Live output matching 10K dataset):**

```json
{
  "id": "ca4639e1-fa6b-4a76-9782-283b70701620",
  "status": "PARTIALLY_COMPLETED",
  "total_rows": 10000,
  "processed_rows": 10000,
  "success_rows": 9319,
  "failed_rows": 504,
  "duplicate_rows": 177,
  "success_rate": 93.19,
  "duration_seconds": 1.03,
  "rows_per_second": 9727.63,
  "error_distribution": [
    { "code": "DUPLICATE_RECORD", "count": 177 },
    { "code": "CREATED_DATE_BEFORE_BIRTH_DATE", "count": 158 },
    { "code": "INVALID_NATIONAL_ID", "count": 110 },
    { "code": "DATE_IN_FUTURE", "count": 90 },
    { "code": "INVALID_PHONE", "count": 89 },
    { "code": "INVALID_EMAIL", "count": 85 },
    { "code": "REQUIRED_FIELD_MISSING", "count": 82 },
    { "code": "INVALID_BIRTH_DATE", "count": 10 }
  ]
}
```

---

## 9. Interactive API Documentation (Swagger UI)

OpenAPI 3.0 documentation is served natively by the API:

- **Interactive UI**: [http://localhost:3000/docs/](http://localhost:3000/docs/)
- **Raw OpenAPI Spec**: Located at `docs/openapi.yaml`

---

## 10. Sample Data & Benchmarking

### Included Dataset

A pre-generated deterministic sample dataset with 10,000 records is committed at:

```text
sample-data/sample-customers-10k.csv (10,000 rows, ~0.96 MB, ~5% errors, ~2% duplicates)
```

### Generating Custom Datasets

To generate arbitrary-sized deterministic datasets (e.g., 100,000 or 1,000,000 rows):

```bash
# Generate 1,000,000 rows (~98 MB)
npm run generate:sample -- --rows 1000000 --out sample-data/sample-1m.csv
```

The generator uses a deterministic Mulberry32 PRNG and generates algorithmically valid Republic of Turkey TCKN numbers satisfying official checksum verification rules.

### Performance & Benchmark Summary

Benchmarks were conducted on both host (`tsx`) and containerized environments. Detailed results, execution plans, and memory analysis are documented in [docs/PERFORMANCE.md](./docs/PERFORMANCE.md).

| Dataset Size       | Environment                              | Processing Time | Throughput        | Peak Memory           | Status                |
| :----------------- | :--------------------------------------- | :-------------- | :---------------- | :-------------------- | :-------------------- |
| **10,000 rows**    | Host (`tsx`)                             | **0.59s**       | **16,949 rows/s** | 128.64 MB RSS         | `PARTIALLY_COMPLETED` |
| **100,000 rows**   | Host (`tsx`)                             | **3.35s**       | **29,851 rows/s** | 250.38 MB RSS         | `PARTIALLY_COMPLETED` |
| **1,000,000 rows** | Host (`tsx`)                             | **40.45s**      | **24,722 rows/s** | 254.48 MB RSS         | `PARTIALLY_COMPLETED` |
| **1,000,000 rows** | **Docker Container** (`mem_limit: 512m`) | **49.84s**      | **20,066 rows/s** | **≈52 MiB (Sampled)** | `PARTIALLY_COMPLETED` |

> [!NOTE]
> **Memory Measurement Methodology**: In the containerized 1M run, memory was sampled at ~1-second intervals using `docker stats` against a hard 512 MiB cgroup ceiling. Peak memory was observed at **51.84 MiB** (10.1% limit utilization). Direct host execution with `tsx` reflects V8 heap and development tooling runtime (`254.48 MB RSS`).

---

## 11. CSV File Specifications & Tolerances

| Header Name    | Mapping Target | Constraints & Validation Rule                                                        | Example             |
| :------------- | :------------- | :----------------------------------------------------------------------------------- | :------------------ |
| `Customer ID`  | `customer_id`  | Alphanumeric, dash, dot, underscore (`^[a-zA-Z0-9_.-]{1,100}$`).                     | `CUST-1001`         |
| `First Name`   | `first_name`   | 1-100 characters, no HTML/script tags, not purely numeric.                           | `Ahmet Can`         |
| `Last Name`    | `last_name`    | 1-100 characters, no HTML/script tags, not purely numeric.                           | `Yılmaz`            |
| `National ID`  | `national_id`  | 11 digits, Republic of Turkey TCKN checksum algorithm.                               | `10000000146`       |
| `Email`        | `email`        | Pragmatic format check (`user@domain.tld`), lowercase normalized, max 255 chars.     | `ahmet@example.com` |
| `Phone`        | `phone`        | Turkish mobile number (`+905...`, `05...`, `5...` -> normalized to `+905XXXXXXXXX`). | `+90 555 123 4567`  |
| `Birth Date`   | `birth_date`   | Strict `YYYY-MM-DD`, valid calendar date, year >= 1900, not in future.               | `1992-06-15`        |
| `Created Date` | `created_date` | Strict `YYYY-MM-DD`, not in future, chronologically >= `birth_date`.                 | `2024-01-10`        |

### Architectural Tolerances

- **Delimiters**: Supports standard comma (`,`) and Turkish Excel semicolon (`;`).
- **UTF-8 BOM**: Byte Order Mark (`\uFEFF`) is automatically detected and stripped from the first column header.
- **Header Normalization**: Headers are case-insensitive and whitespace/hyphens are normalized to underscores (e.g. `Customer ID` -> `customer_id`).
- **Control Character Protection**: Null bytes (`\0`) and illegal ASCII control characters are rejected prior to database insertion.

---

## 12. Project Structure

```text
├── src/
│   ├── api/                    # Express routing, controllers, middlewares
│   │   ├── controllers/        # Import and Report HTTP handlers
│   │   ├── middlewares/        # Auth, upload, logging, rate-limit, error handlers
│   │   ├── app.ts              # Express application assembly
│   │   └── container.ts        # Manual Dependency Injection (DI) container
│   ├── application/            # Application orchestration & port contracts
│   │   ├── ports/              # Repository, Queue, Storage abstractions
│   │   └── services/           # ImportService, ImportProcessorService, ReportService
│   ├── domain/                 # Pure business rules & entities (Zero I/O)
│   │   ├── customer/           # Customer entity, rules, TCKN validator
│   │   ├── import-job/         # ImportJob entity, header parser, status resolver
│   │   └── report/             # Report entity, CSV formula sanitizer
│   ├── infrastructure/         # External implementations
│   │   ├── db/                 # PostgreSQL pool, transaction manager
│   │   ├── queue/              # BullMQ queue producer
│   │   ├── repositories/       # pg-import repository, pg-report repository
│   │   ├── storage/            # Local filesystem disk storage adapter
│   │   └── worker/             # BullMQ worker processor
│   ├── config/                 # Fail-fast environment validation with Zod
│   ├── shared/                 # Pino logger, domain error hierarchy
│   ├── index.ts                # API HTTP server entry point
│   └── worker.ts               # Standalone Worker process entry point
├── migrations/                 # PostgreSQL schema migrations (node-pg-migrate)
├── tests/                      # Automated test suite
│   ├── unit/                   # Pure domain and parser unit tests
│   └── integration/            # API endpoints, worker pipeline, concurrency & recovery
├── docs/                       # Technical architecture & performance documentation
│   ├── ARCHITECTURE.md         # Detailed system design, decisions, and trade-offs
│   ├── PERFORMANCE.md          # Comprehensive benchmark results & EXPLAIN queries
│   └── openapi.yaml            # OpenAPI 3.0 specification
├── sample-data/                # Sample datasets for testing & benchmarking
├── scripts/                    # Benchmark harness and data generation scripts
├── Dockerfile                  # Multi-stage production container build (rootless node)
├── docker-compose.yml          # Production multi-service orchestration
└── package.json                # Project dependencies and operational scripts
```
