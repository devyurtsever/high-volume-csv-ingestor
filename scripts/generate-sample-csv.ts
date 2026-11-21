import fs from 'node:fs';
import path from 'node:path';

// Deterministik Mulberry32 PRNG (Pseudo-Random Number Generator)
function createPrng(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Algoritmik olarak %100 geçerli Türk Kimlik Numarası (TCKN) üretici
function generateValidTckn(prng: () => number, _index: number): string {
  // İlk hane 1..9 arasında olmalıdır
  const firstDigit = 1 + Math.floor(prng() * 9);
  const remaining8 = Array.from({ length: 8 }, () => Math.floor(prng() * 10));
  const digits = [firstDigit, ...remaining8];

  // 10. hane = ((1, 3, 5, 7, 9. hanelerin toplamı * 7) - (2, 4, 6, 8. hanelerin toplamı)) mod 10
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const d10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;

  // 11. hane = ilk 10 hanenin toplamı mod 10
  const first10Sum = digits.reduce((acc, d) => acc + d, 0) + d10;
  const d11 = first10Sum % 10;

  return `${digits.join('')}${d10}${d11}`;
}

// Geçersiz TCKN üretici (hata senaryosu için)
function generateInvalidTckn(prng: () => number): string {
  const type = Math.floor(prng() * 3);
  if (type === 0) {
    // 0 ile başlayan TCKN
    return `0${Math.floor(1000000000 + prng() * 9000000000)}`;
  } else if (type === 1) {
    // 10 hane veya 12 hane
    return `${Math.floor(100000000 + prng() * 900000000)}`;
  } else {
    // 11 hane ama sağlama hanesi bozuk
    const base = Math.floor(1000000000 + prng() * 8999999999);
    return `${base}3`;
  }
}

// CLI Argümanlarını Parse Et
function parseArgs() {
  const args = process.argv.slice(2);
  let rows = 10000;
  let out = 'sample-data/sample-customers-10k.csv';
  let errorRate = 0.05; // %5 hata
  let duplicateRate = 0.02; // %2 mükerrer
  let seed = 42;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rows' && args[i + 1]) rows = parseInt(args[i + 1], 10);
    if (args[i] === '--out' && args[i + 1]) out = args[i + 1];
    if (args[i] === '--error-rate' && args[i + 1]) errorRate = parseFloat(args[i + 1]);
    if (args[i] === '--duplicate-rate' && args[i + 1]) duplicateRate = parseFloat(args[i + 1]);
    if (args[i] === '--seed' && args[i + 1]) seed = parseInt(args[i + 1], 10);
  }

  return { rows, out, errorRate, duplicateRate, seed };
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
  'Yildiz',
  'Yildirim',
  'Ozturk',
  'Aydin',
  'Ozdemir',
  'Arslan',
  'Dogan',
  'Kilic',
  'Aslan',
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

async function main() {
  const { rows, out, errorRate, duplicateRate, seed } = parseArgs();
  const prng = createPrng(seed);

  const outPath = path.resolve(process.cwd(), out);
  const outDir = path.dirname(outPath);
  await fs.promises.mkdir(outDir, { recursive: true });

  const writeStream = fs.createWriteStream(outPath, { encoding: 'utf-8' });

  // CSV Başlığı (8 zorunlu alan)
  writeStream.write(
    'Customer ID,First Name,Last Name,National ID,Email,Phone,Birth Date,Created Date\n',
  );

  // Mükerrer üretimi için havuz
  const validPool: Array<{ customerId: string; nationalId: string }> = [];

  let generatedErrors = 0;
  let generatedDuplicates = 0;

  for (let i = 1; i <= rows; i++) {
    const roll = prng();

    let customerId = `CUST-${String(i).padStart(7, '0')}`;
    let firstName = FIRST_NAMES[Math.floor(prng() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(prng() * LAST_NAMES.length)];
    let nationalId = generateValidTckn(prng, i);
    let email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
    let phone = `+90555${String(1000000 + (i % 9000000)).slice(0, 7)}`;
    let birthDate = '1990-05-15';
    let createdDate = '2023-01-10';

    if (roll < duplicateRate && validPool.length > 5) {
      // Mükerrer Senaryosu (~%2)
      const existing = validPool[Math.floor(prng() * validPool.length)];
      if (prng() < 0.5) {
        customerId = existing.customerId; // customer_id çakışması
      } else {
        nationalId = existing.nationalId; // national_id çakışması
      }
      generatedDuplicates++;
    } else if (roll < duplicateRate + errorRate) {
      // Hata Senaryosu (~%5)
      generatedErrors++;
      const errorKind = Math.floor(prng() * 6);
      switch (errorKind) {
        case 0:
          // Geçersiz TCKN
          nationalId = generateInvalidTckn(prng);
          break;
        case 1:
          // Geçersiz e-posta
          email = 'invalid-email-address';
          break;
        case 2:
          // Geçersiz telefon
          phone = '12345';
          break;
        case 3:
          // Gelecekte doğum tarihi
          birthDate = '2099-01-01';
          break;
        case 4:
          // Kayıt tarihi doğum tarihinden önce
          birthDate = '2000-01-01';
          createdDate = '1990-01-01';
          break;
        case 5:
          // Eksik zorunlu alan
          firstName = '';
          break;
      }
    } else {
      // Geçerli kayıt havuzuna ekle
      if (validPool.length < 500) {
        validPool.push({ customerId, nationalId });
      }

      // Formula injection testi için her 1000 satırda bir zararsız simüle edilmiş formül
      if (i % 1000 === 0) {
        firstName = '=SUM(1,2)';
      }
    }

    const row = [
      customerId,
      firstName,
      lastName,
      nationalId,
      email,
      phone,
      birthDate,
      createdDate,
    ].join(',');
    writeStream.write(row + '\n');
  }

  writeStream.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', () => resolve());
    writeStream.on('error', (err) => reject(err));
  });

  const fileSizeMb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
  console.log(`[sample-generator] Successfully generated ${rows} rows to ${outPath}`);
  console.log(`  File size: ${fileSizeMb} MB`);
  console.log(`  Errors: ~${generatedErrors} (${((generatedErrors / rows) * 100).toFixed(1)}%)`);
  console.log(
    `  Duplicates: ~${generatedDuplicates} (${((generatedDuplicates / rows) * 100).toFixed(1)}%)`,
  );
}

main().catch((err) => {
  console.error('[sample-generator] Fatal error:', err);
  process.exit(1);
});
