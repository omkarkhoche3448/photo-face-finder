import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';

let detector = null;

/**
 * Initialize the face detection model
 */
export async function initializeFaceDetection() {
  if (detector) {
    return detector;
  }

  try {
    // Use MediaPipe FaceDetector model
    const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
    const detectorConfig = {
      runtime: 'tfjs',
      maxFaces: 2,
      refineLandmarks: true,
    };

    detector = await faceDetection.createDetector(model, detectorConfig);
    return detector;
  } catch (error) {
    console.error('Error initializing face detection:', error);
    throw new Error('Failed to load face detection model');
  }
}

/**
 * Generate face embeddings from reference photos
 * @param {Array<File>} files - Array of image files
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} - Array of face embeddings
 */
export async function generateFaceEmbeddings(files, onProgress = null) {
  const embeddings = [];

  try {
    if (onProgress) onProgress('Loading face detection model...');

    const detector = await initializeFaceDetection();

    if (onProgress) onProgress('Processing photos...');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (onProgress) onProgress(`Processing photo ${i + 1}/${files.length}...`);

      try {
        // Load image
        const img = await loadImage(file);

        // Detect faces
        const faces = await detector.estimateFaces(img);

        if (faces.length === 0) {
          console.warn(`No face detected in ${file.name}`);
          continue;
        }

        // Get the first (best) face
        const face = faces[0];

        // Extract embedding from face keypoints
        const embedding = extractEmbeddingFromKeypoints(face.keypoints);

        embeddings.push({
          fileName: file.name,
          embedding,
          confidence: face.score || 0.95,
          box: face.box,
        });

      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
      }
    }

    if (onProgress) onProgress(`Detected faces in ${embeddings.length}/${files.length} photos`);

    return embeddings;

  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error;
  }
}

/**
 * Load image from file
 * @param {File} file - Image file
 * @returns {Promise<HTMLImageElement>} - Loaded image
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Extract embedding vector from face keypoints
 * @param {Array} keypoints - Face keypoints from MediaPipe
 * @returns {Array<number>} - 128-dimensional embedding vector
 */
function extractEmbeddingFromKeypoints(keypoints) {
  // MediaPipe provides keypoints, we'll create a simple embedding
  // In production, use a proper face recognition model like FaceNet

  const embedding = [];

  // Extract features from keypoints
  keypoints.forEach(point => {
    embedding.push(point.x, point.y);
    if (point.z !== undefined) {
      embedding.push(point.z);
    }
  });

  // Normalize to 128 dimensions
  const targetLength = 128;

  if (embedding.length < targetLength) {
    // Pad with zeros
    while (embedding.length < targetLength) {
      embedding.push(0);
    }
  } else if (embedding.length > targetLength) {
    // Truncate
    embedding.length = targetLength;
  }

  // Normalize the embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / (magnitude || 1));
}

/**
 * Calculate cosine similarity between two embeddings
 * @param {Array<number>} embedding1 - First embedding
 * @param {Array<number>} embedding2 - Second embedding
 * @returns {number} - Similarity score (0-1)
 */
export function calculateSimilarity(embedding1, embedding2) {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));

  // Normalize to 0-1 range
  return (similarity + 1) / 2;
}

/**
 * Match a face against reference embeddings
 * @param {HTMLImageElement} image - Image to check
 * @param {Array<Array<number>>} referenceEmbeddings - Reference embeddings
 * @param {number} threshold - Match threshold (default 0.6)
 * @returns {Promise<Object>} - Match result
 */
export async function matchFace(image, referenceEmbeddings, threshold = 0.6) {
  try {
    const detector = await initializeFaceDetection();

    // Detect faces in image
    const faces = await detector.estimateFaces(image);

    if (faces.length === 0) {
      return {
        isMatch: false,
        confidence: 0,
        facesDetected: 0,
      };
    }

    // Get embedding from first face
    const face = faces[0];
    const embedding = extractEmbeddingFromKeypoints(face.keypoints);

    // Compare against all reference embeddings
    let maxSimilarity = 0;
    let bestMatchIndex = -1;

    referenceEmbeddings.forEach((refEmbed, index) => {
      const similarity = calculateSimilarity(embedding, refEmbed.embedding || refEmbed);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestMatchIndex = index;
      }
    });

    const isMatch = maxSimilarity >= threshold;

    return {
      isMatch,
      confidence: maxSimilarity,
      facesDetected: faces.length,
      bestMatchIndex,
      faceBox: face.box,
    };

  } catch (error) {
    console.error('Error matching face:', error);
    return {
      isMatch: false,
      confidence: 0,
      facesDetected: 0,
      error: error.message,
    };
  }
}

/**
 * Detect and match faces in multiple photos
 * @param {Array} photos - Array of photo objects from Google Photos
 * @param {Array} referenceEmbeddings - Reference embeddings to match against
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} - Array of matched photos
 */
export async function detectAndMatchFaces(photos, referenceEmbeddings, onProgress = null) {
  const matches = [];

  try {
    await initializeFaceDetection();

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: photos.length,
          percentage: Math.round(((i + 1) / photos.length) * 100),
          message: `Scanning photo ${i + 1} of ${photos.length}...`,
        });
      }

      try {
        // Load image from URL
        const img = await loadImageFromUrl(photo.baseUrl + '=w512-h512');

        // Match face
        const result = await matchFace(img, referenceEmbeddings);

        if (result.isMatch) {
          matches.push({
            ...photo,
            matchConfidence: result.confidence,
            faceBox: result.faceBox,
          });
        }

      } catch (error) {
        console.error(`Error processing photo ${photo.id}:`, error);
      }
    }

    if (onProgress) {
      onProgress({
        current: photos.length,
        total: photos.length,
        percentage: 100,
        message: `Found ${matches.length} matches!`,
      });
    }

    return matches;

  } catch (error) {
    console.error('Error in detectAndMatchFaces:', error);
    throw error;
  }
}

/**
 * Load image from URL
 * @param {string} url - Image URL
 * @returns {Promise<HTMLImageElement>} - Loaded image
 */
function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image from URL'));

    img.src = url;
  });
}

/**
 * Cleanup resources
 */
export function cleanup() {
  if (detector) {
    detector.dispose();
    detector = null;
  }
}
