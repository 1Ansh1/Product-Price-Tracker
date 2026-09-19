import express from 'express';
import { db } from '../db/index.js';
import { ScraperEngine } from '../scraper/engine.js';

export const trackedProductsRouter = express.Router();

// GET /api/tracked-products
trackedProductsRouter.get('/', async (req, res) => {
  try {
    const products = await db.getAllTrackedProducts();
    return res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    console.error('[API] Get tracked products error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tracked-products/:id
trackedProductsRouter.get('/:id', async (req, res) => {
  try {
    const product = await db.getTrackedProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Tracked product not found' });
    }
    return res.json({ success: true, data: product });
  } catch (err) {
    console.error('[API] Get product error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tracked-products
trackedProductsRouter.post('/', async (req, res) => {
  try {
    const { store_product_id, name, brand, category, sku, url } = req.body;

    if (!store_product_id || !name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: store_product_id, name, and url are required'
      });
    }

    // Canonical URL validation
    const numStoreId = parseInt(store_product_id, 10);
    if (isNaN(numStoreId) || numStoreId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid store_product_id' });
    }

    // Check duplicate
    const existing = await db.getTrackedProductByStoreId(numStoreId);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Product with store ID ${numStoreId} is already tracked`,
        data: existing
      });
    }

    const created = await db.addTrackedProduct({
      store_product_id: numStoreId,
      name,
      brand,
      category,
      sku,
      url
    });

    // Trigger initial background scrape without blocking response
    const engine = new ScraperEngine({ headed: false, maxAttempts: 3 });
    engine.runJob({ products: [created], recordToDb: true })
      .then(res => {
        console.log(`[API] Initial scrape completed for product ${numStoreId}: success=${res.successful > 0}`);
      })
      .catch(err => {
        console.error(`[API] Initial scrape error for product ${numStoreId}:`, err);
      });

    return res.status(201).json({
      success: true,
      message: 'Product tracked successfully. Initial scrape initiated.',
      data: created
    });
  } catch (err) {
    if (err.code === 'DUPLICATE_PRODUCT') {
      return res.status(409).json({ success: false, error: err.message });
    }
    console.error('[API] Add tracked product error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/tracked-products/:id
trackedProductsRouter.delete('/:id', async (req, res) => {
  try {
    const deleted = await db.deleteTrackedProduct(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Product not found or already removed' });
    }
    return res.json({ success: true, message: 'Product tracking removed' });
  } catch (err) {
    console.error('[API] Delete tracked product error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tracked-products/:id/history
trackedProductsRouter.get('/:id/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const history = await db.getPriceHistory(req.params.id, limit);
    return res.json({ success: true, count: history.length, data: history });
  } catch (err) {
    console.error('[API] Get price history error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tracked-products/:id/logs
trackedProductsRouter.get('/:id/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await db.getScrapeLogs(req.params.id, limit);
    return res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    console.error('[API] Get scrape logs error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
