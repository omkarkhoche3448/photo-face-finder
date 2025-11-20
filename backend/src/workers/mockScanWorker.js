const { scanQueue } = require('../queue');
const scanModel = require('../models/scan.model');
const matchedPhotoModel = require('../models/matchedPhoto.model');
const redis = require('../db/redis');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Update scan progress in both database and Redis
 */
async function updateProgress(scanId, progress) {
  try {
    const progressKey = `scan:progress:${scanId}`;
    await redis.hmset(progressKey, progress);
    await redis.expire(progressKey, 86400);

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
 * Simulate a delay
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate mock photo data
 */
function generateMockPhotos(count) {
  const mockPhotos = [];
  const baseTime = Date.now();

  for (let i = 0; i < count; i++) {
    mockPhotos.push({
      id: `mock-photo-${i}`,
      filename: `IMG_${String(i).padStart(4, '0')}.jpg`,
      mimeType: 'image/jpeg',
      baseUrl: `https://picsum.photos/800/600?random=${i}`,
      mediaMetadata: {
        creationTime: new Date(baseTime - (i * 86400000)).toISOString(),
        width: 800,
        height: 600,
      },
    });
  }

  return mockPhotos;
}

/**
 * Process a scan job with MOCK data (for testing without Google Photos API)
 */
async function processMockScan(job) {
  const { scanId, sessionId, referenceEmbeddings } = job.data;

  logger.info(`🎭 [MOCK MODE] Starting scan job: ${job.id} for scan: ${scanId}`);
  logger.warn('⚠️  Using MOCK mode - no real Google Photos data will be accessed');

  try {
    await scanModel.markScanStarted(scanId);

    let totalPhotos = 0;
    let scannedPhotos = 0;
    let matchedPhotos = 0;
    let uploadedPhotos = 0;

    // Simulate fetching photos (2 second delay)
    logger.info(`🎭 [MOCK] Simulating photo fetch...`);
    await delay(2000);

    // Generate mock photos (between 20-50 for testing)
    const mockPhotoCount = Math.floor(Math.random() * 31) + 20;
    const allPhotos = generateMockPhotos(mockPhotoCount);
    totalPhotos = allPhotos.length;

    logger.info(`🎭 [MOCK] Generated ${totalPhotos} mock photos`);

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

    // Process photos in batches with realistic delays
    const matchedPhotosData = [];

    for (let i = 0; i < allPhotos.length; i += batchSize) {
      const currentBatch = Math.floor(i / batchSize) + 1;
      const batch = allPhotos.slice(i, i + batchSize);

      logger.info(`🎭 [MOCK] Processing batch ${currentBatch}/${totalBatches} (${batch.length} photos)`);

      // Simulate processing each photo
      for (const photo of batch) {
        // Simulate face detection delay (50-200ms per photo)
        await delay(Math.random() * 150 + 50);

        scannedPhotos++;

        // Randomly match ~30% of photos for realistic testing
        const isMatch = Math.random() < 0.3;

        if (isMatch) {
          matchedPhotos++;

          matchedPhotosData.push({
            googlePhotoId: photo.id,
            googlePhotoUrl: photo.baseUrl,
            confidence: 0.65 + Math.random() * 0.30, // Random confidence between 0.65-0.95
            metadata: {
              filename: photo.filename,
              mimeType: photo.mimeType,
              creationTime: photo.mediaMetadata?.creationTime,
              width: photo.mediaMetadata?.width,
              height: photo.mediaMetadata?.height,
            },
          });

          logger.info(`🎭 [MOCK] Match found! Photo: ${photo.filename}`);
        }

        // Update progress every 5 photos
        if (scannedPhotos % 5 === 0) {
          await updateProgress(scanId, {
            totalPhotos,
            scannedPhotos,
            matchedPhotos,
            uploadedPhotos,
            currentBatch,
            totalBatches,
          });

          const progressPercent = Math.floor((scannedPhotos / totalPhotos) * 100);
          job.progress(progressPercent);
        }
      }

      logger.info(`🎭 [MOCK] Batch ${currentBatch} complete. Matched: ${matchedPhotos}`);
    }

    logger.info(`🎭 [MOCK] Scanning complete. Found ${matchedPhotos} matches out of ${totalPhotos} photos`);

    // Simulate uploading matched photos
    if (matchedPhotosData.length > 0) {
      logger.info(`🎭 [MOCK] Simulating upload of ${matchedPhotosData.length} photos...`);

      const photoRecords = matchedPhotosData.map((matchData, index) => ({
        scanId,
        googlePhotoId: matchData.googlePhotoId,
        googlePhotoUrl: matchData.googlePhotoUrl,
        s3Url: `https://mock-s3-bucket.s3.amazonaws.com/mock/${scanId}/${index}.jpg`,
        s3Key: `scans/${scanId}/${index}.jpg`,
        thumbnailUrl: `https://picsum.photos/200/200?random=${index}`,
        confidenceScore: matchData.confidence,
        metadata: matchData.metadata,
      }));

      // Simulate upload progress
      for (let i = 0; i < photoRecords.length; i++) {
        await delay(300); // 300ms per photo upload simulation
        uploadedPhotos = i + 1;

        await updateProgress(scanId, {
          totalPhotos,
          scannedPhotos,
          matchedPhotos,
          uploadedPhotos,
          currentBatch: totalBatches,
          totalBatches,
        });

        if (uploadedPhotos % 5 === 0 || uploadedPhotos === matchedPhotos) {
          logger.info(`🎭 [MOCK] Upload progress: ${uploadedPhotos}/${matchedPhotos}`);
        }
      }

      await matchedPhotoModel.createMatchedPhotos(photoRecords);
      logger.info(`🎭 [MOCK] Saved ${photoRecords.length} matched photos to database`);
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

    await scanModel.markScanCompleted(scanId);

    logger.info(`🎭 [MOCK] Scan completed successfully: ${scanId}`);

    return {
      success: true,
      totalPhotos,
      scannedPhotos,
      matchedPhotos,
      uploadedPhotos,
      mockMode: true,
    };
  } catch (error) {
    logger.error(`🎭 [MOCK] Scan job failed: ${job.id}`, error);
    await scanModel.markScanFailed(scanId, error.message);
    throw error;
  }
}

/**
 * Start the MOCK worker
 */
function startMockWorker() {
  logger.info('🎭 ========================================');
  logger.info('🎭 Starting MOCK scan worker...');
  logger.info('🎭 ⚠️  MOCK MODE ENABLED - No real Google Photos API calls');
  logger.info('🎭 ========================================');

  // Process jobs in MOCK mode
  scanQueue.process('process-scan', config.worker.concurrency, processMockScan);

  logger.info(`🎭 Mock scan worker started with concurrency: ${config.worker.concurrency}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing mock worker...');
    await scanQueue.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, closing mock worker...');
    await scanQueue.close();
    process.exit(0);
  });
}

// Start worker if run directly
if (require.main === module) {
  startMockWorker();
}

module.exports = {
  startMockWorker,
  processMockScan,
};
