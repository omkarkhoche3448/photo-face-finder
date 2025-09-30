const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../config');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
// const sharp = require('sharp'); // Disabled for mock - no image optimization
const { v4: uuidv4 } = require('uuid');

// Determine if we should use local storage (development) or S3 (production)
const USE_LOCAL_STORAGE = config.nodeEnv === 'development' ||
                          config.aws.accessKeyId === 'your-aws-access-key-id' ||
                          !config.aws.accessKeyId;

// Initialize S3 client (only if not using local storage)
let s3Client = null;
if (!USE_LOCAL_STORAGE) {
  s3Client = new S3Client({
    region: config.aws.region,
    credentials: {
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
    },
  });
}

// Local storage directory
const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'uploads', 'photos');

// Ensure local storage directory exists
if (USE_LOCAL_STORAGE) {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
  logger.info('📁 Using local file storage for photos (development mode)');
} else {
  logger.info('☁️  Using AWS S3 for photo storage (production mode)');
}

/**
 * Upload image buffer to local storage or S3
 * @param {Buffer} buffer - Image buffer
 * @param {string} filename - Original filename
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} - Upload result with URL and key
 */
async function uploadPhoto(buffer, filename, metadata = {}) {
  try {
    const key = `photos/${Date.now()}-${uuidv4()}-${filename}`;

    if (USE_LOCAL_STORAGE) {
      // Local storage: Save to disk
      const filePath = path.join(LOCAL_STORAGE_DIR, `${Date.now()}-${uuidv4()}-${filename}`);
      fs.writeFileSync(filePath, buffer);

      // Create URL for local access
      const url = `${config.server.apiUrl}/uploads/photos/${path.basename(filePath)}`;

      logger.info(`Photo saved locally: ${path.basename(filePath)}`);

      return {
        url,
        key: path.basename(filePath),
        bucket: 'local',
        localPath: filePath,
      };
    } else {
      // S3 storage: Upload to AWS
      const command = new PutObjectCommand({
        Bucket: config.aws.s3.bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'image/jpeg',
        Metadata: {
          originalName: filename,
          uploadedAt: new Date().toISOString(),
          ...metadata,
        },
      });

      await s3Client.send(command);

      const url = `https://${config.aws.s3.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`;

      logger.info(`Photo uploaded to S3: ${key}`);

      return {
        url,
        key,
        bucket: config.aws.s3.bucketName,
      };
    }
  } catch (error) {
    logger.error('Error uploading photo:', error.message);
    throw error;
  }
}

/**
 * Upload multiple photos in parallel
 * @param {Array} photos - Array of {buffer, filename, metadata}
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Array>} - Array of upload results
 */
async function uploadPhotosInBatch(photos, progressCallback = null) {
  const results = [];
  let completed = 0;

  // Upload with concurrency control
  const pLimit = require('p-limit');
  const limit = pLimit(5); // Max 5 concurrent uploads

  const promises = photos.map((photo) =>
    limit(async () => {
      try {
        const result = await uploadPhotoWithRetry(
          photo.buffer,
          photo.filename,
          photo.metadata
        );

        completed++;
        if (progressCallback) {
          progressCallback({
            completed,
            total: photos.length,
            percentage: Math.floor((completed / photos.length) * 100),
          });
        }

        return {
          ...result,
          originalId: photo.id,
          success: true,
        };
      } catch (error) {
        logger.error(`Failed to upload photo ${photo.filename}:`, error.message);
        return {
          originalId: photo.id,
          success: false,
          error: error.message,
        };
      }
    })
  );

  const settled = await Promise.allSettled(promises);

  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  }

  const successful = results.filter((r) => r.success).length;
  logger.info(`Uploaded ${successful}/${photos.length} photos to S3`);

  return results;
}

/**
 * Upload photo with retry logic
 * @param {Buffer} buffer - Image buffer
 * @param {string} filename - Filename
 * @param {Object} metadata - Metadata
 * @param {number} maxRetries - Maximum retries
 * @returns {Promise<Object>} - Upload result
 */
async function uploadPhotoWithRetry(buffer, filename, metadata = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadPhoto(buffer, filename, metadata);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      logger.warn(`Upload attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Generate presigned URL for downloading from S3
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiry in seconds (default: 1 hour)
 * @returns {Promise<string>} - Presigned URL
 */
async function getPresignedUrl(key, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: config.aws.s3.bucketName,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.error('Error generating presigned URL:', error);
    throw error;
  }
}

/**
 * Generate presigned URLs for multiple photos
 * @param {Array<string>} keys - Array of S3 keys
 * @param {number} expiresIn - URL expiry in seconds
 * @returns {Promise<Array>} - Array of {key, url}
 */
async function getPresignedUrls(keys, expiresIn = 3600) {
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const url = await getPresignedUrl(key, expiresIn);
        return { key, url, success: true };
      } catch (error) {
        logger.error(`Failed to generate presigned URL for ${key}:`, error.message);
        return { key, success: false, error: error.message };
      }
    })
  );

  return results;
}

/**
 * Create thumbnail from image buffer
 * @param {Buffer} buffer - Original image buffer
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {Promise<Buffer>} - Thumbnail buffer
 */
async function createThumbnail(buffer, width = 256, height = 256) {
  try {
    // MOCK: Return original buffer (Sharp disabled for development)
    logger.warn('⚠️  Thumbnail creation disabled - returning original image');
    return buffer;
  } catch (error) {
    logger.error('Error creating thumbnail:', error);
    throw error;
  }
}

/**
 * Upload photo with thumbnail
 * @param {Buffer} buffer - Original image buffer
 * @param {string} filename - Filename
 * @param {Object} metadata - Metadata
 * @returns {Promise<Object>} - Upload result with both URLs
 */
async function uploadPhotoWithThumbnail(buffer, filename, metadata = {}) {
  try {
    // Upload original
    const original = await uploadPhoto(buffer, filename, metadata);

    // Create and upload thumbnail
    const thumbnailBuffer = await createThumbnail(buffer);
    const thumbnailKey = `thumbnails/${Date.now()}-${uuidv4()}-thumb-${filename}`;

    const thumbnailCommand = new PutObjectCommand({
      Bucket: config.aws.s3.bucketName,
      Key: thumbnailKey,
      Body: thumbnailBuffer,
      ContentType: 'image/jpeg',
      Metadata: {
        type: 'thumbnail',
        originalKey: original.key,
      },
    });

    await s3Client.send(thumbnailCommand);

    const thumbnailUrl = `https://${config.aws.s3.bucketName}.s3.${config.aws.region}.amazonaws.com/${thumbnailKey}`;

    return {
      ...original,
      thumbnail: {
        url: thumbnailUrl,
        key: thumbnailKey,
      },
    };
  } catch (error) {
    logger.error('Error uploading photo with thumbnail:', error);
    throw error;
  }
}

/**
 * Delete photo from S3
 * @param {string} key - S3 object key
 * @returns {Promise<void>}
 */
async function deletePhoto(key) {
  try {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const command = new DeleteObjectCommand({
      Bucket: config.aws.s3.bucketName,
      Key: key,
    });

    await s3Client.send(command);
    logger.info(`Photo deleted from S3: ${key}`);
  } catch (error) {
    logger.error('Error deleting photo from S3:', error);
    throw error;
  }
}

/**
 * Delete multiple photos from S3
 * @param {Array<string>} keys - Array of S3 keys
 * @returns {Promise<Array>} - Results
 */
async function deletePhotos(keys) {
  const results = await Promise.allSettled(
    keys.map((key) => deletePhoto(key))
  );

  const successful = results.filter((r) => r.status === 'fulfilled').length;
  logger.info(`Deleted ${successful}/${keys.length} photos from S3`);

  return results;
}

module.exports = {
  uploadPhoto,
  uploadPhotosInBatch,
  uploadPhotoWithRetry,
  uploadPhotoWithThumbnail,
  getPresignedUrl,
  getPresignedUrls,
  createThumbnail,
  deletePhoto,
  deletePhotos,
};
