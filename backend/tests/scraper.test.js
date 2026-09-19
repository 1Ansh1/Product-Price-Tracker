import test from 'node:test';
import assert from 'node:assert/strict';
import { ScraperEngine } from '../src/scraper/engine.js';
import { db } from '../src/db/index.js';

test('Scraper Engine Integration Test against Live Mock Storefront', async (t) => {
  const engine = new ScraperEngine({ headed: false, maxAttempts: 3 });

  // 1. Setup a test tracked product
  const product = await db.addTrackedProduct({
    store_product_id: 90,
    name: 'Meridian Notebook Mini',
    brand: 'Meridian',
    category: 'Laptops',
    sku: 'MER-10090',
    url: 'https://demo.inelabteamdev.com/product/90'
  });

  await t.test('Scrapes live product 90 and validates extracted data', async () => {
    const jobResult = await engine.runJob({ products: [product], recordToDb: true });

    assert.equal(jobResult.total, 1);
    assert.equal(jobResult.successful, 1);
    assert.equal(jobResult.failed, 0);

    const res = jobResult.results[0];
    assert.equal(res.success, true);
    assert.ok(res.price > 0, `Price should be positive, got ${res.price}`);
    assert.ok(typeof res.stock === 'number', `Stock should be number, got ${res.stock}`);
    assert.ok(['IN_STOCK', 'OUT_OF_STOCK'].includes(res.stock_status));

    // Verify DB update
    const updated = await db.getTrackedProductById(product.id);
    assert.equal(updated.current_price, res.price);
    assert.equal(updated.current_stock, res.stock);
    assert.equal(updated.last_scrape_status, 'SUCCESS');

    // Verify History
    const history = await db.getPriceHistory(product.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].price, res.price);

    // Verify Log
    const logs = await db.getScrapeLogs(product.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, 'SUCCESS');
  });

  // Cleanup
  await db.deleteTrackedProduct(product.id);
});
