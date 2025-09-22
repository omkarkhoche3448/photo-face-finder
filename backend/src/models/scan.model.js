const db = require('../db');
const logger = require('../utils/logger');

/**
 * Create a new scan
 * @param {Object} data - Scan data
 * @returns {Promise<Object>} - Created scan
 */
async function createScan(data) {
  try {
    const { sessionId, friendEmail, oauthTokenEncrypted, jobId } = data;

    const result = await db.query(
      `INSERT INTO scans (session_id, friend_email, oauth_token_encrypted, job_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [sessionId, friendEmail, oauthTokenEncrypted, jobId]
    );

    logger.info(`Scan created: ${result.rows[0].id}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating scan:', error);
    throw error;
  }
}

/**
 * Get scan by ID
 * @param {string} scanId - Scan ID
 * @returns {Promise<Object|null>} - Scan or null
 */
async function getScanById(scanId) {
  try {
    const result = await db.query('SELECT * FROM scans WHERE id = $1', [scanId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting scan:', error);
    throw error;
  }
}

/**
 * Get scan by job ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} - Scan or null
 */
async function getScanByJobId(jobId) {
  try {
    const result = await db.query('SELECT * FROM scans WHERE job_id = $1', [jobId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting scan by job ID:', error);
    throw error;
  }
}

/**
 * Update scan
 * @param {string} scanId - Scan ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated scan
 */
async function updateScan(scanId, updates) {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(scanId);

    const result = await db.query(
      `UPDATE scans SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error updating scan:', error);
    throw error;
  }
}

/**
 * Update scan progress
 * @param {string} scanId - Scan ID
 * @param {Object} progress - Progress data
 * @returns {Promise<Object>} - Updated scan
 */
async function updateScanProgress(scanId, progress) {
  try {
    const { totalPhotos, scannedPhotos, matchedPhotos, uploadedPhotos } = progress;

    const result = await db.query(
      `UPDATE scans SET
        total_photos = COALESCE($1, total_photos),
        scanned_photos = COALESCE($2, scanned_photos),
        matched_photos = COALESCE($3, matched_photos),
        uploaded_photos = COALESCE($4, uploaded_photos)
       WHERE id = $5
       RETURNING *`,
      [totalPhotos, scannedPhotos, matchedPhotos, uploadedPhotos, scanId]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error updating scan progress:', error);
    throw error;
  }
}

/**
 * Mark scan as started
 * @param {string} scanId - Scan ID
 * @returns {Promise<Object>} - Updated scan
 */
async function markScanStarted(scanId) {
  try {
    const result = await db.query(
      `UPDATE scans SET status = 'processing', started_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [scanId]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error marking scan as started:', error);
    throw error;
  }
}

/**
 * Mark scan as completed
 * @param {string} scanId - Scan ID
 * @returns {Promise<Object>} - Updated scan
 */
async function markScanCompleted(scanId) {
  try {
    const result = await db.query(
      `UPDATE scans SET status = 'completed', completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [scanId]
    );

    logger.info(`Scan completed: ${scanId}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Error marking scan as completed:', error);
    throw error;
  }
}

/**
 * Mark scan as failed
 * @param {string} scanId - Scan ID
 * @param {string} errorMessage - Error message
 * @returns {Promise<Object>} - Updated scan
 */
async function markScanFailed(scanId, errorMessage) {
  try {
    const result = await db.query(
      `UPDATE scans SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [errorMessage, scanId]
    );

    logger.error(`Scan failed: ${scanId} - ${errorMessage}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Error marking scan as failed:', error);
    throw error;
  }
}

/**
 * Get scans for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array>} - Scans
 */
async function getScansBySessionId(sessionId) {
  try {
    const result = await db.query(
      'SELECT * FROM scans WHERE session_id = $1 ORDER BY created_at DESC',
      [sessionId]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting scans by session:', error);
    throw error;
  }
}

/**
 * Get scan with session info
 * @param {string} scanId - Scan ID
 * @returns {Promise<Object|null>} - Scan with session data
 */
async function getScanWithSession(scanId) {
  try {
    const result = await db.query(
      `SELECT s.*, sess.creator_name, sess.embeddings
       FROM scans s
       JOIN sessions sess ON s.session_id = sess.id
       WHERE s.id = $1`,
      [scanId]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting scan with session:', error);
    throw error;
  }
}

/**
 * Delete scan
 * @param {string} scanId - Scan ID
 * @returns {Promise<void>}
 */
async function deleteScan(scanId) {
  try {
    await db.query('DELETE FROM scans WHERE id = $1', [scanId]);
    logger.info(`Scan deleted: ${scanId}`);
  } catch (error) {
    logger.error('Error deleting scan:', error);
    throw error;
  }
}

/**
 * Get recent scans statistics
 * @param {number} limit - Number of recent scans
 * @returns {Promise<Array>} - Scan statistics
 */
async function getRecentScans(limit = 10) {
  try {
    const result = await db.query(
      `SELECT
        s.id,
        s.status,
        s.total_photos,
        s.matched_photos,
        s.created_at,
        s.completed_at,
        sess.creator_name
       FROM scans s
       JOIN sessions sess ON s.session_id = sess.id
       ORDER BY s.created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting recent scans:', error);
    throw error;
  }
}

module.exports = {
  createScan,
  getScanById,
  getScanByJobId,
  updateScan,
  updateScanProgress,
  markScanStarted,
  markScanCompleted,
  markScanFailed,
  getScansBySessionId,
  getScanWithSession,
  deleteScan,
  getRecentScans,
};
