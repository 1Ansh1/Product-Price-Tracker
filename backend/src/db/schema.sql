-- ====================================================================
-- Product Price Tracker Schema (Supabase PostgreSQL)
-- ====================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tracked Products Table
CREATE TABLE IF NOT EXISTS tracked_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_product_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    sku TEXT,
    url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    current_price NUMERIC(12, 2),
    current_stock INTEGER,
    current_stock_status TEXT,
    last_scraped_at TIMESTAMPTZ,
    last_scrape_status TEXT DEFAULT 'PENDING',
    last_scrape_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for searching and filtering active products
CREATE INDEX IF NOT EXISTS idx_tracked_products_active ON tracked_products(is_active);
CREATE INDEX IF NOT EXISTS idx_tracked_products_store_id ON tracked_products(store_product_id);

-- 2. Price History Table (ONLY verified valid scrape results)
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracked_product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    price NUMERIC(12, 2) NOT NULL,
    stock INTEGER NOT NULL,
    stock_status TEXT NOT NULL,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for history queries
CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(tracked_product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_scraped_at ON price_history(scraped_at DESC);

-- 3. Scrape Logs Table (Honest recording of all scraper outcomes)
CREATE TABLE IF NOT EXISTS scrape_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracked_product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 1,
    duration_ms INTEGER NOT NULL,
    price_extracted NUMERIC(12, 2),
    stock_extracted INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for logs
CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_id ON scrape_logs(tracked_product_id);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_created_at ON scrape_logs(created_at DESC);

-- 4. Cron Locks Table (Atomic concurrency prevention across distributed instances)
CREATE TABLE IF NOT EXISTS cron_locks (
    id TEXT PRIMARY KEY,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    owner TEXT NOT NULL
);
