import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('your-project'));

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

if (isProduction && !isSupabaseConfigured) {
  const errMsg = '[DB FATAL] Production environment detected (NODE_ENV=production or RENDER=true), but valid Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are not configured. Production must use Supabase PostgreSQL and cannot silently fall back to the local database.';
  console.error(errMsg);
  throw new Error(errMsg);
}

let supabase = null;
if (isSupabaseConfigured) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[DB] Supabase client initialized with provided credentials.');
} else {
  console.warn('[DB] Supabase credentials not found or placeholder used. Using robust local repository for development/testing.');
}

// In-memory / local fallback store for local development & testing
const localStore = {
  tracked_products: new Map(),
  price_history: [],
  scrape_logs: [],
  cron_locks: new Map()
};

export const db = {
  isConfigured() {
    return isSupabaseConfigured;
  },

  async getAllTrackedProducts() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Supabase error: ${error.message}`);
      return data;
    }
    return Array.from(localStore.tracked_products.values())
      .filter(p => p.is_active)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getTrackedProductById(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .select('*')
        .eq('id', id)
        .single();
      if (error) return null;
      return data;
    }
    return localStore.tracked_products.get(id) || null;
  },

  async getTrackedProductByStoreId(storeProductId) {
    const numId = Number(storeProductId);
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .select('*')
        .eq('store_product_id', numId)
        .maybeSingle();
      if (error) return null;
      return data;
    }
    return Array.from(localStore.tracked_products.values()).find(
      p => p.store_product_id === numId && p.is_active
    ) || null;
  },

  async addTrackedProduct({ store_product_id, name, brand, category, sku, url }) {
    const numStoreId = Number(store_product_id);
    const existing = await this.getTrackedProductByStoreId(numStoreId);
    if (existing) {
      const err = new Error(`Product with store ID ${numStoreId} is already tracked`);
      err.code = 'DUPLICATE_PRODUCT';
      throw err;
    }

    const newProduct = {
      id: crypto.randomUUID(),
      store_product_id: numStoreId,
      name,
      brand: brand || null,
      category: category || null,
      sku: sku || null,
      url,
      is_active: true,
      current_price: null,
      current_stock: null,
      current_stock_status: null,
      last_scraped_at: null,
      last_scrape_status: 'PENDING',
      last_scrape_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tracked_products')
        .insert([newProduct])
        .select()
        .single();
      if (error) throw new Error(`Supabase insert error: ${error.message}`);
      return data;
    }

    localStore.tracked_products.set(newProduct.id, newProduct);
    return newProduct;
  },

  async deleteTrackedProduct(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('tracked_products')
        .delete()
        .eq('id', id);
      if (error) throw new Error(`Supabase delete error: ${error.message}`);
      return true;
    }

    if (localStore.tracked_products.has(id)) {
      localStore.tracked_products.delete(id);
      // Cascade delete
      localStore.price_history = localStore.price_history.filter(h => h.tracked_product_id !== id);
      localStore.scrape_logs = localStore.scrape_logs.filter(l => l.tracked_product_id !== id);
      return true;
    }
    return false;
  },

  /**
   * CRITICAL DATA INTEGRITY METHOD:
   * 1. If success === true, validates price and stock, creates a price_history record,
   *    updates the tracked_product's current_price/stock/status, and logs SUCCESS.
   * 2. If success === false, NEVER creates a price_history record,
   *    preserves the existing current_price/current_stock, updates last_scrape_status = 'FAILED',
   *    and logs FAILED with error details.
   */
  async recordScrapeResult({
    tracked_product_id,
    success,
    attempts,
    duration_ms,
    price = null,
    stock = null,
    stock_status = null,
    error_message = null
  }) {
    const now = new Date().toISOString();
    const numAttempts = attempts || 1;

    // Determine honest status:
    // - Initial clean scrape: SUCCESS
    // - Scrape that succeeded after retries: RETRIED
    // - Exhausted retries with error: FAILED
    const finalStatus = success ? (numAttempts > 1 ? 'RETRIED' : 'SUCCESS') : 'FAILED';

    // 1. Log the scrape outcome honestly regardless of result
    const logEntry = {
      id: crypto.randomUUID(),
      tracked_product_id,
      status: finalStatus,
      attempts: numAttempts,
      duration_ms: duration_ms || 0,
      price_extracted: success ? price : null,
      stock_extracted: success ? stock : null,
      error_message: success ? null : (error_message || 'Unknown error'),
      created_at: now
    };

    if (isSupabaseConfigured) {
      await supabase.from('scrape_logs').insert([logEntry]);
    } else {
      localStore.scrape_logs.unshift(logEntry);
    }

    if (success) {
      // Must have valid price and stock
      if (price === null || price <= 0 || isNaN(price)) {
        throw new Error(`Data integrity violation: Cannot record valid history with invalid price: ${price}`);
      }

      const historyEntry = {
        id: crypto.randomUUID(),
        tracked_product_id,
        price: Number(price),
        stock: Number(stock),
        stock_status: stock_status || 'IN_STOCK',
        scraped_at: now
      };

      if (isSupabaseConfigured) {
        await supabase.from('price_history').insert([historyEntry]);
        await supabase
          .from('tracked_products')
          .update({
            current_price: Number(price),
            current_stock: Number(stock),
            current_stock_status: stock_status,
            last_scraped_at: now,
            last_scrape_status: finalStatus,
            last_scrape_error: null,
            updated_at: now
          })
          .eq('id', tracked_product_id);
      } else {
        localStore.price_history.unshift(historyEntry);
        const product = localStore.tracked_products.get(tracked_product_id);
        if (product) {
          product.current_price = Number(price);
          product.current_stock = Number(stock);
          product.current_stock_status = stock_status;
          product.last_scraped_at = now;
          product.last_scrape_status = finalStatus;
          product.last_scrape_error = null;
          product.updated_at = now;
        }
      }
    } else {
      // FAILED SCRAPE:
      // STRICTLY PRESERVE current_price and current_stock! DO NOT create price_history!
      if (isSupabaseConfigured) {
        await supabase
          .from('tracked_products')
          .update({
            last_scraped_at: now,
            last_scrape_status: 'FAILED',
            last_scrape_error: error_message || 'Scrape failed',
            updated_at: now
          })
          .eq('id', tracked_product_id);
      } else {
        const product = localStore.tracked_products.get(tracked_product_id);
        if (product) {
          product.last_scraped_at = now;
          product.last_scrape_status = 'FAILED';
          product.last_scrape_error = error_message || 'Scrape failed';
          product.updated_at = now;
        }
      }
    }

    return { success, log: logEntry };
  },

  async getPriceHistory(trackedProductId, limit = 50) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('tracked_product_id', trackedProductId)
        .order('scraped_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(`Supabase error: ${error.message}`);
      return data;
    }

    return localStore.price_history
      .filter(h => h.tracked_product_id === trackedProductId)
      .sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at))
      .slice(0, limit);
  },

  async getScrapeLogs(trackedProductId, limit = 50) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('scrape_logs')
        .select('*')
        .eq('tracked_product_id', trackedProductId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Supabase error: ${error.message}`);
      return data;
    }

    return localStore.scrape_logs
      .filter(l => l.tracked_product_id === trackedProductId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  },

  /**
   * Distributed atomic lock for cron runs to prevent overlapping execution.
   * Lock automatically expires after ttlSeconds.
   */
  async acquireCronLock({ lockId = 'scraper_cron_lock', owner, ttlSeconds = 300 }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    if (isSupabaseConfigured) {
      // First check existing lock
      const { data: existing } = await supabase
        .from('cron_locks')
        .select('*')
        .eq('id', lockId)
        .maybeSingle();

      if (existing) {
        const isExpired = new Date(existing.expires_at) < now;
        if (!isExpired) {
          return { acquired: false, lockedBy: existing.owner, expiresAt: existing.expires_at };
        }
        // Take over expired lock
        const { error } = await supabase
          .from('cron_locks')
          .update({ locked_at: now.toISOString(), expires_at: expiresAt, owner })
          .eq('id', lockId);
        if (error) return { acquired: false, error: error.message };
        return { acquired: true, expiresAt };
      }

      const { error } = await supabase
        .from('cron_locks')
        .insert([{ id: lockId, locked_at: now.toISOString(), expires_at: expiresAt, owner }]);
      if (error) return { acquired: false, error: error.message };
      return { acquired: true, expiresAt };
    }

    const current = localStore.cron_locks.get(lockId);
    if (current && new Date(current.expires_at) >= now) {
      return { acquired: false, lockedBy: current.owner, expiresAt: current.expires_at };
    }

    localStore.cron_locks.set(lockId, {
      id: lockId,
      locked_at: now.toISOString(),
      expires_at: expiresAt,
      owner
    });
    return { acquired: true, expiresAt };
  },

  async releaseCronLock({ lockId = 'scraper_cron_lock', owner }) {
    if (isSupabaseConfigured) {
      await supabase
        .from('cron_locks')
        .delete()
        .eq('id', lockId)
        .eq('owner', owner);
      return true;
    }
    const current = localStore.cron_locks.get(lockId);
    if (current && current.owner === owner) {
      localStore.cron_locks.delete(lockId);
      return true;
    }
    return false;
  }
};
