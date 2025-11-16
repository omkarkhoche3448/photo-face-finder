const express = require('express');
const router = express.Router();
const db = require('../db');
const redis = require('../db/redis');
const queue = require('../queue');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * GET /api/health
 * Health check endpoint
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      services: {
        database: 'unknown',
        redis: 'unknown',
        queue: 'unknown',
      },
    };

    // Check database
    try {
      await db.query('SELECT 1');
      health.services.database = 'healthy';
    } catch (error) {
      health.services.database = 'unhealthy';
      health.status = 'degraded';
    }

    // Check Redis
    try {
      await redis.redis.ping();
      health.services.redis = 'healthy';
    } catch (error) {
      health.services.redis = 'unhealthy';
      health.status = 'degraded';
    }

    // Check queue
    try {
      const stats = await queue.getQueueStats();
      health.services.queue = 'healthy';
      health.queue = stats;
    } catch (error) {
      health.services.queue = 'unhealthy';
      health.status = 'degraded';
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  })
);

/**
 * GET /api/health/ready
 * Readiness probe for Kubernetes/Docker
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if all critical services are available
    await Promise.all([
      db.query('SELECT 1'),
      redis.redis.ping(),
    ]);

    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

/**
 * GET /api/health/live
 * Liveness probe for Kubernetes/Docker
 */
router.get('/live', (req, res) => {
  res.status(200).json({ alive: true });
});

module.exports = router;
