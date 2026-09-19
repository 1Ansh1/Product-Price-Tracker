import express from 'express';
import cors from 'cors';
import { productsRouter } from './routes/products.js';
import { trackedProductsRouter } from './routes/trackedProducts.js';
import { scrapeRouter } from './routes/scrape.js';
import { db } from './db/index.js';

export const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-cron-secret']
}));

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: db.isConfigured() ? 'supabase' : 'local_store',
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Mount API routes
app.use('/api/products', productsRouter);
app.use('/api/tracked-products', trackedProductsRouter);
app.use('/api/scrape', scrapeRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});
