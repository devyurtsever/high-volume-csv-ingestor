import fs from 'node:fs';
import path from 'node:path';

interface ImportSummaryResponse {
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  success_rate: number;
  duration_seconds: number | null;
  rows_per_second: number | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error_distribution: Array<{ code: string; count: number }>;
}

async function main() {
  const args = process.argv.slice(2);
  let filePath = 'sample-data/sample-customers-10k.csv';
  let apiUrl = process.env.API_URL || 'http://localhost:3000';
  const apiKey = process.env.API_KEY || 'dev-local-key-change-me';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) filePath = args[i + 1];
    if (args[i] === '--url' && args[i + 1]) apiUrl = args[i + 1];
  }

  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`[benchmark] Error: File not found at ${absolutePath}`);
    process.exit(1);
  }

  const fileStats = fs.statSync(absolutePath);
  const fileSizeMb = (fileStats.size / (1024 * 1024)).toFixed(2);
  console.log(
    `[benchmark] Starting benchmark with file: ${path.basename(filePath)} (${fileSizeMb} MB)`,
  );
  console.log(`[benchmark] Target API URL: ${apiUrl}`);

  // 1. Dosyayı API'ye yükle (multipart/form-data)
  const fileBytes = fs.readFileSync(absolutePath);
  const blob = new Blob([fileBytes], { type: 'text/csv' });
  const formData = new FormData();
  formData.append('file', blob, path.basename(filePath));

  console.log('[benchmark] Uploading file to POST /api/v1/imports ...');
  const uploadStartTime = Date.now();
  const uploadRes = await fetch(`${apiUrl}/api/v1/imports`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
    },
    body: formData,
  });

  if (!uploadRes.ok) {
    const errorBody = await uploadRes.text();
    console.error(`[benchmark] Upload failed with status ${uploadRes.status}: ${errorBody}`);
    process.exit(1);
  }

  const uploadResult = (await uploadRes.json()) as {
    id: string;
    status: string;
    statusUrl: string;
  };
  const importId = uploadResult.id;
  const uploadDurationMs = Date.now() - uploadStartTime;
  console.log(
    `[benchmark] Upload accepted (202 Accepted) in ${uploadDurationMs}ms. Import ID: ${importId}`,
  );
  console.log('[benchmark] Polling status from worker processing ...');

  // 2. İş bitene kadar durumu sorgula
  let pollCount = 0;
  while (true) {
    await new Promise((res) => setTimeout(res, 1000));
    pollCount++;

    const statusRes = await fetch(`${apiUrl}/api/v1/imports/${importId}`, {
      headers: { 'X-API-Key': apiKey },
    });
    if (!statusRes.ok) {
      console.warn(`[benchmark] Polling warning: status returned ${statusRes.status}`);
      continue;
    }

    const job = (await statusRes.json()) as {
      status: string;
      processed_rows: number;
      total_rows: number | null;
      success_rows: number;
      failed_rows: number;
      duplicate_rows: number;
    };

    const total = job.total_rows ?? '?';
    const percent = job.total_rows
      ? ((job.processed_rows / job.total_rows) * 100).toFixed(1) + '%'
      : '...';
    process.stdout.write(
      `\r  [${pollCount}s] Status: ${job.status} | Processed: ${job.processed_rows}/${total} (${percent})`,
    );

    if (['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED'].includes(job.status)) {
      console.log('\n[benchmark] Processing completed!');
      break;
    }
  }

  // 3. Özet raporunu al
  const summaryRes = await fetch(`${apiUrl}/api/v1/imports/${importId}/summary`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (summaryRes.ok) {
    const summary = (await summaryRes.json()) as ImportSummaryResponse;
    console.log('\n--- BENCHMARK RESULTS ---');
    console.log(`Status               : ${summary.status}`);
    console.log(`Total Rows           : ${summary.total_rows.toLocaleString()}`);
    console.log(`Processed Rows       : ${summary.processed_rows.toLocaleString()}`);
    console.log(
      `Success Rows         : ${summary.success_rows.toLocaleString()} (${summary.success_rate}%)`,
    );
    console.log(`Failed Rows          : ${summary.failed_rows.toLocaleString()}`);
    console.log(`Duplicate Rows       : ${summary.duplicate_rows.toLocaleString()}`);
    console.log(`Duration             : ${summary.duration_seconds}s`);
    console.log(`Throughput           : ${summary.rows_per_second?.toLocaleString()} rows/sec`);
    console.log('Error Breakdown:');
    for (const item of summary.error_distribution) {
      console.log(`  - ${item.code.padEnd(25)}: ${item.count}`);
    }
    console.log('-------------------------\n');
  }
}

main().catch((err) => {
  console.error('[benchmark] Fatal error:', err);
  process.exit(1);
});
