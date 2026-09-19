import express from 'express';
import { db } from '../db/index.js';
import { ScraperEngine } from '../scraper/engine.js';
import crypto from 'crypto';

export const scrapeRouter = express.Router();

/**
 * Helper to authenticate cron requests.
 */
function authenticateCronRequest(req) {
  const expectedSecret = process.env.CRON_SECRET || 'dev-cron-secret-change-in-prod';
  const headerSecret = req.headers['x-cron-secret'];
  const authHeader = req.headers['authorization'];

  if (headerSecret && headerSecret === expectedSecret) return true;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === expectedSecret) return true;
  }
  return false;
}

/**
 * POST /api/scrape/cron
 * Triggered by cron-job.org or external scheduler every 2 hours.
 * Uses distributed lock to prevent overlapping runs.
 * Acknowledges immediately with 202 Accepted to prevent cron HTTP timeouts on Render free-tier.
 */
scrapeRouter.post('/cron', async (req, res) => {
  try {
    if (!authenticateCronRequest(req)) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or missing cron secret header (x-cron-secret or Authorization Bearer)'
      });
    }

    const workerId = `cron-worker-${crypto.randomBytes(4).toString('hex')}`;
    const lock = await db.acquireCronLock({
      lockId: 'cron_scraper',
      owner: workerId,
      ttlSeconds: 600 // 10 minutes TTL
    });

    if (!lock.acquired) {
      console.warn(`[CRON] Run skipped: Job already active by ${lock.lockedBy}, expires at ${lock.expiresAt}`);
      return res.status(409).json({
        success: false,
        message: 'Concurrent scraper run prevented. Another job is currently executing.',
        lockedBy: lock.lockedBy,
        expiresAt: lock.expiresAt
      });
    }

    const activeProducts = await db.getAllTrackedProducts();
    console.log(`[CRON] Lock acquired by ${workerId}. Processing ${activeProducts.length} tracked products in background...`);

    // Acknowledge cron runner immediately
    res.status(202).json({
      success: true,
      message: 'Scheduled scrape job accepted and running in background.',
      jobId: workerId,
      productsCount: activeProducts.length,
      lockExpiresAt: lock.expiresAt
    });

    // Execute sequential scraping job asynchronously
    (async () => {
      try {
        const engine = new ScraperEngine({ headed: false, maxAttempts: 3 });
        await engine.runJob({ products: activeProducts, recordToDb: true });
        console.log(`[CRON] Job ${workerId} completed successfully.`);
      } catch (err) {
        console.error(`[CRON] Job ${workerId} failed with error:`, err);
      } finally {
        await db.releaseCronLock({ lockId: 'cron_scraper', owner: workerId });
        console.log(`[CRON] Lock released by ${workerId}.`);
      }
    })();

  } catch (err) {
    console.error('[CRON] Handler error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/scrape/manual
 * Trigger manual scrape for a single product or all active products.
 */
scrapeRouter.post('/manual', async (req, res) => {
  try {
    const { productId } = req.body || {};
    let productsToScrape = [];

    if (productId) {
      const product = await db.getTrackedProductById(productId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      productsToScrape = [product];
    } else {
      productsToScrape = await db.getAllTrackedProducts();
    }

    if (productsToScrape.length === 0) {
      return res.json({ success: true, message: 'No products to scrape', results: [] });
    }

    // For single product, run synchronously so the user sees instant feedback in the UI
    if (productsToScrape.length === 1) {
      const engine = new ScraperEngine({ headed: false, maxAttempts: 3 });
      const jobResult = await engine.runJob({ products: productsToScrape, recordToDb: true });
      return res.json({
        success: true,
        message: 'Manual scrape completed',
        data: jobResult.results[0]
      });
    }

    // For multiple products, run in background with lock to prevent overlap
    const workerId = `manual-worker-${crypto.randomBytes(4).toString('hex')}`;
    const lock = await db.acquireCronLock({
      lockId: 'cron_scraper',
      owner: workerId,
      ttlSeconds: 600
    });

    if (!lock.acquired) {
      return res.status(409).json({
        success: false,
        message: 'Another scrape job is already executing.',
        lockedBy: lock.lockedBy
      });
    }

    res.status(202).json({
      success: true,
      message: `Manual scrape initiated for ${productsToScrape.length} products.`,
      jobId: workerId
    });

    (async () => {
      try {
        const engine = new ScraperEngine({ headed: false, maxAttempts: 3 });
        await engine.runJob({ products: productsToScrape, recordToDb: true });
      } catch (err) {
        console.error('[MANUAL] Scrape error:', err);
      } finally {
        await db.releaseCronLock({ lockId: 'cron_scraper', owner: workerId });
      }
    })();

  } catch (err) {
    console.error('[API] Manual scrape error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
