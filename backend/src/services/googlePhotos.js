const { google } = require('googleapis');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const pLimit = require('p-limit');

/**
 * Get OAuth2 client
 * @returns {Object} - OAuth2 client
 */
function getOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

/**
 * Generate Google OAuth URL
 * @param {string} sessionId - Session ID to pass in state
 * @returns {string} - OAuth URL
 */
function getAuthUrl(sessionId) {
  const oauth2Client = getOAuth2Client();

  logger.info(`Generating OAuth URL with redirect_uri: ${config.google.redirectUri}`);

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: config.google.scopes,
    state: sessionId,
    prompt: 'consent',
  });

  logger.debug(`Generated OAuth URL: ${url}`);

  return url;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from callback
 * @returns {Promise<Object>} - Tokens object
 */
async function getTokensFromCode(code) {
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    logger.info('OAuth tokens obtained successfully');
    return tokens;
  } catch (error) {
    logger.error('Error exchanging code for tokens:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} - New tokens
 */
async function refreshAccessToken(refreshToken) {
  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    logger.info('Access token refreshed successfully');
    return credentials;
  } catch (error) {
    logger.error('Error refreshing access token:', error);
    throw error;
  }
}

/**
 * Get user info from Google
 * @param {string} accessToken - Access token
 * @returns {Promise<Object>} - User info
 */
async function getUserInfo(accessToken) {
  try {
    const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  } catch (error) {
    logger.error('Error fetching user info:', error);
    throw error;
  }
}

/**
 * Fetch all photo metadata from Google Photos
 * @param {string} accessToken - Access token
 * @param {Function} progressCallback - Progress callback function
 * @returns {Promise<Array>} - Array of photo metadata
 */
async function fetchAllPhotos(accessToken, progressCallback = null) {
  const photos = [];
  let pageToken = null;
  let pageCount = 0;

  try {
    do {
      const response = await axios.post(
        'https://photoslibrary.googleapis.com/v1/mediaItems:search',
        {
          pageSize: 100,
          pageToken,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const items = response.data.mediaItems || [];
      photos.push(...items);

      pageToken = response.data.nextPageToken;
      pageCount++;

      if (progressCallback) {
        progressCallback({
          totalFetched: photos.length,
          currentPage: pageCount,
        });
      }

      logger.debug(`Fetched page ${pageCount}, total photos: ${photos.length}`);

      // Small delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (pageToken);

    logger.info(`Fetched ${photos.length} photos from Google Photos`);
    return photos;
  } catch (error) {
    logger.error('Error fetching photos from Google Photos:', error);
    throw error;
  }
}

/**
 * Download photo as buffer
 * @param {string} baseUrl - Photo base URL from Google Photos
 * @param {number} width - Desired width (default: 512 for thumbnail)
 * @param {number} height - Desired height (default: 512 for thumbnail)
 * @returns {Promise<Buffer>} - Image buffer
 */
async function downloadPhoto(baseUrl, width = 512, height = 512) {
  try {
    const url = `${baseUrl}=w${width}-h${height}`;

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 second timeout
    });

    return Buffer.from(response.data);
  } catch (error) {
    logger.error(`Error downloading photo from ${baseUrl}:`, error.message);
    throw error;
  }
}

/**
 * Download original high-resolution photo
 * @param {string} baseUrl - Photo base URL
 * @returns {Promise<Buffer>} - Original image buffer
 */
async function downloadOriginalPhoto(baseUrl) {
  try {
    const url = `${baseUrl}=d`; // =d downloads original

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 second timeout for larger files
      maxContentLength: 100 * 1024 * 1024, // 100MB max
    });

    return Buffer.from(response.data);
  } catch (error) {
    logger.error(`Error downloading original photo from ${baseUrl}:`, error.message);
    throw error;
  }
}

/**
 * Download photos in batches with concurrency limit
 * @param {Array} photos - Array of photo objects with baseUrl
 * @param {number} concurrency - Max concurrent downloads
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Array>} - Array of photo buffers
 */
async function downloadPhotosInBatches(photos, concurrency = 5, progressCallback = null) {
  const limit = pLimit(concurrency);
  const results = [];
  let completed = 0;

  const promises = photos.map((photo) =>
    limit(async () => {
      try {
        const buffer = await downloadPhoto(photo.baseUrl);
        completed++;

        if (progressCallback) {
          progressCallback({
            completed,
            total: photos.length,
            percentage: Math.floor((completed / photos.length) * 100),
          });
        }

        return {
          id: photo.id,
          buffer,
          metadata: photo,
        };
      } catch (error) {
        logger.warn(`Failed to download photo ${photo.id}:`, error.message);
        return null;
      }
    })
  );

  const settled = await Promise.allSettled(promises);

  // Filter out failed downloads
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  }

  logger.info(`Downloaded ${results.length}/${photos.length} photos successfully`);
  return results;
}

/**
 * Download original photos for matched images
 * @param {Array} matchedPhotos - Array of matched photo metadata
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Array>} - Array of original photo buffers
 */
async function downloadOriginalPhotos(matchedPhotos, progressCallback = null) {
  const limit = pLimit(3); // Lower concurrency for large files
  const results = [];
  let completed = 0;

  const promises = matchedPhotos.map((photo) =>
    limit(async () => {
      try {
        const buffer = await downloadOriginalPhoto(photo.baseUrl);
        completed++;

        if (progressCallback) {
          progressCallback({
            completed,
            total: matchedPhotos.length,
            percentage: Math.floor((completed / matchedPhotos.length) * 100),
          });
        }

        return {
          id: photo.id,
          buffer,
          metadata: photo,
        };
      } catch (error) {
        logger.error(`Failed to download original photo ${photo.id}:`, error.message);
        return null;
      }
    })
  );

  const settled = await Promise.allSettled(promises);

  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    }
  }

  logger.info(`Downloaded ${results.length}/${matchedPhotos.length} original photos`);
  return results;
}

/**
 * Exponential backoff retry wrapper
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<any>} - Function result
 */
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      logger.warn(`Retry attempt ${i + 1} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

module.exports = {
  getOAuth2Client,
  getAuthUrl,
  getTokensFromCode,
  refreshAccessToken,
  getUserInfo,
  fetchAllPhotos,
  downloadPhoto,
  downloadOriginalPhoto,
  downloadPhotosInBatches,
  downloadOriginalPhotos,
  withRetry,
};
