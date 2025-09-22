require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    apiUrl: process.env.API_URL || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres123@localhost:5432/photo_extractor',
    pool: {
      max: 20,
      min: 2,
      idle: 10000,
      connectionTimeoutMillis: 5000,
    },
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    options: {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    },
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3: {
      bucketName: process.env.S3_BUCKET_NAME || 'photo-extraction-storage',
      presignedUrlExpiry: 3600, // 1 hour
    },
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
    scopes: [
      'https://www.googleapis.com/auth/photoslibrary.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  },

  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32byte',
    jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret-change-in-production',
    csrfSecret: process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
    maxFiles: parseInt(process.env.MAX_FILES) || 5,
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  },

  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 1,
    batchSize: parseInt(process.env.BATCH_SIZE) || 100,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    mockMode: process.env.MOCK_MODE === 'true', // Enable mock mode for testing without Google Photos API
  },

  faceDetection: {
    model: 'mediapipe_face_detector',
    confidenceThreshold: 0.7,
    matchThreshold: 0.6, // Minimum similarity score to consider a match
    maxFaces: 10, // Maximum faces to detect per image
  },

  monitoring: {
    sentryDsn: process.env.SENTRY_DSN,
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  session: {
    expiryDays: 30,
  },
};
