const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || `Request failed with status ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error(`Cannot connect to backend server at ${API_BASE}. Make sure the backend is running.`);
    }
    throw err;
  }
}

export const api = {
  getBaseUrl() {
    return API_BASE;
  },

  async checkHealth() {
    return request('/health');
  },

  async searchProducts(q) {
    return request(`/api/products/search?q=${encodeURIComponent(q)}&limit=20`);
  },

  async getTrackedProducts() {
    const res = await request('/api/tracked-products');
    return res.data || [];
  },

  async trackProduct(productData) {
    return request('/api/tracked-products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },

  async deleteTrackedProduct(id) {
    return request(`/api/tracked-products/${id}`, {
      method: 'DELETE'
    });
  },

  async getPriceHistory(productId) {
    const res = await request(`/api/tracked-products/${productId}/history`);
    return res.data || [];
  },

  async getScrapeLogs(productId) {
    const res = await request(`/api/tracked-products/${productId}/logs`);
    return res.data || [];
  },

  async triggerManualScrape(productId) {
    return request('/api/scrape/manual', {
      method: 'POST',
      body: JSON.stringify({ productId })
    });
  }
};
