const db = require('../db');
const logger = require('../utils/logger');

/**
 * Create a matched photo record
 * @param {Object} data - Photo data
 * @returns {Promise<Object>} - Created photo record
 */
async function createMatchedPhoto(data) {
  try {
    const {
      scanId,
      googlePhotoId,
      googlePhotoUrl,
      s3Url,
      s3Key,
      thumbnailUrl,
      confidenceScore,
      metadata,
    } = data;

    const result = await db.query(
      `INSERT INTO matched_photos
       (scan_id, google_photo_id, google_photo_url, s3_url, s3_key, thumbnail_url, confidence_score, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        scanId,
        googlePhotoId,
        googlePhotoUrl,
        s3Url,
        s3Key,
        thumbnailUrl,
        confidenceScore,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error creating matched photo:', error);
    throw error;
  }
}

/**
 * Create multiple matched photos in batch
 * @param {Array} photos - Array of photo data objects
 * @returns {Promise<Array>} - Created photo records
 */
async function createMatchedPhotos(photos) {
  try {
    if (photos.length === 0) return [];

    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    photos.forEach((photo, i) => {
      const rowPlaceholders = [];
      for (let j = 0; j < 8; j++) {
        rowPlaceholders.push(`$${paramIndex++}`);
      }
      placeholders.push(`(${rowPlaceholders.join(', ')})`);

      values.push(
        photo.scanId,
        photo.googlePhotoId,
        photo.googlePhotoUrl,
        photo.s3Url,
        photo.s3Key,
        photo.thumbnailUrl,
        photo.confidenceScore,
        photo.metadata ? JSON.stringify(photo.metadata) : null
      );
    });

    const query = `
      INSERT INTO matched_photos
      (scan_id, google_photo_id, google_photo_url, s3_url, s3_key, thumbnail_url, confidence_score, metadata)
      VALUES ${placeholders.join(', ')}
      RETURNING *
    `;

    const result = await db.query(query, values);

    logger.info(`Created ${result.rows.length} matched photo records`);
    return result.rows;
  } catch (error) {
    logger.error('Error creating matched photos in batch:', error);
    throw error;
  }
}

/**
 * Get matched photo by ID
 * @param {string} photoId - Photo ID
 * @returns {Promise<Object|null>} - Photo record or null
 */
async function getMatchedPhotoById(photoId) {
  try {
    const result = await db.query(
      'SELECT * FROM matched_photos WHERE id = $1',
      [photoId]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting matched photo:', error);
    throw error;
  }
}

/**
 * Get all matched photos for a scan
 * @param {string} scanId - Scan ID
 * @returns {Promise<Array>} - Array of photo records
 */
async function getMatchedPhotosByScanId(scanId) {
  try {
    const result = await db.query(
      `SELECT * FROM matched_photos
       WHERE scan_id = $1
       ORDER BY confidence_score DESC, detected_at ASC`,
      [scanId]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting matched photos by scan:', error);
    throw error;
  }
}

/**
 * Get matched photos with pagination
 * @param {string} scanId - Scan ID
 * @param {number} limit - Number of photos per page
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Object>} - Photos with total count
 */
async function getMatchedPhotosPaginated(scanId, limit = 50, offset = 0) {
  try {
    const [photosResult, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM matched_photos
         WHERE scan_id = $1
         ORDER BY confidence_score DESC, detected_at ASC
         LIMIT $2 OFFSET $3`,
        [scanId, limit, offset]
      ),
      db.query(
        'SELECT COUNT(*) FROM matched_photos WHERE scan_id = $1',
        [scanId]
      ),
    ]);

    return {
      photos: photosResult.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
      hasMore: offset + limit < parseInt(countResult.rows[0].count),
    };
  } catch (error) {
    logger.error('Error getting paginated matched photos:', error);
    throw error;
  }
}

/**
 * Get matched photos with high confidence
 * @param {string} scanId - Scan ID
 * @param {number} minConfidence - Minimum confidence score (0-1)
 * @returns {Promise<Array>} - Array of high confidence photos
 */
async function getHighConfidencePhotos(scanId, minConfidence = 0.8) {
  try {
    const result = await db.query(
      `SELECT * FROM matched_photos
       WHERE scan_id = $1 AND confidence_score >= $2
       ORDER BY confidence_score DESC`,
      [scanId, minConfidence]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting high confidence photos:', error);
    throw error;
  }
}

/**
 * Update matched photo
 * @param {string} photoId - Photo ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated photo
 */
async function updateMatchedPhoto(photoId, updates) {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'metadata') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
      }
      paramIndex++;
    }

    values.push(photoId);

    const result = await db.query(
      `UPDATE matched_photos SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error updating matched photo:', error);
    throw error;
  }
}

/**
 * Delete matched photo
 * @param {string} photoId - Photo ID
 * @returns {Promise<void>}
 */
async function deleteMatchedPhoto(photoId) {
  try {
    await db.query('DELETE FROM matched_photos WHERE id = $1', [photoId]);
    logger.info(`Matched photo deleted: ${photoId}`);
  } catch (error) {
    logger.error('Error deleting matched photo:', error);
    throw error;
  }
}

/**
 * Delete all matched photos for a scan
 * @param {string} scanId - Scan ID
 * @returns {Promise<number>} - Number of deleted photos
 */
async function deleteMatchedPhotosByScanId(scanId) {
  try {
    const result = await db.query(
      'DELETE FROM matched_photos WHERE scan_id = $1 RETURNING id',
      [scanId]
    );

    logger.info(`Deleted ${result.rows.length} matched photos for scan ${scanId}`);
    return result.rows.length;
  } catch (error) {
    logger.error('Error deleting matched photos by scan:', error);
    throw error;
  }
}

/**
 * Get matched photos statistics for a scan
 * @param {string} scanId - Scan ID
 * @returns {Promise<Object>} - Statistics
 */
async function getMatchedPhotosStats(scanId) {
  try {
    const result = await db.query(
      `SELECT
        COUNT(*) as total_photos,
        AVG(confidence_score) as avg_confidence,
        MIN(confidence_score) as min_confidence,
        MAX(confidence_score) as max_confidence,
        COUNT(*) FILTER (WHERE confidence_score >= 0.9) as high_confidence_count,
        COUNT(*) FILTER (WHERE confidence_score >= 0.7 AND confidence_score < 0.9) as medium_confidence_count,
        COUNT(*) FILTER (WHERE confidence_score < 0.7) as low_confidence_count
       FROM matched_photos
       WHERE scan_id = $1`,
      [scanId]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error getting matched photos stats:', error);
    throw error;
  }
}

/**
 * Check if photo already matched (prevent duplicates)
 * @param {string} scanId - Scan ID
 * @param {string} googlePhotoId - Google Photo ID
 * @returns {Promise<boolean>} - True if exists
 */
async function photoAlreadyMatched(scanId, googlePhotoId) {
  try {
    const result = await db.query(
      'SELECT id FROM matched_photos WHERE scan_id = $1 AND google_photo_id = $2',
      [scanId, googlePhotoId]
    );

    return result.rows.length > 0;
  } catch (error) {
    logger.error('Error checking if photo already matched:', error);
    throw error;
  }
}

module.exports = {
  createMatchedPhoto,
  createMatchedPhotos,
  getMatchedPhotoById,
  getMatchedPhotosByScanId,
  getMatchedPhotosPaginated,
  getHighConfidencePhotos,
  updateMatchedPhoto,
  deleteMatchedPhoto,
  deleteMatchedPhotosByScanId,
  getMatchedPhotosStats,
  photoAlreadyMatched,
};
