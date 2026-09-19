import { chromium } from 'playwright';

async function recon() {
  console.log('--- Launching Chromium for Reconnaissance ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Monitor network
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      console.log(`[REQ] ${req.method()} ${req.url()}`);
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      console.log(`[RES] ${res.status()} ${res.url()}`);
      try {
        const text = await res.text();
        console.log(`[RES BODY] ${text.slice(0, 160)}`);
      } catch (e) {}
    }
  });

  console.log('Navigating to https://demo.inelabteamdev.com/product/90');
  await page.goto('https://demo.inelabteamdev.com/product/90', { waitUntil: 'networkidle' });

  // Function to dismiss cookie overlay if it appears
  async function dismissCookies() {
    const overlay = await page.$('.cookie-overlay');
    if (overlay) {
      console.log('Detected cookie overlay. Dismissing...');
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
        await page.waitForTimeout(200);
      }
      console.log('Cookie overlay dismissed.');
    }
  }

  await dismissCookies();

  const priceBlock = await page.waitForSelector('.price-block', { timeout: 5000 });
  console.log('priceBlock exists');

  // Hover and generate mouse movement events
  const box = await priceBlock.boundingBox();
  if (box) {
    console.log(`Simulating mouse movement over priceBlock: (${box.x}, ${box.y})`);
    await page.mouse.move(box.x + 10, box.y + 10);
    // Move at least 10 times with 50ms interval to satisfy minMoves: 8, dt >= 40ms
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(box.x + 20 + i * 10, box.y + 20 + (i % 3) * 5);
      await page.waitForTimeout(50);
    }
    // Dwell for >= 650ms to satisfy minDwellMs: 600
    await page.waitForTimeout(700);
  }

  // Dismiss cookies again in case it popped up during hover
  await dismissCookies();

  // Find Reveal price button
  const revealBtn = await page.$('button[aria-label="Reveal price"]');
  if (revealBtn) {
    const disabled = await revealBtn.isDisabled();
    console.log('revealBtn disabled:', disabled);

    // If still disabled, hover more
    if (disabled) {
      console.log('Hovering again...');
      await page.mouse.move(box.x + 15, box.y + 15);
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(box.x + 30 + i * 10, box.y + 25);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(700);
    }

    // Try clicking up to 3 times in case Xn drops the click
    let clicked = false;
    for (let clickAttempt = 1; clickAttempt <= 3; clickAttempt++) {
      await dismissCookies();
      console.log(`Clicking Reveal price button (attempt ${clickAttempt})...`);
      try {
        await revealBtn.click({ timeout: 2000 });
      } catch (err) {
        console.log('Click error, retrying force click:', err.message);
        await dismissCookies();
        await revealBtn.click({ force: true }).catch(() => {});
      }

      // Check if state changed from idle
      await page.waitForTimeout(500);
      const isSuccessOrLoading = await page.$('.price-success, .spinner, .price-error');
      if (isSuccessOrLoading) {
        clicked = true;
        console.log('State changed successfully after click!');
        break;
      }
    }

    // Wait for resolution
    console.log('Waiting for final price result (up to 15s)...');
    try {
      await page.waitForSelector('.price-success, .price-error', { timeout: 15000 });
      const success = await page.$('.price-success');
      if (success) {
        console.log('SUCCESS! Price revealed!');
        // Extract price & stock
        const html = await page.$eval('.price-block', el => el.outerHTML);
        console.log('Price block HTML:', html);

        // Check stock
        const stockEl = await page.$('.stock-badge');
        if (stockEl) {
          const stockText = await stockEl.innerText();
          const stockClass = await stockEl.getAttribute('class');
          console.log(`EXTRACTED STOCK: text="${stockText}", class="${stockClass}"`);
        }

        // Check price
        // Let's inspect how price is rendered
        const priceMainText = await page.$eval('.price-main', el => el.innerText);
        console.log('price-main innerText:', JSON.stringify(priceMainText));

        // Evaluate all text nodes or visible elements in price-main
        const priceDetails = await page.evaluate(() => {
          const main = document.querySelector('.price-main');
          if (!main) return null;
          return {
            innerText: main.innerText,
            children: Array.from(main.children).map(c => ({
              tag: c.tagName,
              className: c.className,
              styleDisplay: c.style.display,
              text: c.textContent,
              innerText: c.innerText
            }))
          };
        });
        console.log('Price details:', JSON.stringify(priceDetails, null, 2));

      } else {
        const errorText = await page.$eval('.price-error', el => el.innerText);
        console.log('ERROR on page:', errorText);
      }
    } catch (e) {
      console.error('Wait timeout:', e.message);
      const current = await page.$eval('.price-block', el => el.outerHTML).catch(() => 'none');
      console.log('Current HTML:', current);
    }
  }

  await browser.close();
  console.log('--- Recon Finished ---');
}

recon().catch(console.error);
