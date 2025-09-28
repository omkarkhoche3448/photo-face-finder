const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

// Ensure upload directory exists
const uploadDir = config.upload.uploadDir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  // Check mime type
  if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${config.upload.allowedMimeTypes.join(', ')}`
      ),
      false
    );
  }
};

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: config.upload.maxFiles,
  },
});

/**
 * Middleware for single file upload
 */
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    const uploadHandler = upload.single(fieldName);

    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File too large',
            message: `Maximum file size is ${config.upload.maxFileSize / 1024 / 1024}MB`,
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            error: 'Unexpected field',
            message: err.message,
          });
        }
        return res.status(400).json({
          error: 'Upload error',
          message: err.message,
        });
      } else if (err) {
        return res.status(400).json({
          error: 'Upload error',
          message: err.message,
        });
      }

      next();
    });
  };
};

/**
 * Middleware for multiple file upload
 */
const uploadMultiple = (fieldName, maxCount = config.upload.maxFiles) => {
  return (req, res, next) => {
    const uploadHandler = upload.array(fieldName, maxCount);

    uploadHandler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'File too large',
            message: `Maximum file size is ${config.upload.maxFileSize / 1024 / 1024}MB`,
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: 'Too many files',
            message: `Maximum ${maxCount} files allowed`,
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            error: 'Unexpected field',
            message: err.message,
          });
        }
        return res.status(400).json({
          error: 'Upload error',
          message: err.message,
        });
      } else if (err) {
        return res.status(400).json({
          error: 'Upload error',
          message: err.message,
        });
      }

      // Validate that files were actually uploaded
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          error: 'No files uploaded',
          message: 'Please upload at least one file',
        });
      }

      next();
    });
  };
};

/**
 * Cleanup uploaded files (use in error handlers)
 */
function cleanupUploadedFiles(files) {
  if (!files) return;

  const fileArray = Array.isArray(files) ? files : [files];

  fileArray.forEach((file) => {
    if (file && file.path) {
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          logger.debug(`Cleaned up uploaded file: ${file.path}`);
        }
      } catch (error) {
        logger.error(`Error cleaning up file ${file.path}:`, error);
      }
    }
  });
}

/**
 * Middleware to cleanup files on error
 */
function cleanupOnError(req, res, next) {
  const originalSend = res.send;

  res.send = function (data) {
    if (res.statusCode >= 400) {
      cleanupUploadedFiles(req.file);
      cleanupUploadedFiles(req.files);
    }
    originalSend.call(this, data);
  };

  next();
}

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  cleanupUploadedFiles,
  cleanupOnError,
};
