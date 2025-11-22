const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const config = require('./config');
const logger = require('./utils/logger');
const db = require('./db');
const redis = require('./db/redis');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { cleanupOnError } = require('./middleware/upload');

// Import routes
const healthRoutes = require('./routes/health.routes');
const sessionRoutes = require('./routes/session.routes');
const authRoutes = require('./routes/auth.routes');
const scanRoutes = require('./routes/scan.routes');

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable if frontend needs inline scripts
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: [
    config.server.frontendUrl,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Logging middleware
if (config.server.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }));
}

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve uploaded photos (for local development storage)
const path = require('path');
app.use('/uploads/photos', express.static(path.join(__dirname, '..', 'uploads', 'photos')));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for scan status/progress endpoints (they need frequent polling)
    const path = req.path;
    return path.includes('/scans/') && (path.endsWith('/status') || path.endsWith('/progress'));
  },
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Cleanup uploaded files on error
app.use(cleanupOnError);

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/scans', scanRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Photo Extractor API',
    version: '2.0.0',
    status: 'running',
    architecture: 'hybrid (server-side processing)',
    documentation: '/api/health',
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  logger.info(`${signal} received, starting graceful shutdown...`);

  // Stop accepting new requests
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Close database connections
      await db.close();
      await redis.close();

      logger.info('All connections closed. Exiting...');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Start server
const server = app.listen(config.server.port, async () => {
  logger.info('='.repeat(50));
  logger.info(`Photo Extractor API v2.0 - Server Started`);
  logger.info('='.repeat(50));
  logger.info(`Environment: ${config.server.nodeEnv}`);
  logger.info(`Port: ${config.server.port}`);
  logger.info(`API URL: ${config.server.apiUrl}`);
  logger.info(`Frontend URL: ${config.server.frontendUrl}`);
  logger.info('='.repeat(50));

  // Test connections
  try {
    await db.query('SELECT NOW()');
    logger.info('✓ Database connected');

    await redis.redis.ping();
    logger.info('✓ Redis connected');

    logger.info('='.repeat(50));
    logger.info('Server ready to accept connections');
    logger.info('='.repeat(50));
  } catch (error) {
    logger.error('Failed to connect to services:', error);
    process.exit(1);
  }
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
