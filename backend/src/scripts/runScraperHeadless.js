import { ScraperEngine } from '../scraper/engine.js';
import { db } from '../db/index.js';

async function main() {
  console.log('[HEADLESS RUN] Starting headless production scraper execution...');
  const engine = new ScraperEngine({
    headed: false,
    maxAttempts: 3
  });

  const result = await engine.runJob({ recordToDb: true });
  console.log(`[HEADLESS RUN] Finished. Processed: ${result.total}, Succeeded: ${result.successful}, Failed: ${result.failed}`);
}

main().catch(err => {
  console.error('[HEADLESS RUN ERROR]', err);
  process.exit(1);
});
