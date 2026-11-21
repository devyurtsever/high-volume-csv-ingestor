import type { Pool } from 'pg';
import type {
  ErrorCodeDistribution,
  ErrorListItem,
  KeysetPaginatedResult,
  KeysetPaginationOptions,
} from '../../domain/report/types.js';
import type { ReportRepositoryPort } from '../../application/ports/report-repository.port.js';

export class PgReportRepository implements ReportRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findErrorsByKeyset(
    importId: string,
    options: KeysetPaginationOptions,
  ): Promise<KeysetPaginatedResult<ErrorListItem>> {
    const limit = options.limit;
    // LIMIT limit + 1 ile has_more kontrolü
    const queryLimit = limit + 1;

    const query = `
      SELECT id, import_id, row_number, error_type, error_codes, error_message, raw_data, created_at
      FROM import_row_errors
      WHERE import_id = $1
        AND ($2::int IS NULL OR row_number > $2)
        AND ($3::varchar IS NULL OR error_type = $3)
      ORDER BY row_number ASC
      LIMIT $4;
    `;

    const result = await this.pool.query<ErrorListItem>(query, [
      importId,
      options.afterRow ?? null,
      options.errorType ?? null,
      queryLimit,
    ]);

    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].row_number : null;

    return {
      items,
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  async fetchErrorsChunk(
    importId: string,
    afterRow: number,
    chunkSize: number,
  ): Promise<ErrorListItem[]> {
    const query = `
      SELECT id, import_id, row_number, error_type, error_codes, error_message, raw_data, created_at
      FROM import_row_errors
      WHERE import_id = $1
        AND row_number > $2
      ORDER BY row_number ASC
      LIMIT $3;
    `;

    const result = await this.pool.query<ErrorListItem>(query, [importId, afterRow, chunkSize]);
    return result.rows;
  }

  async getErrorCodeDistribution(importId: string): Promise<ErrorCodeDistribution[]> {
    const query = `
      SELECT code, COUNT(*)::int AS count
      FROM import_row_errors,
           unnest(error_codes) AS code
      WHERE import_id = $1
      GROUP BY code
      ORDER BY count DESC;
    `;

    const result = await this.pool.query<ErrorCodeDistribution>(query, [importId]);
    return result.rows;
  }
}
