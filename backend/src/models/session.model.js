const db = require('../db');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Create a new session
 * @param {Object} data - Session data
 * @param {string} data.creatorName - Creator's name
 * @param {string} data.creatorEmail - Creator's email
 * @param {Array} data.embeddings - Face embeddings
 * @param {Array} data.referencePhotos - S3 URLs of reference photos
 * @returns {Promise<Object>} - Created session
 */
async function createSession(data) {
  try {
    const { creatorName, creatorEmail, embeddings, referencePhotos } = data;

    const result = await db.query(
      `INSERT INTO sessions (creator_name, creator_email, embeddings, reference_photos, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${config.session.expiryDays} days')
       RETURNING *`,
      [creatorName, creatorEmail, JSON.stringify(embeddings), referencePhotos]
    );

    logger.info(`Session created: ${result.rows[0].id}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating session:', error);
    throw error;
  }
}

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} - Session or null
 */
async function getSessionById(sessionId) {
  try {
    const result = await db.query(
      'SELECT * FROM sessions WHERE id = $1 AND status = $2',
      [sessionId, 'active']
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      await updateSession(sessionId, { status: 'expired' });
      return null;
    }

    return session;
  } catch (error) {
    logger.error('Error getting session:', error);
    throw error;
  }
}

/**
 * Update session
 * @param {string} sessionId - Session ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated session
 */
async function updateSession(sessionId, updates) {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(sessionId);

    const result = await db.query(
      `UPDATE sessions SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error updating session:', error);
    throw error;
  }
}

/**
 * Delete session
 * @param {string} sessionId - Session ID
 * @returns {Promise<void>}
 */
async function deleteSession(sessionId) {
  try {
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    logger.info(`Session deleted: ${sessionId}`);
  } catch (error) {
    logger.error('Error deleting session:', error);
    throw error;
  }
}

/**
 * Get all sessions for a user
 * @param {string} email - User email
 * @returns {Promise<Array>} - Sessions
 */
async function getSessionsByEmail(email) {
  try {
    const result = await db.query(
      'SELECT * FROM sessions WHERE creator_email = $1 ORDER BY created_at DESC',
      [email]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error getting sessions by email:', error);
    throw error;
  }
}

/**
 * Get session statistics
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} - Statistics
 */
async function getSessionStats(sessionId) {
  try {
    const result = await db.query(
      `SELECT
        s.id,
        s.creator_name,
        s.created_at,
        COUNT(DISTINCT sc.id) as total_scans,
        COUNT(DISTINCT sc.id) FILTER (WHERE sc.status = 'completed') as completed_scans,
        COALESCE(SUM(sc.matched_photos), 0) as total_matched_photos
       FROM sessions s
       LEFT JOIN scans sc ON s.id = sc.session_id
       WHERE s.id = $1
       GROUP BY s.id`,
      [sessionId]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting session stats:', error);
    throw error;
  }
}

/**
 * Clean up expired sessions
 * @returns {Promise<number>} - Number of deleted sessions
 */
async function cleanupExpiredSessions() {
  try {
    const result = await db.query(
      `UPDATE sessions SET status = 'expired'
       WHERE expires_at < NOW() AND status = 'active'
       RETURNING id`
    );

    logger.info(`Marked ${result.rows.length} sessions as expired`);
    return result.rows.length;
  } catch (error) {
    logger.error('Error cleaning up expired sessions:', error);
    throw error;
  }
}

module.exports = {
  createSession,
  getSessionById,
  updateSession,
  deleteSession,
  getSessionsByEmail,
  getSessionStats,
  cleanupExpiredSessions,
};
