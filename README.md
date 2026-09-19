# Product Price Tracker (Web Scraping Engine & Full-Stack Dashboard)

A production-ready full-stack application that monitors product price and stock changes from the INE mock storefront (`https://demo.inelabteamdev.com/`). Built with **Node.js**, **Express**, **Playwright**, **Supabase PostgreSQL**, and **React (Vite)**.

---

## 1. System Architecture

```
[ External Scheduler: cron-job.org ]
          │ (every 2 hours with x-cron-secret)
          ▼
   [ Express Backend API (Render) ]
   ├── Distributed Lock (cron_locks table, 10-min TTL)
   ├── Catalog Search & Caching Engine
   └── Playwright Scraper Engine
          │
          ├── Challenge Simulator (Dwell + Mouse Trajectory + Cookie Dismissal)
          ├── Honeypot & Decoy Filter (display:none & aria-hidden detection)
          └── Strict Validator (Fullwidth Unicode, Indian Lakhs, European decimals)
          │
          ▼
   [ Supabase PostgreSQL ]
   ├── tracked_products (Current last-known-valid price & stock)
   ├── price_history    (Verified valid scrapes ONLY)
   ├── scrape_logs      (Audit trail of all attempts & errors)
   └── cron_locks       (Atomic concurrency prevention)
          ▲
          │ REST API
   [ React Dashboard (Vite / Vercel) ]
   ├── Real-time Search with Debounce & Storefront Preview
   ├── Tracked Products Table (Status, Relative Times, Manual Scrape)
   ├── Interactive Price History Trend Line Chart (Recharts)
   └── Execution Audit Logs Modal (Attempts, Durations, Diagnostic Errors)
```

---

## 2. Key Engineering Highlights & Data Integrity

1. **Anti-Bot Challenge Resolution**:
   - **Cookie Consent Modal**: Dismisses dynamically injected `<div class="cookie-overlay">` overlays that intercept pointer events.
   - **Mouse Movement Challenge (`class Ar`)**: Fulfills the storefront's dwell and movement challenge ($\ge 8$ moves, $\ge 600\text{ms}$ dwell, $\ge 40\text{ms}$ spacing) to enable the "Reveal price" button.
   - **Click-Drop Resilience (`function Xn`)**: Automatically re-attempts clicks if the storefront drops the click event or delays state transition.
2. **Honeypot & Decoy Defense**:
   - Strictly ignores fake decoy prices injected into `.price-value` with `style="display: none;"` and `.amount` with `aria-hidden="true"`.
   - Filters out strike-through MRP elements and discount badges.
3. **Value Normalization & Validation**:
   - Normalizes fullwidth Unicode numbers (e.g., `１０,４２５` $\to$ `10425.00`).
   - Strips zero-width spaces (`\u200B` - `\u200D`, `\uFEFF`) and non-breaking spaces (`\u00A0`).
   - Parses European decimals (`102.503,00`), Indian Lakhs (`1,02,503`), and spaced thousands (`1 24 660`).
   - Parses structured stock badges (`In stock · X left`, `Only X left`, `Out of stock`).
4. **Data Integrity Guarantee**:
   - `price_history` records are **only** created for verified, valid price scrapes.
   - A failed scrape never writes to `price_history`.
   - Tracked products preserve their last known valid price/stock if a later scrape fails, while updating `last_scrape_status = 'FAILED'`.
5. **Render Free-Tier Optimization**:
   - Sequential scraping using a single browser instance prevents memory spikes and container crashes.
   - Immediate `202 Accepted` response on cron invocation prevents 30s HTTP timeouts from external schedulers like cron-job.org.

---

## 3. Project Structure

```
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.js          # Supabase client + local fallback repository
│   │   │   └── schema.sql         # PostgreSQL table schemas, indexes, constraints
│   │   ├── routes/
│   │   │   ├── products.js        # Catalog search & details routes
│   │   │   ├── trackedProducts.js # CRUD, history, and logs routes
│   │   │   └── scrape.js          # Scheduled cron & manual scrape routes
│   │   ├── scraper/
│   │   │   ├── engine.js          # Playwright scraper engine with retries
│   │   │   └── validator.js       # Price & stock validation and normalization
│   │   ├── services/
│   │   │   └── catalogService.js  # Store catalog indexing & search
│   │   ├── scripts/
│   │   │   ├── runScraperHeaded.js   # Visible Chromium execution for demo
│   │   │   └── runScraperHeadless.js # Headless production scraper runner
│   │   ├── app.js                 # Express application & middleware
│   │   └── server.js              # Server entrypoint
│   ├── tests/
│   │   ├── db.test.js             # Database integrity & lock unit tests
│   │   ├── validator.test.js      # Price & stock parser unit tests
│   │   ├── api.test.js            # Express API integration tests
│   │   └── scraper.test.js        # Live scraper integration tests
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── HistoryModal.jsx   # Interactive price trend chart (Recharts)
│   │   │   └── LogsModal.jsx      # Audit logs modal with attempt details
│   │   ├── api.js                 # API client
│   │   ├── App.jsx                # Main dashboard UI
│   │   └── index.css              # Clean modern styling
│   ├── vercel.json                # Vercel SPA routing rewrite
│   └── package.json
├── docs/
│   └── DESIGN_NOTES.md            # Detailed reconnaissance and architectural notes
├── package.json                   # Root workspace scripts
└── README.md
```

---

## 4. Local Setup & Quickstart

### Prerequisites
- **Node.js**: v18 or later (tested on v24)
- **npm**: v9 or later

### Step 1: Install Dependencies
From the repository root:
```bash
npm run install:all
```
Install Playwright Chromium browser:
```bash
cd backend
npx playwright install chromium
cd ..
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` in `backend`:
```bash
cp backend/.env.example backend/.env
```
*(If no Supabase credentials are provided, the backend seamlessly runs with its embedded local database for testing and development).*

Copy `.env.example` in `frontend`:
```bash
cp frontend/.env.example frontend/.env
```

### Step 3: Run Unit & Integration Tests
```bash
npm test
```
Runs 25 automated test units (21 distinct named leaf assertions across 4 test suites: 9 Backend API, 5 Database Integrity & Distributed Locking, 1 Live Mock Storefront Scraper, and 6 Value Validator tests) using Node.js built-in test runner (`node:test`).

---

## 5. Running the Application

### Running the Backend
```bash
npm run start:backend
```
Backend starts on `http://localhost:3001` (Health check: `http://localhost:3001/health`).
*(Note: If `NODE_ENV=production` is set, valid Supabase PostgreSQL credentials are required; the service fails fast and refuses to silently fall back to an in-memory repository).*

### Running the Frontend
In another terminal:
```bash
npm run start:frontend
```
Frontend runs on `http://localhost:5173`.

### Running the Headed Scraper (Visual Demo)
To visibly launch Chromium and watch the interaction, challenge resolution, and price extraction in real time:
```bash
npm run scrape:headed
```
The headed runner demonstrates both the **retry path** (Attempt 1 transient storefront response failure $\to$ exponential backoff $\to$ Attempt 2 real mock storefront success with status `RETRIED`) and the **direct success path** (Attempt 1 clean success with status `SUCCESS`). To also demonstrate persistent 3-attempt failure, run:
```bash
npm run scrape:headed -- --include-failure
```

---

## 6. Database Setup (Supabase PostgreSQL)

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in the Supabase dashboard.
3. Paste and run the contents of [`backend/src/db/schema.sql`](backend/src/db/schema.sql).
4. Copy your project credentials:
   - **Project URL**: `https://<ref>.supabase.co`
   - **Service Role Key**: (Found in Settings $\to$ API $\to$ `service_role secret`)
5. Add them to `backend/.env`:
   ```env
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   ```

---

## 7. Scheduled Scraping Configuration (cron-job.org)

1. Create a free account at [cron-job.org](https://cron-job.org).
2. Create a new Cronjob:
   - **URL**: `https://<YOUR-RENDER-BACKEND-URL>/api/scrape/cron`
   - **Schedule**: Every 2 hours (`0 */2 * * *`)
   - **Request Method**: `POST`
   - **Headers**:
     * `Content-Type`: `application/json`
     * `x-cron-secret`: `<YOUR_CRON_SECRET>`
3. Save and test execution. The backend returns `202 Accepted` immediately and processes the active catalog sequentially in the background.

---

## 8. Production Deployment

### Backend on Render (Recommended: Docker Web Service)
Because Playwright Chromium requires Linux shared OS libraries (`libnss3`, `libatk1.0-0`, `libgbm1`, etc.) that cannot be installed at build time by unprivileged non-root users on native Web Services, deploying via Docker is strongly recommended:

1. Create a **Web Service** on [render.com](https://render.com) connected to your repository.
2. Root Directory: `backend`
3. Environment / Runtime: **Docker** (Render will automatically detect `backend/Dockerfile` based on `mcr.microsoft.com/playwright:v1.50.1-noble`).
4. Add Environment Variables in the Render dashboard:
   - `NODE_ENV`: `production`
   - `PORT`: `3001`
   - `SUPABASE_URL`: `https://<ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<service_role_key>`
   - `CRON_SECRET`: `<secure_random_string>`
   - `MOCK_STORE_URL`: `https://demo.inelabteamdev.com`

*(Alternative Native Node Service: Root directory `backend`, Runtime `Node`, Build command `npm install && (npx playwright install --with-deps chromium || npx playwright install chromium)`, Start command `node src/server.js`).*

### Frontend on Vercel
1. Create a new project on [vercel.com](https://vercel.com) pointing to the `frontend` directory.
2. Framework Preset: `Vite`
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Add Environment Variable:
   - `VITE_API_BASE_URL`: `https://<your-render-app>.onrender.com`
6. Deploy.

---

## 9. Verification & Submission Audit Checklist

- [x] **Storefront Reconnaissance**: Verified DOM, layout variations, anti-bot mouse challenge, and decoy elements.
- [x] **Partial & Full Product Search**: Instant search against mock store catalog with debouncing.
- [x] **Product Tracking**: Duplicate prevention, canonical URL preservation, and initial scrape triggering.
- [x] **Scheduled Scraping**: Protected `POST /api/scrape/cron` with distributed locking.
- [x] **Strict Validation**: Normalized fullwidth digits, stripped zero-width characters, validated strictly positive prices.
- [x] **Data Integrity**: Price history updated ONLY on valid scrape; previous valid prices preserved on failure; retried scrapes assigned status `RETRIED`.
- [x] **Audit Trail**: Every scrape logged with attempts, duration, and diagnostic errors.
- [x] **Headed Demo**: `npm run scrape:headed` visibly executes in Chromium with slowMo, demonstrating both retry and direct success paths.
- [x] **Full-Stack Dashboard**: React UI with search, tracked products table, Recharts price trend modal, and logs modal.
- [x] **Test Coverage**: 25 automated unit and integration tests passing (21 named leaf assertions).
