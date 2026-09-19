import express from 'express';
import { catalogService } from '../services/catalogService.js';

export const productsRouter = express.Router();

// GET /api/products/search?q=...&limit=25
productsRouter.get('/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    const limit = parseInt(req.query.limit, 10) || 25;
    const results = await catalogService.search(q, limit);
    return res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    console.error('[API] Search error:', err);
    return res.status(500).json({ success: false, error: 'Failed to search catalog' });
  }
});

// GET /api/products/store/:id
productsRouter.get('/store/:id', async (req, res) => {
  try {
    const product = await catalogService.getProductDetails(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found on storefront' });
    }
    return res.json({ success: true, data: product });
  } catch (err) {
    console.error('[API] Product details error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch product details' });
  }
});
