import { describe, it, expect } from 'vitest';
import {
  toLowerAlpha,
  toUpperAlpha,
  toLowerRoman,
  toUpperRoman,
  formatPageNumber,
  wordFieldSwitch,
} from '../pageNumberFormat.js';

/* ============= toLowerAlpha ============= */

describe('toLowerAlpha', () => {
  it('converts 1→a through 26→z', () => {
    expect(toLowerAlpha(1)).toBe('a');
    expect(toLowerAlpha(2)).toBe('b');
    expect(toLowerAlpha(26)).toBe('z');
  });

  it('wraps to double letters after 26', () => {
    expect(toLowerAlpha(27)).toBe('aa');
    expect(toLowerAlpha(28)).toBe('ab');
    expect(toLowerAlpha(52)).toBe('az');
    expect(toLowerAlpha(53)).toBe('ba');
  });

  it('handles triple letters', () => {
    expect(toLowerAlpha(702)).toBe('zz');
    expect(toLowerAlpha(703)).toBe('aaa');
  });

  it('returns empty string for 0 and negative', () => {
    expect(toLowerAlpha(0)).toBe('');
    expect(toLowerAlpha(-1)).toBe('');
  });
});

/* ============= toUpperAlpha ============= */

describe('toUpperAlpha', () => {
  it('returns uppercase version', () => {
    expect(toUpperAlpha(1)).toBe('A');
    expect(toUpperAlpha(26)).toBe('Z');
    expect(toUpperAlpha(27)).toBe('AA');
  });
});

/* ============= toLowerRoman ============= */

describe('toLowerRoman', () => {
  it('converts basic values', () => {
    expect(toLowerRoman(1)).toBe('i');
    expect(toLowerRoman(4)).toBe('iv');
    expect(toLowerRoman(5)).toBe('v');
    expect(toLowerRoman(9)).toBe('ix');
    expect(toLowerRoman(10)).toBe('x');
    expect(toLowerRoman(14)).toBe('xiv');
    expect(toLowerRoman(40)).toBe('xl');
    expect(toLowerRoman(50)).toBe('l');
    expect(toLowerRoman(90)).toBe('xc');
    expect(toLowerRoman(100)).toBe('c');
    expect(toLowerRoman(400)).toBe('cd');
    expect(toLowerRoman(500)).toBe('d');
    expect(toLowerRoman(900)).toBe('cm');
    expect(toLowerRoman(1000)).toBe('m');
  });

  it('converts compound values', () => {
    expect(toLowerRoman(2024)).toBe('mmxxiv');
    expect(toLowerRoman(3999)).toBe('mmmcmxcix');
  });

  it('handles large numbers >3999 (extended roman)', () => {
    expect(toLowerRoman(4000)).toBe('mmmm');
    expect(toLowerRoman(5000)).toBe('mmmmm');
  });

  it('returns empty string for 0 and negative', () => {
    expect(toLowerRoman(0)).toBe('');
    expect(toLowerRoman(-1)).toBe('');
  });
});

/* ============= toUpperRoman ============= */

describe('toUpperRoman', () => {
  it('returns uppercase version', () => {
    expect(toUpperRoman(1)).toBe('I');
    expect(toUpperRoman(4)).toBe('IV');
    expect(toUpperRoman(2024)).toBe('MMXXIV');
  });
});

/* ============= formatPageNumber ============= */

describe('formatPageNumber', () => {
  it('formats decimal', () => {
    expect(formatPageNumber(1, 'decimal')).toBe('1');
    expect(formatPageNumber(42, 'decimal')).toBe('42');
    expect(formatPageNumber(0, 'decimal')).toBe('0');
  });

  it('formats lowerRoman', () => {
    expect(formatPageNumber(3, 'lowerRoman')).toBe('iii');
    expect(formatPageNumber(14, 'lowerRoman')).toBe('xiv');
  });

  it('formats upperRoman', () => {
    expect(formatPageNumber(3, 'upperRoman')).toBe('III');
    expect(formatPageNumber(14, 'upperRoman')).toBe('XIV');
  });

  it('formats lowerAlpha', () => {
    expect(formatPageNumber(1, 'lowerAlpha')).toBe('a');
    expect(formatPageNumber(3, 'lowerAlpha')).toBe('c');
  });

  it('formats upperAlpha', () => {
    expect(formatPageNumber(1, 'upperAlpha')).toBe('A');
    expect(formatPageNumber(3, 'upperAlpha')).toBe('C');
  });
});

/* ============= wordFieldSwitch ============= */

describe('wordFieldSwitch', () => {
  it('returns empty string for decimal (default)', () => {
    expect(wordFieldSwitch('decimal')).toBe('');
  });

  it('returns correct switch for lowerRoman', () => {
    expect(wordFieldSwitch('lowerRoman')).toBe('\\* roman');
  });

  it('returns correct switch for upperRoman', () => {
    expect(wordFieldSwitch('upperRoman')).toBe('\\* Roman');
  });

  it('returns correct switch for lowerAlpha', () => {
    expect(wordFieldSwitch('lowerAlpha')).toBe('\\* alphabetic');
  });

  it('returns correct switch for upperAlpha', () => {
    expect(wordFieldSwitch('upperAlpha')).toBe('\\* Alphabetic');
  });
});
