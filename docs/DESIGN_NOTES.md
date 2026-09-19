# Architectural Design & Reconnaissance Notes

## 1. Storefront Reconnaissance Findings (`https://demo.inelabteamdev.com`)

Prior to writing the scraper implementation, live network, DOM, and JavaScript bundle inspections were performed on the target mock storefront. The findings guided the scraper engine architecture:

### A. Catalog & Endpoints
- **Catalog structure**: Accessible via `GET /api/catalog?page=X&pageSize=60` (total 1000 items).
- **Product details**: Accessible via `GET /api/product/:id`.
  * *Critical Observation*: Product endpoints contain metadata, brand, specs, and reviews, but **do not include price or stock**. Price and stock are dynamically rendered and encrypted via challenge sessions.
- **Layout variations**: `GET /api/layout` returns layout classes (e.g., `pw-m4`, `pv-m4`, `mr-m4`, `priceTag`). Class names rotate and cannot be hardcoded.

### B. Anti-Bot Challenges & Obstacles
1. **Dynamic Cookie Overlay**:
   - A `<div class="cookie-overlay">` modal pops up asynchronously between 1.5s and 5.0s after page load (`Gn = 1500, Kn = 5000`).
   - The overlay intercepts pointer events, blocking clicks to the "Reveal price" button.
   - *Solution*: The scraper detects the overlay and automatically clicks `button[aria-label="Accept cookies"]` (or safely detaches it and restores `body.style.overflow`) before interactions.
2. **Mouse Movement & Dwell Challenge (`class Ar`)**:
   - The storefront tracks pointer movement with constraints: `minMoves: 8`, `minDwellMs: 600`, and an inter-move interval $\ge 40\text{ms}$.
   - The "Reveal price" button remains disabled until this challenge passes.
   - *Solution*: The scraper simulates realistic mouse movements across the `.price-block` container with staggered intervals and dwell times exceeding 700ms.
3. **Probabilistic Click Dropping (`function Xn`)**:
   - In 17.5% of cases, clicks are discarded by client logic; in 17.5%, execution is delayed by 900ms.
   - *Solution*: The scraper monitors transition state and automatically re-clicks if the page remains in the `idle` phase after 600ms.
4. **Decoys & Honeypots**:
   - `<span class="price-value" aria-hidden="true" style="display: none;">` (fake decoy price).
   - `<span class="amount" data-price="true" aria-hidden="true" style="display: none;">` (fake decoy price).
   - Strike-through MRP: `<span class="mr-m4" style="text-decoration: line-through...">`.
   - Discount badges: `<span class="bd-m4">XX% off</span>`.
   - *Solution*: The scraper strictly evaluates computed visibility, excluding any elements with `display: none`, `visibility: hidden`, `aria-hidden="true"`, or `line-through` decoration.

### C. Value Encoding Variations
1. **Price Formatting**:
   - Zero-width spaces (`\u200B` - `\u200D`, `\uFEFF`) inserted between digits.
   - Fullwidth Unicode digits (`\uFF10` - `\uFF19`, e.g., `１０,４２５`).
   - Non-breaking spaces (`\u00A0`).
   - Indian Lakhs (`1,02,503`), European decimal comma (`102.503,00`), and spaced digits (`1 24 660`).
   - Deal price labels (`Deal price ₹...`).
   - *Solution*: `validateAndParsePrice` normalizes fullwidth characters, strips zero-width spaces and deal prefixes, standardizes commas/dots, and asserts strictly positive values.
2. **Stock Representation**:
   - `Out of stock` or `.out-stock` badge -> `0` units, `OUT_OF_STOCK`.
   - `In stock · X left`, `Only X left`, `X in stock`, `Selling fast — X left`, `Hurry, just X left` -> `X` units, `IN_STOCK`.
   - *Solution*: `validateAndParseStock` parses regex-based patterns and rejects unrecognized availability states.

---

## 2. Data Integrity Rules

1. **Price History Exclusivity**:
   - `price_history` records are **only** inserted when a scrape run succeeds and passes all price/stock validation checks.
   - A failed scrape never creates a record in `price_history`.
   - A malformed price never creates a record in `price_history`.
2. **Last-Known-Valid Price Preservation**:
   - In `tracked_products`, `current_price` and `current_stock` represent the **last known verified valid values**.
   - If a subsequent scrape fails (e.g., timeout or store error), `last_scrape_status` is marked as `'FAILED'` and `last_scrape_error` is updated, but `current_price` and `current_stock` remain completely untouched.
3. **Transparent Execution Auditing**:
   - Every scrape run records an immutable entry in `scrape_logs` capturing timestamp, status (`SUCCESS` / `FAILED`), attempt count, duration in ms, and full diagnostic error messages.

---

## 3. Distributed Cron & Concurrency Architecture

### A. Preventing Overlapping Runs
- Scheduled scraping is triggered every 2 hours by an external cron service calling `POST /api/scrape/cron`.
- The backend acquires a distributed lock in the `cron_locks` table.
- If a lock is already held and has not expired, incoming requests receive `409 Conflict` (`Scrape run already in progress`).
- The lock includes a 10-minute TTL (`expires_at`) to guarantee automatic recovery if an instance crashes.

### B. Free-Tier HTTP Timeout Mitigation
- Free cron services (e.g. cron-job.org) enforce strict 30s/60s HTTP response timeouts.
- Scraping multiple products with retries on Render free tier could exceed 30 seconds, causing cron services to report false errors or trigger duplicate requests.
- **Architectural Solution**: Upon receiving an authorized request, the endpoint acquires the lock and immediately returns `202 Accepted` with a job ID, running the sequential Playwright scraper asynchronously in the background. The lock is released in a guaranteed `finally` block upon completion.

---

## 4. Resource Management for Free Cloud Hosting
- Render free tier has strict memory limits (512MB RAM).
- Launching multiple browser instances concurrently would cause Out-Of-Memory (OOM) crashes.
- The scraper operates with a single browser instance per run, processing active tracked products sequentially with isolated pages/contexts and guaranteed cleanup.
- Playwright Chromium is launched with memory-saving flags:
  `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--no-zygote`.
