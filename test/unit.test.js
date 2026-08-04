import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cache, TTL } from '../api/_lib/cache.js';
import { startDateFromDays, cleanTWSymbol } from '../api/_lib/finmindFetcher.js';

describe('Cache Helpers', () => {
  beforeEach(() => {
    // Clear cache internal map for testing
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
