import { chromium } from 'playwright';
import { validateAndParsePrice, validateAndParseStock } from './validator.js';
import { db } from '../db/index.js';

export class ScraperEngine {
  constructor(options = {}) {
    this.isHeaded = Boolean(options.headed);
    this.maxAttempts = options.maxAttempts || 3;
    this.timeout = options.timeout || 25000;
    this.demoFaultInjection = Boolean(options.demoFaultInjection ?? (process.env.DEMO_FAULT_INJECTION === 'true'));
  }

  /**
   * Launch browser with resource-conscious configuration for Render/production.
   */
  async launchBrowser() {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ];

    return await chromium.launch({
      headless: !this.isHeaded,
      slowMo: this.isHeaded ? 120 : 0,
      args: launchArgs
    });
  }

  /**
   * Dismiss cookie overlay if it pops up.
   */
  async dismissCookies(page) {
    try {
      const overlay = await page.$('.cookie-overlay');
      if (!overlay) return;

      let count = 0;
      while (await page.$('.cookie-overlay') && count < 4) {
        count++;
        const acceptBtn = await page.$('button[aria-label="Accept cookies"]');
        if (acceptBtn) {
          await acceptBtn.click({ force: true }).catch(() => {});
        } else {
          await page.evaluate(() => {
            document.querySelector('.cookie-overlay')?.remove();
            document.body.style.overflow = '';
          });
          break;
        }
        await page.waitForTimeout(150);
      }
    } catch (e) {
      // Ignore cookie banner dismissal errors
    }
  }

  /**
   * Simulate realistic mouse interaction over the price area to fulfill the dwell and movement challenge.
   */
  async simulateInteraction(page, priceBlock) {
    const box = await priceBlock.boundingBox();
    if (!box) return;

    // Move onto the element
    await page.mouse.move(box.x + 15, box.y + 15);
    // At least 10 moves separated by >= 45ms to satisfy minMoves: 8, interval >= 40ms
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(box.x + 20 + i * 12, box.y + 15 + (i % 3) * 6);
      await page.waitForTimeout(50);
    }
    // Dwell >= 700ms to satisfy minDwellMs: 600
    await page.waitForTimeout(700);
  }

  /**
   * Scrapes a single product URL with retries and diagnostics.
   */
  async scrapeProduct(browser, product) {
    const startTime = Date.now();
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let page = null;
      try {
        console.log(`[SCRAPER] Product ${product.store_product_id} ("${product.name}") - Attempt ${attempt}/${this.maxAttempts}`);
        page = await browser.newPage();
        page.setDefaultTimeout(this.timeout);

        // Clearly isolated demo-only fault injection to exercise real retry loop against live storefront
        if (this.demoFaultInjection && attempt === 1 && product.injectTransientFault) {
          console.log(`[DEMO FAULT INJECTION] Injecting transient storefront response failure on Attempt 1 for Product ${product.store_product_id} to verify retry logic...`);
          throw new Error('Transient 504 Gateway Timeout from storefront (Injected for demonstration of retry logic)');
        }

        // 1. Navigate
        await page.goto(product.url, { waitUntil: 'networkidle', timeout: this.timeout });
        await this.dismissCookies(page);

        // 2. Locate price block
        const priceBlock = await page.waitForSelector('.price-block', { timeout: 8000 });
        if (!priceBlock) {
          throw new Error('Price block container (.price-block) not found on page');
        }

        // 3. Perform mouse challenge
        await this.simulateInteraction(page, priceBlock);
        await this.dismissCookies(page);

        // 4. Locate Reveal button
        const revealBtn = await page.$('button[aria-label="Reveal price"]');
        if (!revealBtn) {
          // Check if already in success state
          const alreadySuccess = await page.$('.price-success');
          if (!alreadySuccess) {
            throw new Error('Reveal price button not found and price not visible');
          }
        } else {
          // Trigger click (accounting for probabilistic click-dropping)
          let stateChanged = false;
          for (let clickTry = 1; clickTry <= 3; clickTry++) {
            await this.dismissCookies(page);
            try {
              await revealBtn.click({ timeout: 2500 });
            } catch (clickErr) {
              await this.dismissCookies(page);
              await revealBtn.click({ force: true }).catch(() => {});
            }

            await page.waitForTimeout(600);
            const inProgress = await page.$('.price-success, .spinner, .price-error');
            if (inProgress) {
              stateChanged = true;
              break;
            }
          }
          if (!stateChanged) {
            throw new Error('Storefront failed to transition to loading state after reveal click');
          }
        }

        // 5. Wait for price resolution
        await page.waitForSelector('.price-success, .price-error', { timeout: 15000 });

        const priceError = await page.$('.price-error');
        if (priceError) {
          const errText = await priceError.innerText().catch(() => 'Price error displayed on page');
          throw new Error(`Storefront returned price error: ${errText.replace(/\n/g, ' ')}`);
        }

        const priceSuccess = await page.$('.price-success');
        if (!priceSuccess) {
          throw new Error('Neither price-success nor price-error appeared in price-block');
        }

        // 6. Value Extraction
        // Stock extraction
        const stockEl = await page.$('.stock-badge');
        if (!stockEl) {
          throw new Error('Missing stock badge element (.stock-badge)');
        }
        const rawStockText = await stockEl.innerText();
        const stockClass = (await stockEl.getAttribute('class')) || '';
        const parsedStock = validateAndParseStock(rawStockText, stockClass);

        // Price extraction: Filter out hidden honeypots and strike-through MRP
        const rawPriceText = await page.evaluate(() => {
          const main = document.querySelector('.price-main');
          if (!main) return null;

          const children = Array.from(main.children);
          for (const el of children) {
            const style = window.getComputedStyle(el);
            const isHidden = style.display === 'none' || 
                             style.visibility === 'hidden' || 
                             el.getAttribute('aria-hidden') === 'true' ||
                             style.textDecorationLine === 'line-through';
            
            if (isHidden) continue;

            // Skip discount badges like "20% off"
            const text = el.textContent || '';
            if (/% off|updating/i.test(text)) continue;

            // Return text content of the visible price element
            return text;
          }
          return null;
        });

        if (!rawPriceText) {
          throw new Error('Could not identify valid visible price element among candidates');
        }

        const parsedPrice = validateAndParsePrice(rawPriceText);

        const duration_ms = Date.now() - startTime;
        console.log(`[SCRAPER SUCCESS] Product ${product.store_product_id} scraped in ${duration_ms}ms (Attempt ${attempt}): Price=₹${parsedPrice}, Stock=${parsedStock.stock} (${parsedStock.stock_status})`);

        return {
          success: true,
          attempts: attempt,
          duration_ms,
          price: parsedPrice,
          stock: parsedStock.stock,
          stock_status: parsedStock.stock_status,
          error_message: null
        };

      } catch (err) {
        lastError = err;
        console.warn(`[SCRAPER ATTEMPT ${attempt} FAILED] Product ${product.store_product_id}: ${err.message}`);
        if (attempt < this.maxAttempts) {
          const backoff = attempt * 800;
          await new Promise(r => setTimeout(r, backoff));
        }
      } finally {
        if (page) {
          await page.close().catch(() => {});
        }
      }
    }

    const duration_ms = Date.now() - startTime;
    console.error(`[SCRAPER FINAL FAILURE] Product ${product.store_product_id} failed after ${this.maxAttempts} attempts: ${lastError?.message}`);

    return {
      success: false,
      attempts: this.maxAttempts,
      duration_ms,
      price: null,
      stock: null,
      stock_status: null,
      error_message: lastError?.message || 'Scrape failed after max retries'
    };
  }

  /**
   * Run scraping job across active products sequentially.
   */
  async runJob({ products = null, recordToDb = true } = {}) {
    const activeProducts = products || (await db.getAllTrackedProducts());
    if (activeProducts.length === 0) {
      console.log('[SCRAPER] No tracked products to scrape.');
      return { total: 0, successful: 0, failed: 0, results: [] };
    }

    console.log(`[SCRAPER] Starting sequential scrape of ${activeProducts.length} product(s)... (headed: ${this.isHeaded})`);
    const browser = await this.launchBrowser();
    const results = [];

    try {
      for (const product of activeProducts) {
        const result = await this.scrapeProduct(browser, product);
        results.push({ product, ...result });

        if (recordToDb) {
          await db.recordScrapeResult({
            tracked_product_id: product.id,
            success: result.success,
            attempts: result.attempts,
            duration_ms: result.duration_ms,
            price: result.price,
            stock: result.stock,
            stock_status: result.stock_status,
            error_message: result.error_message
          });
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`[SCRAPER COMPLETE] Total: ${results.length}, Successful: ${successful}, Failed: ${failed}`);

    return {
      total: results.length,
      successful,
      failed,
      results
    };
  }
}
