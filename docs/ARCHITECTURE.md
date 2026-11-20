# System Architecture Documentation

## 1. System Overview & Context

High-volume customer ingestion service designed to process large CSV files (up to 1M rows) reliably with minimal and bounded memory footprints.

## 2. Architecture Diagram (Decoupled Processes)

_(To be detailed in Phase 7)_

## 3. Core Technical Decisions & Trade-offs

- **Language & Runtime**: Node.js 24 LTS, strict TypeScript without unnecessary abstractions.
- **Data Access**: Native `pg` with raw SQL for unnest-based bulk insertion and explicit concurrency control (`ON CONFLICT ... RETURNING`).
- **Queueing & Async Execution**: BullMQ backed by Redis (`appendonly yes`) for crash-resilient task distribution.
- **Streaming & Memory**: Node.js streams + `csv-parse` with automatic backpressure to prevent unbounded RAM usage.
- **Checkpointing & Recovery**: Transactional batch commits saving `last_committed_row` alongside inserted entities and counters.
- **Deadlock Mitigation**: Sorting batch records by `national_id` before insertion and handling `40P01` deadlock codes with bounded retries.
- **Pagination**: Keyset pagination for error reporting instead of `OFFSET`.

## 4. Database Schema & ER Diagram

_(To be detailed in Phase 1 & 7)_

## 5. Security & Error Handling

_(To be detailed in Phase 3 & 5)_

## 6. Benchmarks & Performance

_(To be detailed in Phase 6)_
