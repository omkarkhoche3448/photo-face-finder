const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * Upload photos to S3 via backend API
 * @param {Array} photos - Array of photo objects with blobs
 * @param {string} sessionId - Session ID
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} - Upload results
 */
export async function uploadToS3(photos, sessionId, onProgress = null) {
  const results = [];

  try {
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: photos.length,
          percentage: Math.round(((i + 1) / photos.length) * 100),
          message: `Uploading photo ${i + 1} of ${photos.length}...`,
        });
      }

      try {
        // Create form data
        const formData = new FormData();
        formData.append('photo', photo.blob, photo.filename || `photo-${Date.now()}.jpg`);
        formData.append('sessionId', sessionId);
        formData.append('photoId', photo.id);
        formData.append('matchConfidence', photo.matchConfidence || 0);

        // Upload to backend
        const response = await fetch(`${API_BASE_URL}/api/scans/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }

        const result = await response.json();

        results.push({
          photoId: photo.id,
          success: true,
          url: result.url,
          key: result.key,
        });

      } catch (error) {
        console.error(`Error uploading photo ${photo.id}:`, error);
        results.push({
          photoId: photo.id,
          success: false,
          error: error.message,
        });
      }
    }

    if (onProgress) {
      const successCount = results.filter(r => r.success).length;
      onProgress({
        current: photos.length,
        total: photos.length,
        percentage: 100,
        message: `Uploaded ${successCount} of ${photos.length} photos`,
      });
    }

    return results;

  } catch (error) {
    console.error('Error in uploadToS3:', error);
    throw error;
  }
}

/**
 * Upload single photo with retry logic
 * @param {Blob} blob - Photo blob
 * @param {string} filename - Filename
 * @param {Object} metadata - Additional metadata
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Object>} - Upload result
 */
export async function uploadPhotoWithRetry(blob, filename, metadata = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const formData = new FormData();
      formData.append('photo', blob, filename);

      Object.keys(metadata).forEach(key => {
        formData.append(key, metadata[key]);
      });

      const response = await fetch(`${API_BASE_URL}/api/scans/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.warn(`Upload attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Batch upload photos with concurrency control
 * @param {Array} photos - Photos to upload
 * @param {string} sessionId - Session ID
 * @param {number} concurrency - Number of concurrent uploads
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} - Upload results
 */
export async function batchUploadPhotos(photos, sessionId, concurrency = 5, onProgress = null) {
  const results = [];
  let completed = 0;

  // Create upload queue
  const queue = [...photos];
  const inProgress = new Set();

  while (queue.length > 0 || inProgress.size > 0) {
    // Start new uploads up to concurrency limit
    while (queue.length > 0 && inProgress.size < concurrency) {
      const photo = queue.shift();

      const uploadPromise = uploadPhotoWithRetry(
        photo.blob,
        photo.filename || `photo-${Date.now()}.jpg`,
        {
          sessionId,
          photoId: photo.id,
          matchConfidence: photo.matchConfidence || 0,
        }
      )
        .then(result => {
          results.push({
            photoId: photo.id,
            success: true,
            ...result,
          });
        })
        .catch(error => {
          results.push({
            photoId: photo.id,
            success: false,
            error: error.message,
          });
        })
        .finally(() => {
          inProgress.delete(uploadPromise);
          completed++;

          if (onProgress) {
            onProgress({
              current: completed,
              total: photos.length,
              percentage: Math.round((completed / photos.length) * 100),
              message: `Uploading ${completed}/${photos.length}...`,
            });
          }
        });

      inProgress.add(uploadPromise);
    }

    // Wait for at least one upload to complete
    if (inProgress.size > 0) {
      await Promise.race(inProgress);
    }
  }

  return results;
}

/**
 * Download photo as blob
 * @param {string} url - Photo URL
 * @returns {Promise<Blob>} - Photo blob
 */
export async function downloadPhotoAsBlob(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }

    return await response.blob();

  } catch (error) {
    console.error('Error downloading photo:', error);
    throw error;
  }
}
