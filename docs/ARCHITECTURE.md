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
- **Worker Claim Semantics & Distributed Locking**: The SQL job claim query intentionally permits claiming jobs with `status IN ('PENDING', 'PROCESSING')` to facilitate seamless crash recovery from checkpoints (`last_committed_row`). Consequently, the database query alone does not prevent duplicate concurrent executions of an already `PROCESSING` job; single-worker mutual exclusion is strictly guaranteed by BullMQ's Redis-backed distributed locks (`lockDuration` with automatic heartbeat renewals). This is a documented design trade-off prioritizing transparent recovery over rigid single-state database-level assertions.
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
- **KVKK / GDPR & PII Protection in Logging**: Personal Identifiable Information (TCKN, phone, email, and full raw row strings) is strictly excluded from application log streams. In unrecoverable syntax and CSV parser errors, `err` objects are sanitized to emit only `{ code, message }` without serializing parser contexts or raw record payloads into logs.
- **CSV Formula Injection (DDE Mitigation)**: In error export CSVs, any cell value beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` is automatically prepended with a single quote (`'`), ensuring spreadsheet software (Excel, Google Sheets) treats it strictly as a string literal and does not evaluate formulas.
- **Keyset vs OFFSET Pagination**: Error listing uses deterministic keyset pagination (`row_number > cursor ORDER BY row_number ASC LIMIT limit + 1`). This avoids performance degradation associated with scanning large `OFFSET` offsets and provides reliable `has_more` detection without extra count queries.
- **Streaming Export Semantics**:
  - **Processing Concurrency**: The error export endpoint (`GET /api/v1/imports/:id/errors/export`) can be invoked while an import job is actively `PROCESSING`; in this case, it streams errors committed to the database up to that point.
  - **Mid-stream Error Handling**: Once HTTP headers (`Content-Type: text/csv`) are dispatched, errors cannot be communicated via JSON status codes. If a database or network failure occurs during streaming, the server logs the error and destroys the HTTP response socket (`res.destroy()`). Consequently, the client receives a truncated (partial) CSV file. Clients can verify complete delivery by comparing received rows with the job's `failed_rows + duplicate_rows` counter upon completion.

## 6. Benchmarks & Performance

Comprehensive benchmarks were executed on real datasets scaling up to 1,000,000 rows. The system demonstrated deterministic bounded resource usage and linear scalability:

- **10K Records**: Processed in **0.59s** (~16,949 rows/sec), Peak RSS: 128.64 MB.
- **100K Records**: Processed in **3.35s** (~29,851 rows/sec), Peak RSS: 250.38 MB.
- **1,000,000 Records (Docker Container)**: Processed in **49.84s** (~20,066 rows/sec), Peak Container RAM: **51.84 MiB** (sampled via `docker stats` under `mem_limit: 512m`, utilizing just 10.1% of capacity). Host-level direct runner observed at 254.48 MB peak RSS.
- **PostgreSQL Execution Plans (`EXPLAIN ANALYZE BUFFERS`)**:
  - Keyset error pagination achieves direct B-Tree leaf seeks (`uq_import_row_errors_import_row`) in **0.158 ms**.
  - Customer unique constraint lookups execute in **0.029 ms**.
  - Job history queries run in **0.104 ms**.

For full benchmark tables, execution plans, and memory analysis, refer to [docs/PERFORMANCE.md](./PERFORMANCE.md).

## 7. Known Limitations & Architectural Trade-offs

- **Batch Size Heuristic**: The default `BATCH_SIZE=2000` was selected as a sensible initial baseline balancing database round-trips and memory footprint rather than exhaustive multi-workload hyperparameter tuning.
- **Row Numbering with Multiline CSV Fields**: `currentRowNumber` increments per emitted parsed customer record. While fully aligned with physical line numbers for standard rows, files containing multiline newlines within quoted cells may result in record index divergence relative to physical file line counts.
- **Rollback Error Masking in Transactions**: If the database socket abruptly terminates while issuing an explicit `ROLLBACK` statement, the secondary rollback error could mask the primary operational query failure in raw error cascades.
- **Redis Job Retention**: Completed and failed jobs retain queue metadata (`removeOnFail: false`) to support dead-letter inspection and troubleshooting, which requires periodic Redis retention grooming in long-running production environments.
- **Storage Lifecycle**: When `DELETE_FILE_AFTER_IMPORT=false`, processed staging files persist in the mounted `uploads/` directory for audit and recovery purposes; production deployments require external log/storage rotation policies.
