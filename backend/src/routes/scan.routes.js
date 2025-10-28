const express = require('express');
const router = express.Router();
const scanModel = require('../models/scan.model');
const matchedPhotoModel = require('../models/matchedPhoto.model');
const queue = require('../queue');
const redis = require('../db/redis');
const { validateScanId, validateJobId, validatePagination } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * GET /api/scans/:scanId/status
 * Get current scan status (simplified for polling)
 */
router.get(
  '/:scanId/status',
  validateScanId,
  asyncHandler(async (req, res) => {
    const { scanId } = req.params;

    const scan = await scanModel.getScanById(scanId);

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found',
        message: 'Scan does not exist',
      });
    }

    // Get progress from Redis if available
    const progressKey = `scan:progress:${scanId}`;
    const progress = await redis.hgetall(progressKey);

    const totalPhotos = parseInt(progress?.totalPhotos || scan.total_photos || 0);
    const scannedPhotos = parseInt(progress?.scannedPhotos || scan.scanned_photos || 0);
    const matchedPhotos = parseInt(progress?.matchedPhotos || scan.matched_photos || 0);

    // Calculate progress percentage
    const progressPercent = totalPhotos > 0 ? Math.floor((scannedPhotos / totalPhotos) * 100) : 0;

    // Generate status message
    let message = 'Initializing scan...';
    if (scan.status === 'processing') {
      message = `Processing photos... ${scannedPhotos} of ${totalPhotos} scanned`;
    } else if (scan.status === 'completed') {
      message = `Scan complete! Found ${matchedPhotos} matching photos`;
    } else if (scan.status === 'failed') {
      message = scan.error_message || 'Scan failed';
    } else if (scan.status === 'waiting') {
      message = 'Waiting to start...';
    }

    res.json({
      status: scan.status,
      progress: progressPercent,
      message,
      totalPhotos,
      scannedPhotos,
      matchedPhotos,
      error: scan.error_message,
    });
  })
);

/**
 * GET /api/scans/:scanId
 * Get scan details
 */
router.get(
  '/:scanId',
  validateScanId,
  asyncHandler(async (req, res) => {
    const { scanId } = req.params;

    const scan = await scanModel.getScanById(scanId);

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found',
        message: 'Scan does not exist',
      });
    }

    // Don't send encrypted token to client
    const { oauth_token_encrypted, ...scanData } = scan;

    res.json(scanData);
  })
);

/**
 * GET /api/scans/:scanId/progress (Server-Sent Events)
 * Real-time progress updates
 */
router.get(
  '/:scanId/progress',
  validateScanId,
  asyncHandler(async (req, res) => {
    const { scanId } = req.params;

    // Verify scan exists
    const scan = await scanModel.getScanById(scanId);

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found',
        message: 'Scan does not exist',
      });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    logger.info(`SSE connection established for scan: ${scanId}`);

    // Send initial status
    const sendProgress = async () => {
      try {
        // Get progress from Redis
        const progressKey = `scan:progress:${scanId}`;
        const progress = await redis.hgetall(progressKey);

        // Get latest scan status from database
        const latestScan = await scanModel.getScanById(scanId);

        const data = {
          scanId,
          status: latestScan.status,
          totalPhotos: parseInt(progress?.totalPhotos || latestScan.total_photos || 0),
          scannedPhotos: parseInt(progress?.scannedPhotos || latestScan.scanned_photos || 0),
          matchedPhotos: parseInt(progress?.matchedPhotos || latestScan.matched_photos || 0),
          uploadedPhotos: parseInt(progress?.uploadedPhotos || latestScan.uploaded_photos || 0),
          currentBatch: parseInt(progress?.currentBatch || 0),
          totalBatches: parseInt(progress?.totalBatches || 0),
          error: latestScan.error_message,
          timestamp: new Date().toISOString(),
        };

        res.write(`data: ${JSON.stringify(data)}\n\n`);

        // If completed or failed, close connection
        if (latestScan.status === 'completed' || latestScan.status === 'failed') {
          logger.info(`Scan ${latestScan.status}: ${scanId}`);
          res.write('event: close\ndata: Scan completed\n\n');
          res.end();
          if (interval) clearInterval(interval);
        }
      } catch (error) {
        logger.error('Error sending progress:', error);
      }
    };

    // Send initial progress
    await sendProgress();

    // Send updates every 2 seconds
    const interval = setInterval(sendProgress, 2000);

    // Handle client disconnect
    req.on('close', () => {
      logger.info(`SSE connection closed for scan: ${scanId}`);
      clearInterval(interval);
      res.end();
    });
  })
);

/**
 * GET /api/scans/:scanId/results
 * Get scan results with matched photos
 */
router.get(
  '/:scanId/results',
  validateScanId,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { scanId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const scan = await scanModel.getScanById(scanId);

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found',
        message: 'Scan does not exist',
      });
    }

    // Get matched photos with pagination
    const photosData = await matchedPhotoModel.getMatchedPhotosPaginated(
      scanId,
      parseInt(limit),
      parseInt(offset)
    );

    // Get statistics
    const stats = await matchedPhotoModel.getMatchedPhotosStats(scanId);

    // Don't send encrypted token
    const { oauth_token_encrypted, ...scanData } = scan;

    res.json({
      scan: scanData,
      photos: photosData.photos,
      pagination: {
        total: photosData.total,
        limit: photosData.limit,
        offset: photosData.offset,
        hasMore: photosData.hasMore,
      },
      statistics: stats,
    });
  })
);

/**
 * GET /api/scans/job/:jobId/status
 * Get job status from queue
 */
router.get(
  '/job/:jobId/status',
  validateJobId,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const jobStatus = await queue.getJobStatus(jobId);

    if (jobStatus.status === 'not_found') {
      return res.status(404).json({
        error: 'Job not found',
        message: 'Job does not exist in queue',
      });
    }

    res.json(jobStatus);
  })
);

/**
 * POST /api/scans/:scanId/cancel
 * Cancel a running scan
 */
router.post(
  '/:scanId/cancel',
  validateScanId,
  asyncHandler(async (req, res) => {
    const { scanId } = req.params;

    const scan = await scanModel.getScanById(scanId);

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found',
        message: 'Scan does not exist',
      });
    }

    if (scan.status === 'completed' || scan.status === 'failed') {
      return res.status(400).json({
        error: 'Cannot cancel',
        message: 'Scan is already completed or failed',
      });
    }

    // Cancel the job
    if (scan.job_id) {
      await queue.cancelJob(scan.job_id);
    }

    // Update scan status
    await scanModel.updateScan(scanId, {
      status: 'cancelled',
      completed_at: new Date(),
    });

    logger.info(`Scan cancelled: ${scanId}`);

    res.json({
      message: 'Scan cancelled successfully',
      scanId,
    });
  })
);

/**
 * GET /api/scans/session/:sessionId
 * Get all scans for a session
 */
router.get(
  '/session/:sessionId',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const scans = await scanModel.getScansBySessionId(sessionId);

    // Remove encrypted tokens
    const scansData = scans.map(({ oauth_token_encrypted, ...scan }) => scan);

    res.json({
      scans: scansData,
      total: scansData.length,
    });
  })
);

/**
 * DELETE /api/scans/:scanId
 * Delete a scan and its results
 */
router.delete(
  '/:scanId',
  validateScanId,
  asyncHandler(async (req, res) => {
    const { scanId } = req.params;

    const scan = await scanModel.getScanById(scanId);

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found',
        message: 'Scan does not exist',
      });
    }

    // TODO: Delete S3 photos (optional, consider retention policy)

    // Delete matched photos first (foreign key)
    await matchedPhotoModel.deleteMatchedPhotosByScanId(scanId);

    // Delete scan
    await scanModel.deleteScan(scanId);

    logger.info(`Scan deleted: ${scanId}`);

    res.json({
      message: 'Scan deleted successfully',
      scanId,
    });
  })
);

module.exports = router;
