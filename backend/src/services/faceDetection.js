const sizeOf = require('image-size');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * MOCK FACE DETECTION SERVICE
 * This is a simplified mock implementation for Windows development
 * In production, use TensorFlow.js with Docker or install Windows SDK
 */

let initialized = false;

/**
 * Initialize the face detection model (mock)
 */
async function initializeModel() {
  if (initialized) {
    return;
  }

  try {
    logger.warn('⚠️  Using MOCK face detection - Install Windows SDK or use Docker for real face detection');
    initialized = true;
    logger.info('Mock face detection initialized');
  } catch (error) {
    logger.error('Error initializing mock face detection:', error);
    throw error;
  }
}

/**
 * Detect faces in an image (mock - returns random detection)
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Array>} - Array of mock detected faces
 */
async function detectFaces(imageBuffer) {
  try {
    if (!initialized) {
      await initializeModel();
    }

    // DEBUG: Log buffer details
    logger.debug(`detectFaces called with buffer size: ${imageBuffer ? imageBuffer.length : 'NULL'}`);
    logger.debug(`Buffer is instance of Buffer: ${Buffer.isBuffer(imageBuffer)}`);

    if (!imageBuffer || imageBuffer.length === 0) {
      logger.error('Empty or null image buffer received');
      return [];
    }

    // Get image dimensions
    logger.debug('Attempting to get image dimensions with sizeOf...');
    const dimensions = sizeOf(imageBuffer);
    const { width, height } = dimensions;
    logger.debug(`Image dimensions: ${width}x${height}`);

    // Mock: Simulate face detection with random box
    const mockFace = {
      box: {
        xMin: Math.floor(width * 0.3),
        yMin: Math.floor(height * 0.2),
        width: Math.floor(width * 0.4),
        height: Math.floor(height * 0.5),
      },
      landmarks: [
        { x: width * 0.4, y: height * 0.35 }, // left eye
        { x: width * 0.6, y: height * 0.35 }, // right eye
        { x: width * 0.5, y: height * 0.5 },  // nose
        { x: width * 0.45, y: height * 0.65 }, // mouth left
        { x: width * 0.55, y: height * 0.65 }, // mouth right
      ],
      descriptor: Array(128).fill(0).map(() => Math.random() - 0.5),
      score: 0.95,
      imageWidth: width,
      imageHeight: height,
    };

    logger.debug('Mock face detection: 1 face detected successfully');
    return [mockFace];
  } catch (error) {
    logger.error('Error in mock face detection:', error);
    logger.error(`Error details: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    return [];
  }
}

/**
 * Extract face embedding (descriptor) for comparison
 * @param {Object} face - Face detection result
 * @returns {Array<number>} - 128-dimensional embedding vector
 */
function extractFaceEmbedding(face) {
  try {
    return face.descriptor;
  } catch (error) {
    logger.error('Error extracting face embedding:', error);
    throw error;
  }
}

/**
 * Calculate Euclidean distance between two embeddings
 * @param {Array<number>} embedding1 - First embedding
 * @param {Array<number>} embedding2 - Second embedding
 * @returns {number} - Distance (lower is better)
 */
function euclideanDistance(embedding1, embedding2) {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }

  let sum = 0;
  for (let i = 0; i < embedding1.length; i++) {
    const diff = embedding1[i] - embedding2[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate cosine similarity between two embeddings
 * @param {Array<number>} embedding1 - First embedding
 * @param {Array<number>} embedding2 - Second embedding
 * @returns {number} - Similarity score (0-1)
 */
function cosineSimilarity(embedding1, embedding2) {
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
 * Match a face against reference embeddings (mock - returns random match)
 * @param {Buffer} imageBuffer - Image buffer to check
 * @param {Array<Array<number>>} referenceEmbeddings - Reference face embeddings
 * @returns {Promise<Object>} - Match result with confidence
 */
async function matchFace(imageBuffer, referenceEmbeddings) {
  try {
    const faces = await detectFaces(imageBuffer);

    if (faces.length === 0) {
      return {
        isMatch: false,
        confidence: 0,
        facesDetected: 0,
      };
    }

    // Mock: Randomly decide if it's a match (70% chance)
    const isMatch = Math.random() > 0.3;
    const confidence = isMatch ? 0.85 + Math.random() * 0.1 : 0.3 + Math.random() * 0.2;

    logger.debug(`Mock match result: ${isMatch ? 'MATCH' : 'NO MATCH'} (confidence: ${confidence.toFixed(2)})`);

    return {
      isMatch,
      confidence,
      facesDetected: faces.length,
      bestMatchIndex: 0,
      distance: isMatch ? 0.3 : 0.8,
    };
  } catch (error) {
    logger.error('Error matching face:', error);
    return {
      isMatch: false,
      confidence: 0,
      facesDetected: 0,
      error: error.message,
    };
  }
}

/**
 * Extract embeddings from multiple reference photos
 * @param {Array<Buffer>} imageBuffers - Array of image buffers
 * @returns {Promise<Array<Array<number>>>} - Array of embeddings
 */
async function extractReferenceEmbeddings(imageBuffers) {
  const embeddings = [];

  logger.info(`extractReferenceEmbeddings called with ${imageBuffers.length} buffers`);

  for (let i = 0; i < imageBuffers.length; i++) {
    const buffer = imageBuffers[i];
    logger.debug(`Processing reference photo ${i + 1}/${imageBuffers.length}`);
    logger.debug(`Buffer ${i} size: ${buffer ? buffer.length : 'NULL'} bytes`);

    try {
      const faces = await detectFaces(buffer);

      if (faces.length === 0) {
        logger.warn(`No face detected in reference photo ${i + 1} (mock)`);
        continue;
      }

      const bestFace = faces[0]; // Mock always returns 1 face
      const embedding = extractFaceEmbedding(bestFace);
      embeddings.push(embedding);

      logger.debug(`Extracted mock embedding from reference photo ${i + 1} (confidence: ${bestFace.score})`);
    } catch (error) {
      logger.error(`Error processing reference photo ${i + 1}:`, error);
      logger.error(`Error message: ${error.message}`);
    }
  }

  logger.info(`Total embeddings extracted: ${embeddings.length} out of ${imageBuffers.length} photos`);

  if (embeddings.length === 0) {
    throw new Error('No valid faces found in reference photos');
  }

  logger.info(`Extracted ${embeddings.length} mock reference embeddings`);
  return embeddings;
}

/**
 * Clean up resources
 */
async function cleanup() {
  logger.info('Mock face detection cleanup');
  initialized = false;
}

module.exports = {
  initializeModel,
  detectFaces,
  extractFaceEmbedding,
  cosineSimilarity,
  matchFace,
  extractReferenceEmbeddings,
  cleanup,
};
