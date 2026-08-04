import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cache, TTL } from '../api/_lib/cache.js';
import { startDateFromDays, cleanTWSymbol } from '../api/_lib/finmindFetcher.js';
import { parsePrice, parseVolume, getNextClosingExpiry } from '../src/data/price.js';
import { buildWeeklyCacheHeader } from '../api/_lib/cacheControl.js';

describe('Cache Helpers', () => {
  beforeEach(() => {
    cache._map.clear();
  });

  it('LRUCache set and get', () => {
    cache.set('key1', 'value1', 10000);
    expect(cache.get('key1')).toBe('value1');
    expect(cache.has('key1')).toBe(true);
  });

  it('LRUCache expires properly', async () => {
    cache.set('key2', 'value2', 10);
    expect(cache.get('key2')).toBe('value2');
    
    await new Promise(r => setTimeout(r, 20));
    expect(cache.get('key2')).toBeNull();
    expect(cache.has('key2')).toBe(false);
  });
});

describe('finmindFetcher Helpers', () => {
  it('cleanTWSymbol', () => {
    expect(cleanTWSymbol('2330.TW')).toBe('2330');
    expect(cleanTWSymbol('TWSE:2330')).toBe('2330');
    expect(cleanTWSymbol('OTC:3231')).toBe('3231');
    expect(cleanTWSymbol('3231.TWO')).toBe('3231');
  });

  it('startDateFromDays', () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const expected = d.toISOString().split('T')[0];
    expect(startDateFromDays(30)).toBe(expected);
  });
});

describe('parsePrice', () => {
  it('handles normal price string', () => {
    expect(parsePrice('123.45')).toBe(123.45);
  });

  it('handles comma-separated thousands', () => {
    expect(parsePrice('12,345.00')).toBe(12345);
  });

  it('handles multi-value fields (underscore separated)', () => {
    // TWSE 委買/委賣 fields can have multiple values like "2395.0000_2400.0000"
    expect(parsePrice('2395.0000_2400.0000')).toBe(2395);
  });

  it('returns NaN for dash placeholder', () => {
    expect(isNaN(parsePrice('-'))).toBe(true);
    expect(isNaN(parsePrice(''))).toBe(true);
    expect(isNaN(parsePrice(null))).toBe(true);
    expect(isNaN(parsePrice(undefined))).toBe(true);
  });

  it('handles numeric input directly', () => {
    expect(parsePrice(100)).toBe(100);
  });
});

describe('getNextClosingExpiry', () => {
  it('returns a timestamp in the future', () => {
    const expiry = getNextClosingExpiry();
    expect(expiry).toBeGreaterThan(Date.now());
  });

  it('returns a timestamp within 24h', () => {
    const expiry = getNextClosingExpiry();
    expect(expiry).toBeLessThanOrEqual(Date.now() + 86_400_000 + 1000);
  });

  it('returns 14:30 Taipei time (06:30 UTC) today or tomorrow', () => {
    const expiry = getNextClosingExpiry();
    const expiryDate = new Date(expiry);
    // Should be either today's 06:30 UTC or tomorrow's 06:30 UTC
    expect(expiryDate.getUTCHours()).toBe(6);
    expect(expiryDate.getUTCMinutes()).toBe(30);
  });
});

describe('buildWeeklyCacheHeader', () => {
  it('returns a string Cache-Control header', () => {
    const header = buildWeeklyCacheHeader();
    expect(typeof header).toBe('string');
    expect(header.length).toBeGreaterThan(0);
  });

  it('contains s-maxage directive', () => {
    const header = buildWeeklyCacheHeader();
    expect(header).toContain('s-maxage=');
  });

  it('s-maxage is a positive number', () => {
    const header = buildWeeklyCacheHeader();
    const match = header.match(/s-maxage=(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match[1])).toBeGreaterThan(0);
  });
});

