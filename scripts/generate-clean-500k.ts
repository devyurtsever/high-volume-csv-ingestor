import fs from 'node:fs';
import path from 'node:path';

function generateValidTckn(n: number): string {
  // 9 basamaklı taban (100000001 .. 100500000)
  const base = String(100000000 + n);
  const d = base.split('').map(Number);
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  const evenSum = d[1] + d[3] + d[5] + d[7];
  const d10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return `${base}${d10}${d11}`;
}

const FIRST_NAMES = [
  'Ahmet',
  'Mehmet',
  'Ayse',
  'Fatma',
  'Mustafa',
  'Emine',
  'Ali',
  'Hatice',
  'Huseyin',
  'Zeynep',
  'Ibrahim',
  'Elif',
  'Can',
  'Cem',
  'Burak',
  'Selin',
  'Deniz',
  'Baris',
  'Gamze',
  'Onur',
  'Ece',
  'Kaan',
  'Ezgi',
  'Murat',
];

const LAST_NAMES = [
  'Yilmaz',
  'Kaya',
  'Demir',
  'Celik',
  'Cetin',
  'Kara',
  'Koc',
  'Kurt',
  'Ozkan',
  'Simsek',
  'Polat',
  'Ozcan',
  'Korkmaz',
  'Cakir',
  'Erdogan',
];

async function generate() {
  const TOTAL_ROWS = 500000;
  const targetFile = path.resolve(process.cwd(), 'sample-customers-500k-clean.csv');
  console.log(`[generator] Generating ${TOTAL_ROWS} clean, valid rows to ${targetFile}...`);

  const writeStream = fs.createWriteStream(targetFile, { encoding: 'utf-8' });

  // CSV Headers
  writeStream.write(
    'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date\n',
  );

  const startTime = Date.now();
  let canWrite = true;

  for (let i = 1; i <= TOTAL_ROWS; i++) {
    const customerId = `CUST-CLN-${String(i).padStart(7, '0')}`;
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[i % LAST_NAMES.length];
    const nationalId = generateValidTckn(i);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@clean-customer.com`;
    // Format: +90555xxxxxxx (strictly valid E.164 Turkish mobile)
    const phone = `+90555${String(1000000 + (i % 8999999)).padStart(7, '0')}`;
    const birthDate = '1992-06-20';
    const createdDate = '2023-05-10';

    const row = `${customerId},${firstName},${lastName},${nationalId},${email},${phone},${birthDate},${createdDate}\n`;

    canWrite = writeStream.write(row);
    if (!canWrite) {
      await new Promise<void>((resolve) => writeStream.once('drain', () => resolve()));
    }

    if (i % 100000 === 0) {
      console.log(
        `[generator] ${i} / ${TOTAL_ROWS} rows written (${Math.round((Date.now() - startTime) / 1000)}s)...`,
      );
    }
  }

  await new Promise<void>((resolve) => writeStream.end(resolve));

  const stats = fs.statSync(targetFile);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`[generator] Successfully generated ${TOTAL_ROWS} rows in ${totalSeconds}s!`);
  console.log(`[generator] File: ${targetFile} (${sizeMb} MB)`);
}

generate().catch(console.error);
