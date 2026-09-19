import { app } from '../app.js';
import { db } from '../db/index.js';
import assert from 'node:assert/strict';

async function runSmokeTest() {
  console.log('====================================================');
  console.log('  STARTING END-TO-END PRODUCTION SMOKE TEST');
  console.log('====================================================');

  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[SMOKE] Ephemeral server listening on ${baseUrl}`);

  try {
    // 1. Health check
    console.log('[SMOKE 1/6] Testing GET /health...');
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.status, 'healthy');
    console.log('  ✔ Health check passed:', healthData);

    // 2. Search catalog
    console.log('[SMOKE 2/6] Testing GET /api/products/search...');
    const searchRes = await fetch(`${baseUrl}/api/products/search?q=Notebook&limit=3`);
    assert.equal(searchRes.status, 200);
    const searchData = await searchRes.json();
    assert.ok(searchData.data.length > 0);
    console.log(`  ✔ Catalog search passed: found ${searchData.data.length} products`);

    // 3. Track product
    console.log('[SMOKE 3/6] Testing POST /api/tracked-products...');
    const targetProduct = searchData.data[0];
    const trackRes = await fetch(`${baseUrl}/api/tracked-products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_product_id: targetProduct.id,
        name: targetProduct.name,
        brand: targetProduct.brand,
        category: targetProduct.category,
        sku: targetProduct.sku,
        url: targetProduct.url || `https://demo.inelabteamdev.com/product/${targetProduct.id}`
      })
    });
    assert.equal(trackRes.status, 201);
    const trackedItem = (await trackRes.json()).data;
    console.log(`  ✔ Product tracked successfully: ${trackedItem.name} (ID: ${trackedItem.id})`);

    // 4. Manual Scrape Execution against live storefront
    console.log('[SMOKE 4/6] Testing POST /api/scrape/manual against live mock storefront...');
    const scrapeRes = await fetch(`${baseUrl}/api/scrape/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: trackedItem.id })
    });
    assert.equal(scrapeRes.status, 200);
    const scrapeResult = await scrapeRes.json();
    console.log('  ✔ Live scrape completed:', scrapeResult.data);
    assert.equal(scrapeResult.data.success, true);
    assert.ok(scrapeResult.data.price > 0);

    // 5. Verify price history and scrape logs
    console.log('[SMOKE 5/6] Testing GET /api/tracked-products/:id/history and logs...');
    const historyRes = await fetch(`${baseUrl}/api/tracked-products/${trackedItem.id}/history`);
    assert.equal(historyRes.status, 200);
    const history = (await historyRes.json()).data;
    assert.equal(history.length, 1);
    console.log(`  ✔ Price history verified: 1 entry recorded with Price=₹${history[0].price}`);

    const logsRes = await fetch(`${baseUrl}/api/tracked-products/${trackedItem.id}/logs`);
    assert.equal(logsRes.status, 200);
    const logs = (await logsRes.json()).data;
    assert.equal(logs.length, 1);
    console.log(`  ✔ Scrape log verified: Status=${logs[0].status}, Attempts=${logs[0].attempts}`);

    // 6. Delete tracked product
    console.log('[SMOKE 6/6] Testing DELETE /api/tracked-products/:id...');
    const deleteRes = await fetch(`${baseUrl}/api/tracked-products/${trackedItem.id}`, {
      method: 'DELETE'
    });
    assert.equal(deleteRes.status, 200);
    console.log('  ✔ Tracked product cleanup verified');

    console.log('====================================================');
    console.log('  ALL END-TO-END SMOKE TESTS PASSED (6/6)');
    console.log('====================================================');
  } finally {
    server.close();
  }
}

runSmokeTest().catch(err => {
  console.error('[SMOKE TEST FAILED]', err);
  process.exit(1);
});
