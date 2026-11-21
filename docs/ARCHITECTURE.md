# System Architecture Documentation

## 1. System Overview & Context

High-volume customer ingestion service designed to process large CSV files (scaling up to 1,000,000 rows) reliably with minimal and bounded memory footprints.

## 2. Architecture Diagram (Decoupled Processes)

_(To be detailed in Phase 7)_

## 3. Core Technical Decisions & Trade-offs

- **Language & Runtime**: Node.js 24 LTS, strict TypeScript without unnecessary abstractions.
  - _TypeScript Decision (Phase 2 Review)_: Confirmed strict TypeScript with `tsx` development runner. Strong static typing ensures zero boundary defects without build friction; development continues in TypeScript.
- **Data Access**: Native `pg` with raw SQL for unnest-based bulk insertion and explicit concurrency control (`ON CONFLICT ... RETURNING`).
- **Queueing & Async Execution**: BullMQ backed by Redis (`appendonly yes`) for crash-resilient task distribution.
- **Streaming & Memory**: Node.js streams + `csv-parse` with automatic backpressure to prevent unbounded RAM usage.
- **Checkpointing & Recovery**: Transactional batch commits saving `last_committed_row` alongside inserted entities and counters.
- **Deadlock Mitigation**: Sorting batch records by `national_id` before insertion and handling `40P01` deadlock codes with bounded retries.
- **Pagination**: Keyset pagination for error reporting instead of `OFFSET`.
- **Domain Purity & Layer Inversion**: Domain layer contains pure deterministic business logic with zero I/O and zero dependencies on database/infrastructure layers. All database types reference domain types.
- **Business Decisions & Domain Tolerances**:
  - `created_date >= birth_date`: Permitted same-day customer creation for newborn customers.
  - Mobile Phone Enforced: Accepts various Turkish inputs (`+905...`, `05...`, `5...`) and normalizes strictly to E.164 (`+905XXXXXXXXX`), mobile-only for SMS verification purposes.
  - Delimiter Support: Configured for `,` and `;` to natively support Turkish locale Excel exports.
  - PostgreSQL 16 UUID: Uses PostgreSQL 16 native `gen_random_uuid()`; `pgcrypto` extension is included for legacy compatibility.

## 4. Database Schema & ER Diagram

_(To be detailed in Phase 1 & 7)_

## 5. Security & Error Handling

- **Authentication & IDOR Protection**: SHA-256 hashed API keys with timing-safe comparison (`crypto.timingSafeEqual`). Every query strictly enforces `owner_id` scoping.
- **CSV Formula Injection (DDE Mitigation)**: In error export CSVs, any cell value beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` is automatically prepended with a single quote (`'`), ensuring spreadsheet software (Excel, Google Sheets) treats it strictly as a string literal and does not evaluate formulas.
- **Keyset vs OFFSET Pagination**: Error listing uses deterministic keyset pagination (`row_number > cursor ORDER BY row_number ASC LIMIT limit + 1`). This avoids performance degradation associated with scanning large `OFFSET` offsets and provides reliable `has_more` detection without extra count queries.
- **Streaming Export Semantics**:
  - **Processing Concurrency**: The error export endpoint (`GET /api/v1/imports/:id/errors/export`) can be invoked while an import job is actively `PROCESSING`; in this case, it streams errors committed to the database up to that point.
  - **Mid-stream Error Handling**: Once HTTP headers (`Content-Type: text/csv`) are dispatched, errors cannot be communicated via JSON status codes. If a database or network failure occurs during streaming, the server logs the error and destroys the HTTP response socket (`res.destroy()`). Consequently, the client receives a truncated (partial) CSV file. Clients can verify complete delivery by comparing received rows with the job's `failed_rows + duplicate_rows` counter upon completion.

## 6. Benchmarks & Performance

_(To be detailed in Phase 6)_
