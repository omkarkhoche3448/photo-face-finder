const express = require('express');
const router = express.Router();
const googlePhotos = require('../services/googlePhotos');
const scanModel = require('../models/scan.model');
const sessionModel = require('../models/session.model');
const { encrypt } = require('../utils/encryption');
const { validateSessionId } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const queue = require('../queue');

/**
 * GET /api/auth/google/init/:sessionId
 * Initialize Google OAuth flow
 */
router.get(
  '/google/init/:sessionId',
  validateSessionId,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    // Verify session exists
    const session = await sessionModel.getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'Session does not exist or has expired',
      });
    }

    // Generate OAuth URL with session ID in state
    const authUrl = googlePhotos.getAuthUrl(sessionId);

    logger.info(`OAuth flow initiated for session: ${sessionId}`);

    res.json({
      authUrl,
      sessionId,
    });
  })
);

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state: sessionId, error } = req.query;

    // Handle OAuth errors
    if (error) {
      logger.error('OAuth error:', error);
      return res.redirect(
        `${process.env.FRONTEND_URL}/error?message=${encodeURIComponent('OAuth authorization failed')}`
      );
    }

    if (!code || !sessionId) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/error?message=${encodeURIComponent('Missing authorization code')}`
      );
    }

    try {
      // Exchange code for tokens
      logger.info(`Exchanging OAuth code for session: ${sessionId}`);
      const tokens = await googlePhotos.getTokensFromCode(code);

      if (!tokens.access_token) {
        throw new Error('No access token received from Google');
      }

      // Get user info
      const userInfo = await googlePhotos.getUserInfo(tokens.access_token);
      logger.info(`OAuth successful for user: ${userInfo.email}`);

      // Encrypt tokens (store both access and refresh tokens)
      const tokenData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      };
      const encryptedToken = encrypt(JSON.stringify(tokenData));

      // Get session embeddings
      const session = await sessionModel.getSessionById(sessionId);
      if (!session) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/error?message=${encodeURIComponent('Session not found')}`
        );
      }

      // Create scan record
      const scan = await scanModel.createScan({
        sessionId,
        friendEmail: userInfo.email,
        oauthTokenEncrypted: encryptedToken,
        jobId: null, // Will be set when job is created
      });

      // Add scan job to queue
      const job = await queue.addScanJob({
        scanId: scan.id,
        sessionId,
        oauthToken: encryptedToken,
        referenceEmbeddings: session.embeddings,
      });

      // Update scan with job ID
      await scanModel.updateScan(scan.id, { job_id: job.id });

      logger.info(`Scan job created: ${job.id} for scan: ${scan.id}`);

      // Redirect to frontend with scan info
      res.redirect(
        `${process.env.FRONTEND_URL}/scan/${sessionId}?scanId=${scan.id}&jobId=${job.id}`
      );
    } catch (error) {
      logger.error('OAuth callback error:', error);
      res.redirect(
        `${process.env.FRONTEND_URL}/error?message=${encodeURIComponent('Failed to process authorization')}`
      );
    }
  })
);

/**
 * POST /api/auth/revoke
 * Revoke OAuth token (optional, for security)
 */
router.post(
  '/revoke',
  asyncHandler(async (req, res) => {
    const { scanId } = req.body;

    if (!scanId) {
      return res.status(400).json({
        error: 'Scan ID required',
        message: 'Please provide a scan ID',
      });
    }

    const scan = await scanModel.getScanById(scanId);

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found',
        message: 'Scan does not exist',
      });
    }

    // Update scan to remove token
    await scanModel.updateScan(scanId, {
      oauth_token_encrypted: null,
    });

    logger.info(`OAuth token revoked for scan: ${scanId}`);

    res.json({
      message: 'OAuth token revoked successfully',
      scanId,
    });
  })
);

module.exports = router;
