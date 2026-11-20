import { describe, it, expect } from 'vitest';
import { decideFinalStatus } from '../../../src/domain/import-job/status-resolver.js';

describe('decideFinalStatus', () => {
  it('returns COMPLETED when all rows succeed with 0 failures and 0 duplicates', () => {
    const status = decideFinalStatus({
      total_rows: 500,
      processed_rows: 500,
      success_rows: 500,
      failed_rows: 0,
      duplicate_rows: 0,
    });
    expect(status).toBe('COMPLETED');
  });

  it('returns PARTIALLY_COMPLETED when some succeed and some fail', () => {
    const status = decideFinalStatus({
      total_rows: 100,
      processed_rows: 100,
      success_rows: 80,
      failed_rows: 20,
      duplicate_rows: 0,
    });
    expect(status).toBe('PARTIALLY_COMPLETED');
  });

  it('returns PARTIALLY_COMPLETED when some succeed and some are duplicate', () => {
    const status = decideFinalStatus({
      total_rows: 100,
      processed_rows: 100,
      success_rows: 95,
      failed_rows: 0,
      duplicate_rows: 5,
    });
    expect(status).toBe('PARTIALLY_COMPLETED');
  });

  it('returns FAILED when success_rows is 0', () => {
    const status = decideFinalStatus({
      total_rows: 50,
      processed_rows: 50,
      success_rows: 0,
      failed_rows: 50,
      duplicate_rows: 0,
    });
    expect(status).toBe('FAILED');
  });

  it('returns FAILED when total_rows is 0 or no rows were processed', () => {
    expect(
      decideFinalStatus({
        total_rows: 0,
        processed_rows: 0,
        success_rows: 0,
        failed_rows: 0,
        duplicate_rows: 0,
      }),
    ).toBe('FAILED');

    expect(
      decideFinalStatus({
        total_rows: null,
        processed_rows: 0,
        success_rows: 0,
        failed_rows: 0,
        duplicate_rows: 0,
      }),
    ).toBe('FAILED');
  });
});
