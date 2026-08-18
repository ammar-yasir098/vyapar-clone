/**
 * Utility functions for handling edge cases across financial calculations,
 * string sanitization, search filters, and input validations.
 */

/**
 * Safely rounds a financial amount to 2 decimal places.
 * Handles NaN, null, undefined, and Infinity gracefully.
 */
export function roundCurrency(val: any): number {
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) {
    return 0;
  }
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Safely parses a value to a finite number, returning a default value if invalid.
 */
export function safeNumber(val: any, defaultValue: number = 0): number {
  if (val === null || val === undefined || val === '') {
    return defaultValue;
  }
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) {
    return defaultValue;
  }
  return num;
}

/**
 * Escapes special HTML characters in text strings to prevent broken HTML layout
 * and protect against XSS when rendering printable templates or exported HTML.
 */
export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes special regular expression characters so raw search strings can be safely
 * passed into RegExp queries without throwing syntax errors.
 */
export function escapeRegex(str: string): string {
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates whether a string matches the official Indian GSTIN format
 * (15 alphanumeric characters: 2 digits state code + 10 char PAN + 1 entity num + 'Z' + 1 checksum).
 */
export function isValidGSTIN(gstin: string): boolean {
  if (!gstin) return false;
  const cleanGstin = gstin.trim().toUpperCase();
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(cleanGstin);
}
