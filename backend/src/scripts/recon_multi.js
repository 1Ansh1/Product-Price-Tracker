import { chromium } from 'playwright';

async function reconMultiple() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  async function dismissCookies() {
    let attempts = 0;
    while (await page.$('.cookie-overlay') && attempts < 5) {
      attempts++;
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
  }

  // Scrape a single product id
  async function scrapeProduct(id) {
    console.log(`\n=== Testing Product ${id} ===`);
    await page.goto(`https://demo.inelabteamdev.com/product/${id}`, { waitUntil: 'networkidle' });
    await dismissCookies();

    const priceBlock = await page.waitForSelector('.price-block', { timeout: 6000 });
    const box = await priceBlock.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + 10);
      for (let i = 0; i < 12; i++) {
        await page.mouse.move(box.x + 20 + i * 10, box.y + 20 + (i % 3) * 5);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(700);
    }
    await dismissCookies();

    const revealBtn = await page.$('button[aria-label="Reveal price"]');
    if (revealBtn) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await dismissCookies();
        try {
          await revealBtn.click({ timeout: 2000 });
        } catch (e) {
          await dismissCookies();
          await revealBtn.click({ force: true }).catch(() => {});
        }
        await page.waitForTimeout(500);
        if (await page.$('.price-success, .spinner, .price-error')) break;
      }

      await page.waitForSelector('.price-success, .price-error', { timeout: 15000 });
      const success = await page.$('.price-success');
      if (success) {
        // Stock extraction
        const stockEl = await page.$('.stock-badge');
        const stockText = stockEl ? await stockEl.innerText() : null;
        const stockClass = stockEl ? await stockEl.getAttribute('class') : null;

        // Price extraction: extract ONLY visible price element (not display: none decoys)
        const priceInfo = await page.evaluate(() => {
          const main = document.querySelector('.price-main');
          if (!main) return null;
          // Find the visible price element.
          // Honeypots have style="display: none;" or aria-hidden="true".
          // The strike-through MRP has line-through style.
          // The discount has % off.
          const children = Array.from(main.children);
          const visible = children.filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   el.getAttribute('aria-hidden') !== 'true' &&
                   style.textDecorationLine !== 'line-through';
          });
          return visible.map(el => ({
            tag: el.tagName,
            class: el.className,
            text: el.textContent.replace(/[\u200B\u00A0\s]/g, '')
          }));
        });

        console.log(`Product ${id} Stock: [${stockClass}] "${stockText}"`);
        console.log(`Product ${id} Visible Price Candidates:`, JSON.stringify(priceInfo));
      } else {
        console.log(`Product ${id} failed with price-error`);
      }
    }
  }

  for (const id of [90, 91, 92, 100]) {
    await scrapeProduct(id);
  }

  await browser.close();
}

reconMultiple().catch(console.error);
