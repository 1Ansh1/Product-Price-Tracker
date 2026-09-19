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

  const engine = new ScraperEngine({
    headed: true, // Visibly launch Chromium with slowMo
    maxAttempts: 3,
    timeout: 30000
  });

  const result = await engine.runJob({ products, recordToDb: true });

  console.log('====================================================');
  console.log(`  HEADED SCRAPE RUN FINISHED`);
  console.log(`  Total: ${result.total} | Successful: ${result.successful} | Failed: ${result.failed}`);
  console.log('====================================================');
}

main().catch(err => {
  console.error('[HEADED RUN ERROR]', err);
  process.exit(1);
});
