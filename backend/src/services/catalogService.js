const STORE_BASE = 'https://demo.inelabteamdev.com';

class CatalogService {
  constructor() {
    this.catalogCache = [];
    this.lastFetched = 0;
    this.cacheTtlMs = 60 * 60 * 1000; // 1 hour
    this.isFetching = false;
  }

  async fetchEntireCatalog() {
    if (this.isFetching) {
      // Wait for ongoing fetch
      while (this.isFetching) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this.catalogCache;
    }

    try {
      this.isFetching = true;
      console.log('[CATALOG] Fetching complete catalog from mock storefront...');
      const firstRes = await fetch(`${STORE_BASE}/api/catalog?page=1&pageSize=60`);
      if (!firstRes.ok) throw new Error(`Catalog API responded with ${firstRes.status}`);

      const firstData = await firstRes.json();
      const total = firstData.total || 0;
      const pages = Math.ceil(total / 60);

      const items = [...(firstData.items || [])];
      const pagePromises = [];

      for (let p = 2; p <= pages; p++) {
        pagePromises.push(
          fetch(`${STORE_BASE}/api/catalog?page=${p}&pageSize=60`)
            .then(res => res.ok ? res.json() : { items: [] })
            .then(data => data.items || [])
            .catch(err => {
              console.warn(`[CATALOG] Failed to fetch page ${p}: ${err.message}`);
              return [];
            })
        );
      }

      const rest = await Promise.all(pagePromises);
      rest.forEach(pageItems => items.push(...pageItems));

      this.catalogCache = items;
      this.lastFetched = Date.now();
      console.log(`[CATALOG] Cached ${this.catalogCache.length} products successfully.`);
      return this.catalogCache;
    } finally {
      this.isFetching = false;
    }
  }

  async getCatalog() {
    const isExpired = Date.now() - this.lastFetched > this.cacheTtlMs;
    if (this.catalogCache.length === 0 || isExpired) {
      return await this.fetchEntireCatalog();
    }
    return this.catalogCache;
  }

  async search(query, limit = 25) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      const all = await this.getCatalog();
      return all.slice(0, limit);
    }

    const all = await this.getCatalog();
    const cleanQ = query.trim().toLowerCase();
    const terms = cleanQ.split(/\s+/);

    const filtered = all.filter(p => {
      const name = (p.name || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      const category = (p.category || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();

      // Every term in query must match at least one attribute
      return terms.every(t => 
        name.includes(t) || brand.includes(t) || category.includes(t) || sku.includes(t) || desc.includes(t)
      );
    });

    return filtered.slice(0, limit);
  }

  async getProductDetails(storeProductId) {
    const res = await fetch(`${STORE_BASE}/api/product/${storeProductId}`);
    if (!res.ok) return null;
    return await res.json();
  }
}

export const catalogService = new CatalogService();
