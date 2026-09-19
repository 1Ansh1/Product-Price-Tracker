/**
 * Product Price Tracker - Scraper Value Validator & Normalizer
 * Enforces strict validation on extracted prices and stock representations.
 */

// Map fullwidth Unicode digits (０-９, U+FF10 - U+FF19) to standard ASCII (0-9, 48-57)
export function normalizeUnicodeDigits(str) {
  if (!str) return '';
  return str.replace(/[\uFF10-\uFF19]/g, ch => 
    String.fromCharCode(ch.charCodeAt(0) - 65248)
  );
}

// Clean invisible zero-width spaces, NBSPs, soft hyphens, extra whitespace
export function cleanRawText(str) {
  if (!str) return '';
  return str
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces & joiners
    .replace(/[\u00A0\s]+/g, ' ')            // Non-breaking spaces and whitespace
    .trim();
}

/**
 * Validates and parses raw price text into a positive number.
 * Throws an Error if price is missing, malformed, or <= 0.
 *
 * Examples of valid inputs:
 * - "₹ 1,02,503" -> 102503.00
 * - "₹１０,４２５" -> 10425.00
 * - "Rs. 1,78,086" -> 178086.00
 * - "102.503,00" -> 102503.00
 * - "₹94,249" -> 94249.00
 */
export function validateAndParsePrice(rawPrice) {
  if (!rawPrice || typeof rawPrice !== 'string') {
    throw new Error('Price validation failed: Price text is empty or missing');
  }

  // 1. Clean whitespace and zero-width characters
  let cleaned = cleanRawText(rawPrice);

  // 2. Normalize fullwidth Unicode digits
  cleaned = normalizeUnicodeDigits(cleaned);

  // 3. Remove promo/deal labels and currency prefixes
  cleaned = cleaned
    .replace(/^(deal\s*price|special\s*price|offer\s*price|current\s*price|price\s*:?)\s*/i, '')
    .replace(/^(₹|Rs\.?|INR|\$|€)\s*/i, '')
    .replace(/\/\-.*$/i, '')
    .replace(/\(incl.*?\)/i, '')
    .trim();

  // Remove spaces between digits (e.g. spaced formatting: "1 24 660" -> "124660")
  cleaned = cleaned.replace(/(?<=\d)\s+(?=\d)/g, '');

  // 4. Handle European comma decimal (e.g. "102.503,00" -> 102503.00)
  // vs Indian/US comma grouping (e.g. "1,02,503" or "102,503.50")
  let normalizedNumberStr = '';
  if (/^-?\d{1,3}(\.\d{3})+,\d{2}$/.test(cleaned)) {
    // European style: 102.503,00
    normalizedNumberStr = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Standard / Indian style: remove all commas
    normalizedNumberStr = cleaned.replace(/,/g, '');
  }

  // Extract number pattern (support negative for explicit <= 0 validation)
  const match = normalizedNumberStr.match(/^-?\d+(\.\d+)?$/);
  if (!match) {
    throw new Error(`Price validation failed: Cannot parse "${rawPrice}" (cleaned: "${cleaned}") as a valid numeric price`);
  }

  const price = parseFloat(match[0]);
  if (isNaN(price) || !isFinite(price)) {
    throw new Error(`Price validation failed: Value parsed as NaN/Infinite from "${rawPrice}"`);
  }

  if (price <= 0) {
    throw new Error(`Price validation failed: Price must be strictly positive (> 0), got: ${price}`);
  }

  // Return clean float rounded to 2 decimal places
  return Math.round(price * 100) / 100;
}

/**
 * Validates and parses stock text into { stock: number, stock_status: 'IN_STOCK' | 'OUT_OF_STOCK' }.
 * Throws an Error if stock text is missing or does not match recognized storefront representations.
 *
 * Recognized patterns from reconnaissance:
 * - "Out of stock" -> { stock: 0, stock_status: 'OUT_OF_STOCK' }
 * - "In stock · X left"
 * - "Only X left"
 * - "X in stock"
 * - "Selling fast — X left"
 * - "Hurry, just X left"
 */
export function validateAndParseStock(rawStockText, badgeClass = '') {
  if (!rawStockText || typeof rawStockText !== 'string') {
    throw new Error('Stock validation failed: Stock text is empty or missing');
  }

  const cleaned = cleanRawText(rawStockText);
  const normalized = normalizeUnicodeDigits(cleaned).toLowerCase();
  const isOutClass = badgeClass && badgeClass.includes('out-stock');

  // Check out of stock
  if (normalized.includes('out of stock') || isOutClass) {
    return {
      stock: 0,
      stock_status: 'OUT_OF_STOCK'
    };
  }

  // Extract number from in-stock representations
  const patterns = [
    /in stock\s*·\s*(\d+)\s*left/,
    /only\s*(\d+)\s*left/,
    /(\d+)\s*in stock/,
    /selling fast\s*[—–-]\s*(\d+)\s*left/,
    /hurry,?\s*just\s*(\d+)\s*left/
  ];

  for (const regex of patterns) {
    const m = normalized.match(regex);
    if (m) {
      const count = parseInt(m[1], 10);
      if (!isNaN(count) && count >= 0) {
        return {
          stock: count,
          stock_status: count > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK'
        };
      }
    }
  }

  // Generic fallback if text contains just a positive number and "stock" or "left"
  const generalMatch = normalized.match(/(\d+)\s*(items?|units?|left|in stock)/);
  if (generalMatch) {
    const count = parseInt(generalMatch[1], 10);
    if (!isNaN(count) && count >= 0) {
      return {
        stock: count,
        stock_status: count > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK'
      };
    }
  }

  throw new Error(`Stock validation failed: Unrecognized stock format: "${rawStockText}"`);
}
