import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/index.js';

test('Database Layer - Core Data Integrity & Lock Tests', async (t) => {
  await t.test('1. Add tracked product and prevent duplicates', async () => {
    const product = await db.addTrackedProduct({
      store_product_id: 9999,
      name: 'Test Device 9999',
      brand: 'TestBrand',
      category: 'Electronics',
      sku: 'TEST-9999',
      url: 'https://demo.inelabteamdev.com/product/9999'
    });

    assert.equal(product.store_product_id, 9999);
    assert.equal(product.last_scrape_status, 'PENDING');
    assert.equal(product.current_price, null);

    // Attempt duplicate
    await assert.rejects(
      async () => {
        await db.addTrackedProduct({
          store_product_id: 9999,
          name: 'Duplicate Test',
          url: 'https://demo.inelabteamdev.com/product/9999'
        });
      },
      { code: 'DUPLICATE_PRODUCT' }
    );
  });

  await t.test('2. Successful scrape creates history, updates product, and logs outcome', async () => {
    const product = await db.getTrackedProductByStoreId(9999);
    assert.ok(product);

    await db.recordScrapeResult({
      tracked_product_id: product.id,
      success: true,
      attempts: 1,
      duration_ms: 850,
      price: 15499.00,
      stock: 5,
      stock_status: 'IN_STOCK'
    });

    const updated = await db.getTrackedProductById(product.id);
    assert.equal(updated.current_price, 15499.00);
    assert.equal(updated.current_stock, 5);
    assert.equal(updated.current_stock_status, 'IN_STOCK');
    assert.equal(updated.last_scrape_status, 'SUCCESS');
    assert.equal(updated.last_scrape_error, null);

    const history = await db.getPriceHistory(product.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].price, 15499.00);
    assert.equal(history[0].stock, 5);

    const logs = await db.getScrapeLogs(product.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, 'SUCCESS');
  });

  await t.test('3. Failed scrape preserves valid price, does NOT create history, and logs error', async () => {
    const product = await db.getTrackedProductByStoreId(9999);

    await db.recordScrapeResult({
      tracked_product_id: product.id,
      success: false,
      attempts: 3,
      duration_ms: 4500,
      error_message: 'Navigation timeout after 3 attempts'
    });

    const updated = await db.getTrackedProductById(product.id);
    // MUST RETAIN PREVIOUS VALID PRICE & STOCK!
    assert.equal(updated.current_price, 15499.00, 'Price must remain untouched on failure');
    assert.equal(updated.current_stock, 5, 'Stock must remain untouched on failure');
    assert.equal(updated.last_scrape_status, 'FAILED');
    assert.equal(updated.last_scrape_error, 'Navigation timeout after 3 attempts');

    // HISTORY MUST REMAIN UNCHANGED (still 1 record, no failed record added!)
    const history = await db.getPriceHistory(product.id);
    assert.equal(history.length, 1, 'Price history must not contain failed scrape');

    // Logs must record the failure
    const logs = await db.getScrapeLogs(product.id);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].status, 'FAILED');
    assert.equal(logs[0].error_message, 'Navigation timeout after 3 attempts');
  });

  await t.test('4. Cron lock prevents concurrent runs and releases cleanly', async () => {
    const lock1 = await db.acquireCronLock({ lockId: 'test_lock', owner: 'worker-1', ttlSeconds: 5 });
    assert.equal(lock1.acquired, true);

    // Second worker attempts lock
    const lock2 = await db.acquireCronLock({ lockId: 'test_lock', owner: 'worker-2', ttlSeconds: 5 });
    assert.equal(lock2.acquired, false);
    assert.equal(lock2.lockedBy, 'worker-1');

    // Release lock
    await db.releaseCronLock({ lockId: 'test_lock', owner: 'worker-1' });

    // Now worker-2 can acquire
    const lock3 = await db.acquireCronLock({ lockId: 'test_lock', owner: 'worker-2', ttlSeconds: 5 });
    assert.equal(lock3.acquired, true);
    await db.releaseCronLock({ lockId: 'test_lock', owner: 'worker-2' });
  });

  await t.test('5. Retried scrape sets status to RETRIED, creates history, and logs RETRIED', async () => {
    const product = await db.getTrackedProductByStoreId(9999);

    await db.recordScrapeResult({
      tracked_product_id: product.id,
      success: true,
      attempts: 2, // Retried on attempt 2
      duration_ms: 2100,
      price: 15999.00,
      stock: 4,
      stock_status: 'IN_STOCK'
    });

    const updated = await db.getTrackedProductById(product.id);
    assert.equal(updated.current_price, 15999.00);
    assert.equal(updated.current_stock, 4);
    assert.equal(updated.last_scrape_status, 'RETRIED', 'Status must be RETRIED when attempts > 1 and successful');

    const history = await db.getPriceHistory(product.id);
    assert.equal(history.length, 2, 'Price history must record successful retried scrape');
    assert.equal(history[history.length - 1].price, 15999.00);

    const logs = await db.getScrapeLogs(product.id);
    assert.equal(logs.length, 3);
    assert.equal(logs[0].status, 'RETRIED');
    assert.equal(logs[0].attempts, 2);
  });

  // Cleanup
  const p = await db.getTrackedProductByStoreId(9999);
  if (p) await db.deleteTrackedProduct(p.id);
});
