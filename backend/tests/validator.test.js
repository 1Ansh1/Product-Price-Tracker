import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAndParsePrice,
  validateAndParseStock,
  normalizeUnicodeDigits,
  cleanRawText
} from '../src/scraper/validator.js';

test('Scraper Value Validator Tests', async (t) => {
  await t.test('1. Cleans zero-width characters and spaces', () => {
    const raw = '\u200B₹\u200B 1,02,\u200B503\u00A0';
    const cleaned = cleanRawText(raw);
    assert.equal(cleaned, '₹ 1,02,503');
  });

  await t.test('2. Normalizes fullwidth Unicode digits', () => {
    const raw = '１０,４２５';
    const normalized = normalizeUnicodeDigits(raw);
    assert.equal(normalized, '10,425');
  });

  await t.test('3. Parses valid price variations', () => {
    // Standard Indian Rupee
    assert.equal(validateAndParsePrice('₹ 1,02,503'), 102503.00);
    // Indian lakhs formatting
    assert.equal(validateAndParsePrice('₹1,78,086'), 178086.00);
    // Fullwidth digits
    assert.equal(validateAndParsePrice('₹１０,４２５'), 10425.00);
    // European style comma decimal
    assert.equal(validateAndParsePrice('102.503,00'), 102503.00);
    // With Rs. and trailing tax text
    assert.equal(validateAndParsePrice('Rs. 94,249/- (incl. of all taxes)'), 94249.00);
    // Spaced thousands/lakhs format
    assert.equal(validateAndParsePrice('₹ 1 24 660'), 124660.00);
    // Deal price label prefix
    assert.equal(validateAndParsePrice('Deal price ₹1,51,373'), 151373.00);
    // Plain number
    assert.equal(validateAndParsePrice('499.99'), 499.99);
  });

  await t.test('4. Rejects invalid or malformed prices', () => {
    // Missing / null / empty
    assert.throws(() => validateAndParsePrice(''), /empty or missing/);
    assert.throws(() => validateAndParsePrice(null), /empty or missing/);
    // Zero or negative
    assert.throws(() => validateAndParsePrice('₹0'), /strictly positive/);
    assert.throws(() => validateAndParsePrice('₹ -500'), /strictly positive/);
    // Malformed text
    assert.throws(() => validateAndParsePrice('Price on request'), /Cannot parse/);
    assert.throws(() => validateAndParsePrice('₹ abc'), /Cannot parse/);
  });

  await t.test('5. Parses stock status correctly', () => {
    // Out of stock variations
    assert.deepEqual(validateAndParseStock('OUT OF STOCK', 'stock-badge out-stock'), {
      stock: 0,
      stock_status: 'OUT_OF_STOCK'
    });
    assert.deepEqual(validateAndParseStock('Out of stock'), {
      stock: 0,
      stock_status: 'OUT_OF_STOCK'
    });

    // In stock variations from storefront templates
    assert.deepEqual(validateAndParseStock('In stock · 12 left'), {
      stock: 12,
      stock_status: 'IN_STOCK'
    });
    assert.deepEqual(validateAndParseStock('Only 1 left'), {
      stock: 1,
      stock_status: 'IN_STOCK'
    });
    assert.deepEqual(validateAndParseStock('52 in stock'), {
      stock: 52,
      stock_status: 'IN_STOCK'
    });
    assert.deepEqual(validateAndParseStock('Selling fast — 3 left'), {
      stock: 3,
      stock_status: 'IN_STOCK'
    });
    assert.deepEqual(validateAndParseStock('Hurry, just 5 left'), {
      stock: 5,
      stock_status: 'IN_STOCK'
    });
  });

  await t.test('6. Rejects unrecognized stock formats', () => {
    assert.throws(() => validateAndParseStock(''), /empty or missing/);
    assert.throws(() => validateAndParseStock('Unknown availability status'), /Unrecognized stock format/);
  });
});
