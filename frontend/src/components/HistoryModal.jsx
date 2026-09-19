import React, { useEffect, useState } from 'react';
import { api } from '../api';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { X, TrendingUp, Calendar, AlertCircle } from 'lucide-react';

export function HistoryModal({ product, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function fetchHistory() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getPriceHistory(product.id);
        if (active) setHistory(data);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchHistory();
    return () => { active = false; };
  }, [product.id]);

  const chartData = history.map(item => ({
    time: new Date(item.scraped_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    fullDate: new Date(item.scraped_at).toLocaleString(),
    price: Number(item.price),
    stock: item.stock
  }));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Price & Stock History</h2>
            <p className="modal-subtitle">{product.name} ({product.brand} · SKU: {product.sku})</p>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="state-box">
              <div className="spinner-loader" />
              <p>Loading historical records...</p>
            </div>
          ) : error ? (
            <div className="state-box error-box">
              <AlertCircle size={32} color="#e53e3e" />
              <p>Failed to load history: {error}</p>
            </div>
          ) : history.length === 0 ? (
            <div className="state-box empty-box">
              <Calendar size={36} color="#718096" />
              <p>No valid price history recorded yet.</p>
              <small>History records are created exclusively when verified valid price scrapes succeed.</small>
            </div>
          ) : (
            <>
              {/* Chart Section */}
              <div className="chart-container">
                <h3 className="section-heading">Price Trend</h3>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="time" stroke="#718096" fontSize={12} />
                      <YAxis
                        stroke="#718096"
                        fontSize={12}
                        domain={['auto', 'auto']}
                        tickFormatter={val => `₹${val.toLocaleString()}`}
                      />
                      <Tooltip
                        formatter={(val, name) => [
                          name === 'price' ? `₹${Number(val).toLocaleString()}` : val,
                          name === 'price' ? 'Price' : 'Stock'
                        ]}
                        labelFormatter={(_, arr) => arr[0]?.payload?.fullDate || ''}
                        contentStyle={{ background: '#fff', border: '1px solid #cbd5e0', borderRadius: '6px' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#3182ce"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#3182ce' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Data Table */}
              <div className="table-section">
                <h3 className="section-heading">Verified Records ({history.length})</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Verified Price</th>
                        <th>Stock Units</th>
                        <th>Stock Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice().reverse().map(item => (
                        <tr key={item.id}>
                          <td>{new Date(item.scraped_at).toLocaleString()}</td>
                          <td className="price-cell">₹{Number(item.price).toLocaleString()}</td>
                          <td>{item.stock}</td>
                          <td>
                            <span className={`badge ${item.stock_status === 'IN_STOCK' ? 'badge-success' : 'badge-danger'}`}>
                              {item.stock_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
