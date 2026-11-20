export type ValidationErrorCode =
  | 'REQUIRED_FIELD_MISSING'
  | 'INVALID_CUSTOMER_ID'
  | 'INVALID_FIRST_NAME'
  | 'INVALID_LAST_NAME'
  | 'INVALID_NATIONAL_ID'
  | 'INVALID_EMAIL'
  | 'INVALID_PHONE'
  | 'INVALID_BIRTH_DATE'
  | 'INVALID_CREATED_DATE'
  | 'CREATED_DATE_BEFORE_BIRTH_DATE'
  | 'DATE_IN_FUTURE';

export interface ValidationIssue {
  code: ValidationErrorCode;
  message: string;
  field?: string;
}

export interface RawCustomerRow {
  customer_id?: string;
  first_name?: string;
  last_name?: string;
  national_id?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  created_date?: string;
  [key: string]: string | undefined;
}

export interface NormalizedCustomerRow {
  customer_id: string;
  first_name: string;
  last_name: string;
  national_id: string;
  email: string;
  phone: string;
  birth_date: string;
  created_date: string;
}

export type ValidationRule = (row: RawCustomerRow) => ValidationIssue | ValidationIssue[] | null;
