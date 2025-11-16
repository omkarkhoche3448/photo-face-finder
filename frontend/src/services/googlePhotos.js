const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * Fetch photos from Google Photos API
 * @param {string} accessToken - Google OAuth access token
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} - Array of photos
 */
export async function fetchGooglePhotos(accessToken, onProgress = null) {
  const allPhotos = [];
  let pageToken = null;
  let pageCount = 0;

  try {
    do {
      if (onProgress) {
        onProgress(`Fetching photos... ${allPhotos.length} found so far`);
      }

      const url = new URL('https://photoslibrary.googleapis.com/v1/mediaItems');
      url.searchParams.append('pageSize', '100');
      if (pageToken) {
        url.searchParams.append('pageToken', pageToken);
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Google Photos API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.mediaItems) {
        allPhotos.push(...data.mediaItems);
      }

      pageToken = data.nextPageToken;
      pageCount++;

      // Limit to prevent infinite loops (max 10,000 photos)
      if (pageCount >= 100) {
        console.warn('Reached maximum page limit (10,000 photos)');
        break;
      }

    } while (pageToken);

    if (onProgress) {
      onProgress(`Found ${allPhotos.length} photos total`);
    }

    return allPhotos;

  } catch (error) {
    console.error('Error fetching Google Photos:', error);
    throw error;
  }
}

/**
 * Download photo from Google Photos
 * @param {string} baseUrl - Base URL of the photo
 * @param {number} width - Desired width
 * @param {number} height - Desired height
 * @returns {Promise<Blob>} - Photo blob
 */
export async function downloadPhoto(baseUrl, width = 512, height = 512) {
  try {
    const url = `${baseUrl}=w${width}-h${height}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download photo: ${response.status}`);
    }

    return await response.blob();

  } catch (error) {
    console.error('Error downloading photo:', error);
    throw error;
  }
}

/**
 * Download original photo from Google Photos
 * @param {string} baseUrl - Base URL of the photo
 * @returns {Promise<Blob>} - Original photo blob
 */
export async function downloadOriginalPhoto(baseUrl) {
  try {
    const url = `${baseUrl}=d`; // =d downloads original

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download original photo: ${response.status}`);
    }

    return await response.blob();

  } catch (error) {
    console.error('Error downloading original photo:', error);
    throw error;
  }
}

/**
 * Batch process photos
 * @param {Array} photos - Array of photo objects
 * @param {Function} processFn - Function to process each photo
 * @param {number} batchSize - Batch size
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} - Results
 */
export async function batchProcessPhotos(photos, processFn, batchSize = 50, onProgress = null) {
  const results = [];

  for (let i = 0; i < photos.length; i += batchSize) {
    const batch = photos.slice(i, i + batchSize);

    if (onProgress) {
      onProgress({
        current: i,
        total: photos.length,
        percentage: Math.round((i / photos.length) * 100),
      });
    }

    const batchResults = await Promise.all(
      batch.map(photo => processFn(photo))
    );

    results.push(...batchResults);

    // Small delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}
