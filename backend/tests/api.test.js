import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { db } from '../src/db/index.js';

let server = null;
let baseUrl = '';

test('Backend API Integration Tests', async (t) => {
  // Start ephemeral test server
  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  let createdProductId = null;

  await t.test('1. GET /health returns 200 and healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.ok(body.timestamp);
  });

  await t.test('2. GET /api/products/search finds catalog items', async () => {
    const res = await fetch(`${baseUrl}/api/products/search?q=meridian&limit=5`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length > 0);
    assert.ok(body.data[0].name.toLowerCase().includes('meridian'));
  });

  await t.test('3. POST /api/tracked-products tracks a product', async () => {
    const res = await fetch(`${baseUrl}/api/tracked-products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_product_id: 8888,
        name: 'API Test Product 8888',
        brand: 'TestBrand',
        category: 'Audio',
        sku: 'TEST-8888',
        url: 'https://demo.inelabteamdev.com/product/8888'
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.store_product_id, 8888);
    createdProductId = body.data.id;
  });

  await t.test('4. POST /api/tracked-products rejects duplicate with 409', async () => {
    const res = await fetch(`${baseUrl}/api/tracked-products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_product_id: 8888,
        name: 'Duplicate 8888',
        url: 'https://demo.inelabteamdev.com/product/8888'
      })
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.error.includes('already tracked'));
  });

  await t.test('5. GET /api/tracked-products lists active products', async () => {
    const res = await fetch(`${baseUrl}/api/tracked-products`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    const item = body.data.find(p => p.id === createdProductId);
    assert.ok(item);
  });

  await t.test('6. POST /api/scrape/cron rejects unauthorized request with 401', async () => {
    const res = await fetch(`${baseUrl}/api/scrape/cron`, {
      method: 'POST'
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  await t.test('7. POST /api/scrape/cron accepts authorized request with 202', async () => {
    const secret = process.env.CRON_SECRET || 'dev-cron-secret-change-in-prod';
    const res = await fetch(`${baseUrl}/api/scrape/cron`, {
      method: 'POST',
      headers: {
        'x-cron-secret': secret
      }
    });

    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.jobId);
  });

  await t.test('8. POST /api/scrape/cron prevents concurrent run with 409 Conflict', async () => {
    const secret = process.env.CRON_SECRET || 'dev-cron-secret-change-in-prod';
    // Immediately fire second request while background scraper holds lock
    const res = await fetch(`${baseUrl}/api/scrape/cron`, {
      method: 'POST',
      headers: {
        'x-cron-secret': secret
      }
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.message.includes('Concurrent scraper run prevented'));
  });

  await t.test('9. DELETE /api/tracked-products/:id removes tracked product', async () => {
    const res = await fetch(`${baseUrl}/api/tracked-products/${createdProductId}`, {
      method: 'DELETE'
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    // Verify deletion
    const getRes = await fetch(`${baseUrl}/api/tracked-products/${createdProductId}`);
    assert.equal(getRes.status, 404);
  });

  // Teardown
  await new Promise(resolve => server.close(resolve));
});
