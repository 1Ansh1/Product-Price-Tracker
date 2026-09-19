import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import { HistoryModal } from './components/HistoryModal';
import { LogsModal } from './components/LogsModal';
import {
  Search,
  RefreshCw,
  TrendingUp,
  FileText,
  Trash2,
  ExternalLink,
  PlusCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Activity,
  Layers,
  ShoppingBag
} from 'lucide-react';

export default function App() {
  // State
  const [trackedProducts, setTrackedProducts] = useState([]);
  const [loadingTracked, setLoadingTracked] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [backendHealth, setBackendHealth] = useState({ status: 'checking' });
  const [actionInProgress, setActionInProgress] = useState({}); // { [productId]: 'scraping' | 'untracking' | 'tracking' }
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message }

  // Modals
  const [activeHistoryProduct, setActiveHistoryProduct] = useState(null);
  const [activeLogsProduct, setActiveLogsProduct] = useState(null);

  const debounceTimer = useRef(null);

  // Show transient feedback banner
  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Check health & fetch tracked products
  const loadInitialData = useCallback(async () => {
    try {
      setLoadingTracked(true);
      const health = await api.checkHealth().catch(() => ({ status: 'offline' }));
      setBackendHealth(health);

      const products = await api.getTrackedProducts();
      setTrackedProducts(products);
    } catch (err) {
      showFeedback('error', err.message);
    } finally {
      setLoadingTracked(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
    // Poll tracked products list every 15s to catch background scrape updates
    const interval = setInterval(async () => {
      try {
        const products = await api.getTrackedProducts();
        setTrackedProducts(products);
      } catch (e) {}
    }, 15000);
    return () => clearInterval(interval);
  }, [loadInitialData]);

  // Handle product search with debounce
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!val.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await api.searchProducts(val.trim());
        setSearchResults(res.data || []);
      } catch (err) {
        showFeedback('error', `Search failed: ${err.message}`);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  };

  // Track product from search
  const handleTrackProduct = async (product) => {
    const storeId = product.id;
    setActionInProgress(prev => ({ ...prev, [storeId]: 'tracking' }));
    try {
      const payload = {
        store_product_id: storeId,
        name: product.name,
        brand: product.brand,
        category: product.category,
        sku: product.sku,
        url: `https://demo.inelabteamdev.com/product/${storeId}`
      };
      const res = await api.trackProduct(payload);
      showFeedback('success', `Product "${product.name}" added to tracking. Initial scrape started!`);
      // Refresh tracked list
      const updated = await api.getTrackedProducts();
      setTrackedProducts(updated);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      showFeedback('error', err.message);
    } finally {
      setActionInProgress(prev => ({ ...prev, [storeId]: null }));
    }
  };

  // Untrack product
  const handleUntrackProduct = async (product) => {
    if (!window.confirm(`Stop tracking "${product.name}"? Historical records and logs will be removed.`)) return;

    setActionInProgress(prev => ({ ...prev, [product.id]: 'untracking' }));
    try {
      await api.deleteTrackedProduct(product.id);
      showFeedback('success', `Removed "${product.name}" from tracking.`);
      setTrackedProducts(prev => prev.filter(p => p.id !== product.id));
    } catch (err) {
      showFeedback('error', err.message);
    } finally {
      setActionInProgress(prev => ({ ...prev, [product.id]: null }));
    }
  };

  // Manual Scrape on-demand
  const handleManualScrape = async (product) => {
    setActionInProgress(prev => ({ ...prev, [product.id]: 'scraping' }));
    try {
      const res = await api.triggerManualScrape(product.id);
      const outcome = res.data;
      if (outcome && outcome.success) {
        showFeedback('success', `Scraped "${product.name}" successfully: ₹${outcome.price.toLocaleString()} · Stock: ${outcome.stock}`);
      } else {
        showFeedback('error', `Scrape failed for "${product.name}": ${outcome?.error_message || 'Could not extract values'}`);
      }
      // Refresh list
      const updated = await api.getTrackedProducts();
      setTrackedProducts(updated);
    } catch (err) {
      showFeedback('error', err.message);
    } finally {
      setActionInProgress(prev => ({ ...prev, [product.id]: null }));
    }
  };

  const isProductTracked = (storeId) => {
    return trackedProducts.some(p => p.store_product_id === storeId);
  };

  return (
    <div className="app-container">
      {/* Top Navigation */}
      <header className="app-header">
        <div className="header-left">
          <ShoppingBag className="brand-icon" size={28} />
          <div>
            <h1 className="app-title">Product Price Tracker</h1>
            <p className="app-subtitle">Continuous Web Scraping & Integrity Engine</p>
          </div>
        </div>
        <div className="header-right">
          <div className="health-badge">
            <span className={`status-dot ${backendHealth.status === 'healthy' ? 'dot-online' : 'dot-offline'}`} />
            <span>Backend: {backendHealth.status}</span>
          </div>
          <a
            href="https://demo.inelabteamdev.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            Open Mock Store <ExternalLink size={14} className="inline-icon" />
          </a>
        </div>
      </header>

      {/* Transient Alerts */}
      {feedback && (
        <div className={`notification-banner banner-${feedback.type}`}>
          {feedback.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="main-content">
        {/* Search / Add Products Section */}
        <section className="dashboard-card search-card">
          <div className="card-header">
            <h2 className="card-title">Search & Track Products</h2>
            <p className="card-subtitle">Search the mock store catalog by product name, brand, or SKU</p>
          </div>
          <div className="search-input-wrapper">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              className="search-input"
              placeholder="Type product name (e.g. Meridian, Notebook, Earbuds)..."
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {isSearching && <div className="spinner-sm" />}
          </div>

          {/* Search Results Dropdown / Grid */}
          {searchResults.length > 0 && (
            <div className="search-results-box">
              <h3 className="results-count">{searchResults.length} matching products found:</h3>
              <div className="results-list">
                {searchResults.map(p => {
                  const tracked = isProductTracked(p.id);
                  const isActionBusy = actionInProgress[p.id] === 'tracking';
                  return (
                    <div key={p.id} className="search-item">
                      <div className="search-item-info">
                        <span className="search-item-brand">{p.brand} · {p.category}</span>
                        <h4 className="search-item-name">{p.name}</h4>
                        <span className="search-item-sku">SKU: {p.sku}</span>
                        <p className="search-item-desc">{p.description}</p>
                      </div>
                      <div className="search-item-actions">
                        <a
                          href={`https://demo.inelabteamdev.com/product/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm"
                        >
                          View Store <ExternalLink size={12} />
                        </a>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={tracked || isActionBusy}
                          onClick={() => handleTrackProduct(p)}
                        >
                          {isActionBusy ? (
                            <>Adding...</>
                          ) : tracked ? (
                            <>Already Tracked</>
                          ) : (
                            <><PlusCircle size={14} className="inline-icon" /> Track</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Tracked Products Section */}
        <section className="dashboard-card">
          <div className="card-header header-with-action">
            <div>
              <h2 className="card-title">Tracked Catalog ({trackedProducts.length})</h2>
              <p className="card-subtitle">
                Scheduled scrape runs every 2 hours. Price history updates exclusively on validated results.
              </p>
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={loadInitialData}
              disabled={loadingTracked}
            >
              <RefreshCw size={14} className={`inline-icon ${loadingTracked ? 'spin' : ''}`} /> Refresh
            </button>
          </div>

          {loadingTracked ? (
            <div className="state-box">
              <div className="spinner-loader" />
              <p>Loading tracked products...</p>
            </div>
          ) : trackedProducts.length === 0 ? (
            <div className="state-box empty-box">
              <Layers size={40} color="#a0aec0" />
              <p className="empty-title">No products tracked yet</p>
              <p className="empty-desc">Use the search bar above to select products from the mock store and start monitoring prices.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Last Known Valid Price</th>
                    <th>Current Stock</th>
                    <th>Last Scraped</th>
                    <th>Latest Outcome</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trackedProducts.map(product => {
                    const isScraping = actionInProgress[product.id] === 'scraping';
                    const isUntracking = actionInProgress[product.id] === 'untracking';
                    const isSuccess = product.last_scrape_status === 'SUCCESS';
                    const isFailed = product.last_scrape_status === 'FAILED';
                    const isPending = product.last_scrape_status === 'PENDING';

                    return (
                      <tr key={product.id}>
                        {/* Product Info */}
                        <td>
                          <div className="product-title-group">
                            <a
                              href={product.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="product-name-link"
                            >
                              {product.name} <ExternalLink size={12} className="inline-icon" />
                            </a>
                            <span className="product-meta">
                              {product.brand} · SKU: {product.sku}
                            </span>
                          </div>
                        </td>

                        {/* Last Known Valid Price */}
                        <td>
                          {product.current_price !== null && product.current_price !== undefined ? (
                            <span className="price-display">₹{Number(product.current_price).toLocaleString()}</span>
                          ) : (
                            <span className="text-muted">Awaiting scrape</span>
                          )}
                        </td>

                        {/* Stock */}
                        <td>
                          {product.current_stock !== null && product.current_stock !== undefined ? (
                            <span className={`badge ${product.current_stock > 0 ? 'badge-success' : 'badge-danger'}`}>
                              {product.current_stock > 0 ? `${product.current_stock} in stock` : 'Out of stock'}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        {/* Last Scraped */}
                        <td>
                          {product.last_scraped_at ? (
                            <div className="timestamp-group">
                              <span className="time-primary">
                                {new Date(product.last_scraped_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="time-secondary">
                                {new Date(product.last_scraped_at).toLocaleDateString()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted">Pending initial run</span>
                          )}
                        </td>

                        {/* Latest Outcome */}
                        <td>
                          {isSuccess && (
                            <span className="badge badge-success" title="Latest scrape completed and validated">
                              <CheckCircle size={12} className="inline-icon" /> SUCCESS
                            </span>
                          )}
                          {isFailed && (
                            <div className="failure-status-cell" title={product.last_scrape_error || 'Scrape failed'}>
                              <span className="badge badge-danger">
                                <AlertTriangle size={12} className="inline-icon" /> FAILED
                              </span>
                              <small className="failure-tooltip-text">
                                {product.last_scrape_error || 'Check audit logs'}
                              </small>
                            </div>
                          )}
                          {isPending && (
                            <span className="badge badge-pending">
                              <Clock size={12} className="inline-icon" /> PENDING
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="action-button-group">
                            <button
                              className="btn btn-outline btn-xs"
                              disabled={isScraping}
                              onClick={() => handleManualScrape(product)}
                              title="Trigger immediate live scrape"
                            >
                              <RefreshCw size={12} className={`inline-icon ${isScraping ? 'spin' : ''}`} />
                              {isScraping ? 'Scraping...' : 'Scrape'}
                            </button>
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => setActiveHistoryProduct(product)}
                              title="View historical price chart"
                            >
                              <TrendingUp size={12} className="inline-icon" /> History
                            </button>
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => setActiveLogsProduct(product)}
                              title="View diagnostic execution logs"
                            >
                              <FileText size={12} className="inline-icon" /> Logs
                            </button>
                            <button
                              className="btn btn-danger-ghost btn-xs"
                              disabled={isUntracking}
                              onClick={() => handleUntrackProduct(product)}
                              title="Stop tracking this product"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Architecture & Integrity Info Footer Card */}
        <section className="dashboard-card info-card">
          <div className="info-grid">
            <div>
              <h4 className="info-title">Scheduled Scraper (Cron)</h4>
              <p className="info-text">
                Scraping runs every 2 hours via external scheduler to <code>/api/scrape/cron</code>.
                Overlapping runs are prevented by an atomic distributed lock with a 10-minute expiry safety ceiling.
              </p>
            </div>
            <div>
              <h4 className="info-title">Data Integrity Guarantee</h4>
              <p className="info-text">
                Failed scrapes or malformed values are recorded only to audit logs.
                A failed scrape will <strong>never</strong> overwrite existing valid prices or insert bogus history points.
              </p>
            </div>
            <div>
              <h4 className="info-title">Bot Challenge Defense</h4>
              <p className="info-text">
                Headless Playwright simulates dwell, mouse trajectory, and cookie overlay dismissal
                to satisfy the mock store's behavioral verification requirements.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Modals */}
      {activeHistoryProduct && (
        <HistoryModal
          product={activeHistoryProduct}
          onClose={() => setActiveHistoryProduct(null)}
        />
      )}

      {activeLogsProduct && (
        <LogsModal
          product={activeLogsProduct}
          onClose={() => setActiveLogsProduct(null)}
        />
      )}
    </div>
  );
}
