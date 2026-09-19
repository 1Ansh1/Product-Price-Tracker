import dotenv from 'dotenv';
import { app } from './app.js';
import { catalogService } from './services/catalogService.js';

dotenv.config();

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`  PRICE TRACKER BACKEND SERVICE`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Health Route: http://localhost:${PORT}/health`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('====================================================');

  // Pre-warm catalog cache asynchronously
  catalogService.getCatalog()
    .then(items => {
      console.log(`[BOOT] Store catalog pre-warmed: ${items.length} products loaded.`);
    })
    .catch(err => {
      console.warn('[BOOT] Catalog pre-warm deferred:', err.message);
    });
});

// Graceful shutdown
function shutdown() {
  console.log('[BOOT] Shutting down backend service gracefully...');
  server.close(() => {
    console.log('[BOOT] HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
