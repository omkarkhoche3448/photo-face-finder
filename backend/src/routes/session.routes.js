const express = require('express');
const router = express.Router();
const fs = require('fs');
const sessionModel = require('../models/session.model');
const faceDetection = require('../services/faceDetection');
const s3Upload = require('../services/s3Upload');
const { uploadMultiple, cleanupUploadedFiles } = require('../middleware/upload');
const { validateSessionCreation, validateSessionId, validateEmail } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * POST /api/sessions/create
 * Create a new session with reference photos
 */
router.post(
  '/create',
  uploadMultiple('referencePhotos', 5),
  validateSessionCreation,
  asyncHandler(async (req, res) => {
    const { creatorName, creatorEmail } = req.body;
    const files = req.files;

    try {
      logger.info(`Creating session for ${creatorEmail} with ${files.length} reference photos`);

      // Read file buffers
      const buffers = files.map((file) => fs.readFileSync(file.path));

      // Extract face embeddings from reference photos
      const embeddings = await faceDetection.extractReferenceEmbeddings(buffers);

      if (embeddings.length === 0) {
        cleanupUploadedFiles(files);
        return res.status(400).json({
          error: 'No faces detected',
          message: 'No valid faces found in the uploaded photos. Please upload clear photos showing your face.',
        });
      }

      // Upload reference photos to S3
      const s3Uploads = await Promise.all(
        files.map((file, index) =>
          s3Upload.uploadPhoto(buffers[index], file.originalname, {
            type: 'reference',
            creatorEmail,
          })
        )
      );

      const referencePhotoUrls = s3Uploads.map((upload) => upload.url);

      // Create session in database
      const session = await sessionModel.createSession({
        creatorName,
        creatorEmail,
        embeddings,
        referencePhotos: referencePhotoUrls,
      });

      // Clean up local files
      cleanupUploadedFiles(files);

      // Generate shareable link
      const shareableLink = `${config.server.frontendUrl}/scan/${session.id}`;

      logger.info(`Session created successfully: ${session.id}`);

      res.status(201).json({
        sessionId: session.id,
        shareableLink,
        creatorName: session.creator_name,
        referencePhotos: session.reference_photos,
        embeddingsCount: embeddings.length,
        expiresAt: session.expires_at,
      });
    } catch (error) {
      // Clean up files on error
      cleanupUploadedFiles(files);
      throw error;
    }
  })
);

/**
 * GET /api/sessions/:sessionId
 * Get session details
 */
router.get(
  '/:sessionId',
  validateSessionId,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const session = await sessionModel.getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'Session does not exist or has expired',
      });
    }

    // Don't send embeddings to client (security)
    const { embeddings, ...sessionData } = session;

    res.json({
      ...sessionData,
      embeddingsCount: embeddings ? embeddings.length : 0,
    });
  })
);

/**
 * GET /api/sessions/:sessionId/stats
 * Get session statistics
 */
router.get(
  '/:sessionId/stats',
  validateSessionId,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const stats = await sessionModel.getSessionStats(sessionId);

    if (!stats) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'Session does not exist',
      });
    }

    res.json(stats);
  })
);

/**
 * GET /api/sessions/by-email
 * Get all sessions for an email
 */
router.get(
  '/by-email',
  validateEmail,
  asyncHandler(async (req, res) => {
    const { email } = req.query;

    const sessions = await sessionModel.getSessionsByEmail(email);

    // Remove embeddings from response
    const sessionsData = sessions.map(({ embeddings, ...session }) => ({
      ...session,
      embeddingsCount: embeddings ? embeddings.length : 0,
    }));

    res.json({
      sessions: sessionsData,
      total: sessionsData.length,
    });
  })
);

/**
 * DELETE /api/sessions/:sessionId
 * Delete a session
 */
router.delete(
  '/:sessionId',
  validateSessionId,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    const session = await sessionModel.getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'Session does not exist',
      });
    }

    // TODO: Delete associated S3 photos (optional, consider retention policy)

    await sessionModel.deleteSession(sessionId);

    logger.info(`Session deleted: ${sessionId}`);

    res.json({
      message: 'Session deleted successfully',
      sessionId,
    });
  })
);

module.exports = router;
