import {
  CUSTOMER_FIELDS,
  type RawCustomerRow,
  type ValidationIssue,
  type ValidationRule,
} from './types.js';
import { isValidNationalId } from './national-id.js';

export { CUSTOMER_FIELDS };

/**
 * Metinlerin içinde bozuk, görünmez veya metni kesen gizli karakterler olup olmadığını kontrol eder.
 * PostgreSQL bu tarz bozuk karakterleri kabul etmediği için, veritabanına göndermeden önce
 * burada yakalayıp 2000 kişilik toplu yüklemenin bozulmasını engelliyoruz.
 */
function hasIllegalControlCharacters(val: string): boolean {
  for (let i = 0; i < val.length; i++) {
    const code = val.charCodeAt(i);
    // Standart boşluk ve satır sonu dışındaki görünmez bozuk sistem karakterlerini reddet
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      return true;
    }
  }
  return false;
}

/**
 * Satırdaki herhangi bir alanda bozuk veya gizli sistem karakteri varsa hata verir.
 */
export const controlCharactersRule: ValidationRule = (row: RawCustomerRow) => {
  const issues: ValidationIssue[] = [];

  for (const field of CUSTOMER_FIELDS) {
    const val = row[field];
    if (val && hasIllegalControlCharacters(val)) {
      issues.push({
        code: 'INVALID_CONTROL_CHARACTER',
        message: `'${field}' alanı bozuk veya geçersiz gizli sistem karakterleri içeriyor`,
        field,
      });
    }
  }

  return issues.length > 0 ? issues : null;
};

/**
 * Zorunlu 8 alanın (ID, Ad, Soyad, TCKN, E-posta, Telefon, Doğum Tarihi, Kayıt Tarihi)
 * dolu olup olmadığını kontrol eder. Boş veya sadece boşluktan oluşan alanları yakalar.
 */
export const requiredFieldsRule: ValidationRule = (row: RawCustomerRow) => {
  const issues: ValidationIssue[] = [];

  for (const field of CUSTOMER_FIELDS) {
    const val = row[field];
    if (val === undefined || val === null || val.trim().length === 0) {
      issues.push({
        code: 'REQUIRED_FIELD_MISSING',
        message: `'${field}' alanı zorunludur ve boş bırakılamaz`,
        field,
      });
    }
  }

  return issues.length > 0 ? issues : null;
};

/**
 * Müşteri Numarasını (Customer ID) denetler.
 * Sadece harf, rakam, tire, nokta ve alt çizgi kabul eder. Boşluk veya HTML kodlarına izin vermez.
 */
const CUSTOMER_ID_REGEX = /^[a-zA-Z0-9_.-]{1,100}$/;

export const customerIdRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.customer_id?.trim();
  if (!val) return null;

  if (!CUSTOMER_ID_REGEX.test(val)) {
    return {
      code: 'INVALID_CUSTOMER_ID',
      message:
        'Customer ID 1-100 karakter uzunluğunda olmalı ve sadece harf, rakam, tire, nokta veya alt çizgi içermelidir',
      field: 'customer_id',
    };
  }

  return null;
};

/**
 * Müşteri Adını denetler:
 * En fazla 100 karakter olabilir. Sadece sayılardan oluşamaz ve zararlı kod (< veya >) içeremez.
 */
export const firstNameRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.first_name?.trim();
  if (!val) return null;

  if (val.length > 100 || /^\d+$/.test(val) || /[<>]/.test(val)) {
    return {
      code: 'INVALID_FIRST_NAME',
      message:
        'Ad 1-100 karakter arasında olmalı, sadece sayılardan oluşmamalı ve < veya > içeremez',
      field: 'first_name',
    };
  }

  return null;
};

/**
 * Müşteri Soyadını denetler:
 * En fazla 100 karakter olabilir. Sadece sayılardan oluşamaz ve zararlı kod (< veya >) içeremez.
 */
export const lastNameRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.last_name?.trim();
  if (!val) return null;

  if (val.length > 100 || /^\d+$/.test(val) || /[<>]/.test(val)) {
    return {
      code: 'INVALID_LAST_NAME',
      message:
        'Soyad 1-100 karakter arasında olmalı, sadece sayılardan oluşmamalı ve < veya > içeremez',
      field: 'last_name',
    };
  }

  return null;
};

/**
 * T.C. Kimlik Numarasını resmi matematiksel formülüyle doğrular.
 * 11 hane, ilk hanesi sıfır olmama, 10. ve 11. hane sağlama kurallarını denetler.
 */
export const nationalIdRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.national_id?.trim();
  if (!val) return null;

  if (!isValidNationalId(val)) {
    return {
      code: 'INVALID_NATIONAL_ID',
      message: 'Geçersiz T.C. Kimlik Numarası',
      field: 'national_id',
    };
  }

  return null;
};

/**
 * E-posta formatını denetler (ad@alanadi.com yapısında olup olmadığına bakar).
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const emailRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.email?.trim();
  if (!val) return null;

  if (val.length > 255 || !EMAIL_REGEX.test(val)) {
    return {
      code: 'INVALID_EMAIL',
      message: 'Geçersiz e-posta adresi formatı',
      field: 'email',
    };
  }

  return null;
};

/**
 * Türkiye cep telefonu numaralarını temizleyip tek bir standarda (+905XXXXXXXXX) çevirir.
 * Başındaki sıfırları, boşlukları, parantez ve tireleri kaldırır.
 * SMS bildirimi ve arama kolaylığı için sadece 5 ile başlayan cep telefonlarını kabul eder.
 */
export function normalizeTurkishPhone(phone: string): string | null {
  let cleaned = phone.replace(/[\s\-.()+]/g, '');

  if (cleaned.startsWith('0090')) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('90')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  if (/^5\d{9}$/.test(cleaned)) {
    return `+90${cleaned}`;
  }

  return null;
}

/**
 * Telefon numarasının geçerli bir Türkiye cep telefonu olup olmadığını denetler.
 */
export const phoneRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.phone?.trim();
  if (!val) return null;

  if (!normalizeTurkishPhone(val)) {
    return {
      code: 'INVALID_PHONE',
      message:
        'Telefon numarası geçerli bir Türkiye cep telefonu olmalıdır (örn: +90 5XX XXX XX XX)',
      field: 'phone',
    };
  }

  return null;
};

/**
 * Tarih metnini (YYYY-MM-DD) gerçek bir takvim tarihine çevirir.
 * Örneğin takvimde olmayan "30 Şubat" gibi uydurma tarihleri yakalar ve reddeder.
 */
export function parseIsoDate(val: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return null;

  const [yearStr, monthStr, dayStr] = val.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Doğum tarihini kontrol eder:
 * - YYYY-MM-DD formatında olmalı.
 * - 1900 yılından eski olamaz.
 * - Henüz doğmamış kişileri engellemek için bugünden ileri bir tarih (gelecek) olamaz.
 */
export const birthDateRule: ValidationRule = (row: RawCustomerRow, context) => {
  const val = row.birth_date?.trim();
  if (!val) return null;

  const date = parseIsoDate(val);
  if (!date || date.getUTCFullYear() < 1900) {
    return {
      code: 'INVALID_BIRTH_DATE',
      message: 'Doğum tarihi geçerli bir YYYY-MM-DD formatında olmalıdır (yıl >= 1900)',
      field: 'birth_date',
    };
  }

  const todayStr = context?.referenceToday ?? new Date().toISOString().slice(0, 10);
  if (val > todayStr) {
    return {
      code: 'DATE_IN_FUTURE',
      message: 'Doğum tarihi gelecekte bir tarih olamaz',
      field: 'birth_date',
    };
  }

  return null;
};

/**
 * Kayıt tarihini kontrol eder:
 * - YYYY-MM-DD formatında olmalı.
 * - Bugünden ileri bir tarih (gelecek) olamaz.
 */
export const createdDateRule: ValidationRule = (row: RawCustomerRow, context) => {
  const val = row.created_date?.trim();
  if (!val) return null;

  const date = parseIsoDate(val);
  if (!date || date.getUTCFullYear() < 1900) {
    return {
      code: 'INVALID_CREATED_DATE',
      message: 'Kayıt tarihi geçerli bir YYYY-MM-DD formatında olmalıdır',
      field: 'created_date',
    };
  }

  const todayStr = context?.referenceToday ?? new Date().toISOString().slice(0, 10);
  if (val > todayStr) {
    return {
      code: 'DATE_IN_FUTURE',
      message: 'Kayıt tarihi gelecekte bir tarih olamaz',
      field: 'created_date',
    };
  }

  return null;
};

/**
 * Tarih mantığını denetler:
 * Bir kişinin sisteme kayıt tarihi, doğum tarihinden daha eski olamaz.
 * (Hastanede doğduğu gün sisteme kaydı açılan bebekler için aynı gün doğup kaydolmak serbesttir).
 */
export const dateOrderRule: ValidationRule = (row: RawCustomerRow) => {
  const birthStr = row.birth_date?.trim();
  const createdStr = row.created_date?.trim();
  if (!birthStr || !createdStr) return null;

  const birthDate = parseIsoDate(birthStr);
  const createdDate = parseIsoDate(createdStr);

  if (birthDate && createdDate && createdStr < birthStr) {
    return {
      code: 'CREATED_DATE_BEFORE_BIRTH_DATE',
      message: 'Kayıt tarihi doğum tarihinden önce olamaz',
      field: 'created_date',
    };
  }

  return null;
};

/**
 * Müşteriler için tanımlı olan tüm kuralların listesi.
 * validator.ts bu listeyi sırayla çalıştırır.
 */
export const DEFAULT_CUSTOMER_RULES: ValidationRule[] = [
  controlCharactersRule,
  requiredFieldsRule,
  customerIdRule,
  firstNameRule,
  lastNameRule,
  nationalIdRule,
  emailRule,
  phoneRule,
  birthDateRule,
  createdDateRule,
  dateOrderRule,
];
