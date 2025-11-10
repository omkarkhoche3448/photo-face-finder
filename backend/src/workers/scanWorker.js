const { scanQueue } = require('../queue');
const googlePhotos = require('../services/googlePhotos');
const faceDetection = require('../services/faceDetection');
const s3Upload = require('../services/s3Upload');
const scanModel = require('../models/scan.model');
const matchedPhotoModel = require('../models/matchedPhoto.model');
const redis = require('../db/redis');
const { decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Update scan progress in both database and Redis
 */
async function updateProgress(scanId, progress) {
  try {
    // Update Redis for real-time SSE
    const progressKey = `scan:progress:${scanId}`;
    await redis.hmset(progressKey, progress);
    await redis.expire(progressKey, 86400); // 24 hour TTL

    // Update database
    await scanModel.updateScanProgress(scanId, {
      totalPhotos: progress.totalPhotos,
      scannedPhotos: progress.scannedPhotos,
      matchedPhotos: progress.matchedPhotos,
      uploadedPhotos: progress.uploadedPhotos,
    });

    logger.debug(`Progress updated for scan ${scanId}:`, progress);
  } catch (error) {
    logger.error('Error updating progress:', error);
  }
}

/**
 * Process a single scan job
 */
async function processScan(job) {
  const { scanId, sessionId, oauthToken, referenceEmbeddings } = job.data;

  logger.info(`Starting scan job: ${job.id} for scan: ${scanId}`);

  try {
    // Mark scan as started
    await scanModel.markScanStarted(scanId);

    // Decrypt OAuth token
    const decryptedToken = decrypt(oauthToken);
    let tokenData;

    try {
      // Try to parse as JSON (new format with refresh token)
      tokenData = JSON.parse(decryptedToken);
    } catch (e) {
      // Fallback to old format (just access token string)
      tokenData = { access_token: decryptedToken };
    }

    // Check if token needs refresh
    let accessToken = tokenData.access_token;
    if (tokenData.refresh_token && tokenData.expiry_date) {
      const now = Date.now();
      const expiryTime = tokenData.expiry_date;

      // Refresh if token expires in less than 5 minutes
      if (expiryTime - now < 5 * 60 * 1000) {
        logger.info('Access token expired or expiring soon, refreshing...');
        try {
          const newTokens = await googlePhotos.refreshAccessToken(tokenData.refresh_token);
          accessToken = newTokens.access_token;
          logger.info('Access token refreshed successfully');
        } catch (error) {
          logger.error('Failed to refresh access token:', error);
          throw new Error('OAuth token expired and refresh failed');
        }
      }
    }

    // Initialize progress
    let totalPhotos = 0;
    let scannedPhotos = 0;
    let matchedPhotos = 0;
    let uploadedPhotos = 0;

    // Step 1: Fetch all photo metadata from Google Photos
    logger.info(`Fetching photos from Google Photos for scan: ${scanId}`);

    const allPhotos = await googlePhotos.fetchAllPhotos(accessToken, (progress) => {
      totalPhotos = progress.totalFetched;
      updateProgress(scanId, {
        totalPhotos,
        scannedPhotos,
        matchedPhotos,
        uploadedPhotos,
        currentBatch: 0,
        totalBatches: 0,
      });
    });

    logger.info(`Fetched ${allPhotos.length} photos for scan: ${scanId}`);

    if (allPhotos.length === 0) {
      await scanModel.markScanCompleted(scanId);
      return {
        success: true,
        message: 'No photos found in Google Photos',
        totalPhotos: 0,
        matchedPhotos: 0,
      };
    }

    // Update total
    totalPhotos = allPhotos.length;
    const batchSize = config.worker.batchSize;
    const totalBatches = Math.ceil(totalPhotos / batchSize);

    await updateProgress(scanId, {
      totalPhotos,
      scannedPhotos,
      matchedPhotos,
      uploadedPhotos,
      currentBatch: 0,
      totalBatches,
    });

    // Step 2: Process photos in batches
    const matchedPhotosData = [];

    for (let i = 0; i < allPhotos.length; i += batchSize) {
      const currentBatch = Math.floor(i / batchSize) + 1;
      const batch = allPhotos.slice(i, i + batchSize);

      logger.info(`Processing batch ${currentBatch}/${totalBatches} (${batch.length} photos)`);

      // Download thumbnails for this batch
      const downloadedPhotos = await googlePhotos.downloadPhotosInBatches(
        batch,
        5, // 5 concurrent downloads
        (downloadProgress) => {
          logger.debug(`Download progress: ${downloadProgress.percentage}%`);
        }
      );

      // Process each photo with face detection
      for (const photo of downloadedPhotos) {
        try {
          // Match face against reference embeddings
          const matchResult = await faceDetection.matchFace(
            photo.buffer,
            referenceEmbeddings
          );

          scannedPhotos++;

          if (matchResult.isMatch) {
            matchedPhotos++;

            // Store match info temporarily
            matchedPhotosData.push({
              googlePhotoId: photo.id,
              googlePhotoUrl: photo.metadata.baseUrl,
              confidence: matchResult.confidence,
              metadata: {
                filename: photo.metadata.filename,
                mimeType: photo.metadata.mimeType,
                creationTime: photo.metadata.mediaMetadata?.creationTime,
                width: photo.metadata.mediaMetadata?.width,
                height: photo.metadata.mediaMetadata?.height,
              },
            });

            logger.info(`Match found! Confidence: ${(matchResult.confidence * 100).toFixed(1)}%`);
          }

          // Update progress every 10 photos
          if (scannedPhotos % 10 === 0) {
            await updateProgress(scanId, {
              totalPhotos,
              scannedPhotos,
              matchedPhotos,
              uploadedPhotos,
              currentBatch,
              totalBatches,
            });

            // Update job progress (0-100)
            const progressPercent = Math.floor((scannedPhotos / totalPhotos) * 100);
            job.progress(progressPercent);
          }
        } catch (error) {
          logger.error(`Error processing photo ${photo.id}:`, error.message);
          // Continue with next photo
        }
      }

      // Clear memory
      for (const photo of downloadedPhotos) {
        photo.buffer = null;
      }

      logger.info(`Batch ${currentBatch} complete. Matched: ${matchedPhotos}`);
    }

    logger.info(`Scanning complete. Found ${matchedPhotos} matches out of ${totalPhotos} photos`);

    // Step 3: Download originals and upload to S3
    if (matchedPhotosData.length > 0) {
      logger.info(`Downloading ${matchedPhotosData.length} original photos`);

      // Get metadata for matched photos
      const matchedPhotoMetadata = allPhotos.filter((photo) =>
        matchedPhotosData.some((match) => match.googlePhotoId === photo.id)
      );

      // Download original photos
      const originalPhotos = await googlePhotos.downloadOriginalPhotos(
        matchedPhotoMetadata,
        (downloadProgress) => {
          logger.info(`Downloading originals: ${downloadProgress.percentage}%`);
        }
      );

      logger.info(`Downloaded ${originalPhotos.length} original photos`);

      // Upload to S3
      const photosToUpload = originalPhotos.map((photo) => {
        const matchData = matchedPhotosData.find((m) => m.googlePhotoId === photo.id);
        return {
          id: photo.id,
          buffer: photo.buffer,
          filename: photo.metadata.filename || `photo-${photo.id}.jpg`,
          metadata: {
            scanId,
            sessionId,
            confidence: matchData?.confidence,
            originalCreationTime: photo.metadata.mediaMetadata?.creationTime,
          },
        };
      });

      const uploadResults = await s3Upload.uploadPhotosInBatch(
        photosToUpload,
        (uploadProgress) => {
          uploadedPhotos = uploadProgress.completed;

          updateProgress(scanId, {
            totalPhotos,
            scannedPhotos,
            matchedPhotos,
            uploadedPhotos,
            currentBatch: totalBatches,
            totalBatches,
          });

          logger.info(`Upload progress: ${uploadProgress.percentage}%`);
        }
      );

      // Save matched photos to database
      const photoRecords = uploadResults
        .filter((result) => result.success)
        .map((result) => {
          const matchData = matchedPhotosData.find((m) => m.googlePhotoId === result.originalId);
          return {
            scanId,
            googlePhotoId: result.originalId,
            googlePhotoUrl: matchData.googlePhotoUrl,
            s3Url: result.url,
            s3Key: result.key,
            thumbnailUrl: result.thumbnail?.url || null,
            confidenceScore: matchData.confidence,
            metadata: matchData.metadata,
          };
        });

      if (photoRecords.length > 0) {
        await matchedPhotoModel.createMatchedPhotos(photoRecords);
        logger.info(`Saved ${photoRecords.length} matched photos to database`);
      }

      uploadedPhotos = photoRecords.length;
    }

    // Final progress update
    await updateProgress(scanId, {
      totalPhotos,
      scannedPhotos,
      matchedPhotos,
      uploadedPhotos,
      currentBatch: totalBatches,
      totalBatches,
    });

    // Mark scan as completed
    await scanModel.markScanCompleted(scanId);

    logger.info(`Scan completed successfully: ${scanId}`);

    return {
      success: true,
      totalPhotos,
      scannedPhotos,
      matchedPhotos,
      uploadedPhotos,
    };
  } catch (error) {
    logger.error(`Scan job failed: ${job.id}`, error);

    // Mark scan as failed
    await scanModel.markScanFailed(scanId, error.message);

    throw error;
  }
}

/**
 * Start the worker
 */
function startWorker() {
  logger.info('Starting scan worker...');

  // Initialize face detection model
  faceDetection.initializeModel().catch((error) => {
    logger.error('Failed to initialize face detection model:', error);
    process.exit(1);
  });

  // Process jobs
  scanQueue.process('process-scan', config.worker.concurrency, processScan);

  logger.info(`Scan worker started with concurrency: ${config.worker.concurrency}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing worker...');
    await scanQueue.close();
    await faceDetection.cleanup();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, closing worker...');
    await scanQueue.close();
    await faceDetection.cleanup();
    process.exit(0);
  });
}

// Start worker if run directly
if (require.main === module) {
  startWorker();
}

module.exports = {
  startWorker,
  processScan,
};
