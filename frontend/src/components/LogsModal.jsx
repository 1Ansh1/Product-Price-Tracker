import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { X, FileText, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';

export function LogsModal({ product, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function fetchLogs() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getScrapeLogs(product.id);
        if (active) setLogs(data);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchLogs();
    return () => { active = false; };
  }, [product.id]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Scrape Audit Logs</h2>
            <p className="modal-subtitle">{product.name} (Store ID: {product.store_product_id})</p>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="state-box">
              <div className="spinner-loader" />
              <p>Loading execution audit logs...</p>
            </div>
          ) : error ? (
            <div className="state-box error-box">
              <AlertCircle size={32} color="#e53e3e" />
              <p>Failed to load logs: {error}</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="state-box empty-box">
              <Clock size={36} color="#718096" />
              <p>No scrape attempts logged yet.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Duration</th>
                    <th>Extracted Result / Diagnostic Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const isSuccess = log.status === 'SUCCESS';
                    return (
                      <tr key={log.id} className={isSuccess ? '' : 'row-failure'}>
                        <td>{new Date(log.created_at).toLocaleString()}</td>
                        <td>
                          <span className={`badge ${isSuccess ? 'badge-success' : 'badge-danger'}`}>
                            {isSuccess ? <CheckCircle2 size={12} className="inline-icon" /> : <XCircle size={12} className="inline-icon" />}
                            {log.status}
                          </span>
                        </td>
                        <td>
                          <span className="attempt-pill">
                            {log.attempts} {log.attempts === 1 ? 'attempt' : 'attempts'}
                          </span>
                        </td>
                        <td>{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                        <td className="log-detail-cell">
                          {isSuccess ? (
                            <span className="success-text">
                              Price: ₹{Number(log.price_extracted).toLocaleString()} · Stock: {log.stock_extracted}
                            </span>
                          ) : (
                            <span className="error-text">
                              {log.error_message || 'Scrape execution failed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
