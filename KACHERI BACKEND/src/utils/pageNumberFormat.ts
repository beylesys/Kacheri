// KACHERI BACKEND/src/utils/pageNumberFormat.ts
// Shared page number format utilities for PDF and DOCX exports.

/** Supported page number formats matching LayoutSettings.footer.pageNumberFormat */
export type PageNumberFormat =
  | 'decimal'
  | 'lowerRoman'
  | 'upperRoman'
  | 'lowerAlpha'
  | 'upperAlpha';

/** Convert a number to lower-alpha (1→a, 2→b, …, 26→z, 27→aa). */
export function toLowerAlpha(n: number): string {
  if (n <= 0) return '';
  let s = '';
  let v = n;
  while (v > 0) {
    v--;
    s = String.fromCharCode(97 + (v % 26)) + s;
    v = Math.floor(v / 26);
  }
  return s;
}

/** Convert a number to upper-alpha. */
export function toUpperAlpha(n: number): string {
  return toLowerAlpha(n).toUpperCase();
}

/** Convert a number to lower-roman (1→i, 4→iv, 9→ix, etc.). */
export function toLowerRoman(n: number): string {
  if (n <= 0) return '';
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
  let s = '';
  let v = n;
  for (let i = 0; i < vals.length; i++) {
    while (v >= vals[i]) {
      s += syms[i];
      v -= vals[i];
    }
  }
  return s;
}

/** Convert a number to upper-roman. */
export function toUpperRoman(n: number): string {
  return toLowerRoman(n).toUpperCase();
}

/** Format a page number using the specified format. */
export function formatPageNumber(n: number, format: PageNumberFormat): string {
  switch (format) {
    case 'decimal':
      return String(n);
    case 'lowerRoman':
      return toLowerRoman(n);
    case 'upperRoman':
      return toUpperRoman(n);
    case 'lowerAlpha':
      return toLowerAlpha(n);
    case 'upperAlpha':
      return toUpperAlpha(n);
    default:
      return String(n);
  }
}

/**
 * Return the Word field format switch string for a given page number format.
 * Used in DOCX export to construct field codes like: PAGE \\* Roman
 */
export function wordFieldSwitch(format: PageNumberFormat): string {
  switch (format) {
    case 'decimal':
      return '';
    case 'lowerRoman':
      return '\\* roman';
    case 'upperRoman':
      return '\\* Roman';
    case 'lowerAlpha':
      return '\\* alphabetic';
    case 'upperAlpha':
      return '\\* Alphabetic';
    default:
      return '';
  }
}
