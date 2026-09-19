import { ScraperEngine } from '../scraper/engine.js';
import { db } from '../db/index.js';

async function main() {
  console.log('====================================================');
  console.log('  STARTING HEADED DEMO SCRAPER RUN (Chromium GUI)');
  console.log('====================================================');

  let products = await db.getAllTrackedProducts();
  if (products.length === 0) {
    console.log('[HEADED] No tracked products in database. Adding sample products for headed demonstration...');
    // Seed products for observable demonstration
    const sample1 = await db.addTrackedProduct({
      store_product_id: 90,
      name: 'Meridian Notebook Mini',
      brand: 'Meridian',
      category: 'Laptops',
      sku: 'MER-10090',
      url: 'https://demo.inelabteamdev.com/product/90'
    });
    const sample2 = await db.addTrackedProduct({
      store_product_id: 92,
      name: 'Auralite Notebook Studio',
      brand: 'Auralite',
      category: 'Laptops',
      sku: 'AUR-10092',
      url: 'https://demo.inelabteamdev.com/product/92'
    });
    products = [sample1, sample2];
  }

  const includeFailure = process.argv.includes('--include-failure');
  if (includeFailure) {
    const failProduct = await db.addTrackedProduct({
      store_product_id: 99999,
      name: 'Fault Demo Device 99999',
      brand: 'Diagnostic',
      category: 'Testing',
      sku: 'FAIL-99999',
      url: 'https://demo.inelabteamdev.com/product/99999'
    }).catch(() => db.getTrackedProductByStoreId(99999));
    if (failProduct && !products.find(p => p.store_product_id === 99999)) {
      products.push(failProduct);
    }
  }

  const engine = new ScraperEngine({
    headed: true, // Visibly launch Chromium with slowMo
    maxAttempts: 3,
    timeout: 30000,
    demoFaultInjection: true // Enables isolated demo fault injection to exercise real retry loop
  });

  // Flag the first product to exercise the real retry loop (Attempt 1 transient fault -> Attempt 2 real storefront success)
  const productsToRun = products.map((p, idx) => ({
    ...p,
    injectTransientFault: idx === 0
  }));

  console.log(`[HEADED DEMO] Product 1 (${productsToRun[0]?.name}) will demonstrate the RETRY PATH (Attempt 1 fault -> Attempt 2 success).`);
  if (productsToRun[1]) {
    console.log(`[HEADED DEMO] Product 2 (${productsToRun[1]?.name}) will demonstrate the DIRECT SUCCESS PATH (Attempt 1 success).`);
  }

  const result = await engine.runJob({ products: productsToRun, recordToDb: true });

  console.log('====================================================');
  console.log(`  HEADED SCRAPE RUN FINISHED`);
  console.log(`  Total: ${result.total} | Successful: ${result.successful} | Failed: ${result.failed}`);
  console.log('====================================================');
}

main().catch(err => {
  console.error('[HEADED RUN ERROR]', err);
  process.exit(1);
});
