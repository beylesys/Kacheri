// KACHERI FRONTEND/src/utils/pageNumberFormat.ts
// Frontend page number format utilities for editor preview.

/** Supported page number formats matching LayoutSettings.footer.pageNumberFormat */
export type PageNumberFormat =
  | 'decimal'
  | 'lowerRoman'
  | 'upperRoman'
  | 'lowerAlpha'
  | 'upperAlpha';

/** Convert a number to lower-alpha (1→a, 2→b, …, 26→z, 27→aa). */
function toLowerAlpha(n: number): string {
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

/** Convert a number to lower-roman (1→i, 4→iv, 9→ix, etc.). */
function toLowerRoman(n: number): string {
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

/** Format a page number using the specified format. */
export function formatPageNumber(n: number, format: PageNumberFormat): string {
  switch (format) {
    case 'decimal':
      return String(n);
    case 'lowerRoman':
      return toLowerRoman(n);
    case 'upperRoman':
      return toLowerRoman(n).toUpperCase();
    case 'lowerAlpha':
      return toLowerAlpha(n);
    case 'upperAlpha':
      return toLowerAlpha(n).toUpperCase();
    default:
      return String(n);
  }
}
