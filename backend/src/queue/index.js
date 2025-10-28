const Bull = require('bull');
const config = require('../config');
const logger = require('../utils/logger');

// Create the scan queue
const scanQueue = new Bull('photo-scan', config.redis.url, {
  defaultJobOptions: {
    attempts: config.worker.maxRetries,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

// Queue event listeners
scanQueue.on('error', (error) => {
  logger.error('Queue error:', error);
});

scanQueue.on('waiting', (jobId) => {
  logger.debug(`Job ${jobId} is waiting`);
});

scanQueue.on('active', (job) => {
  logger.info(`Job ${job.id} has started processing`);
});

scanQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} has stalled`);
});

scanQueue.on('progress', (job, progress) => {
  logger.debug(`Job ${job.id} progress: ${progress}%`);
});

scanQueue.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed with result:`, result);
});

scanQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed with error:`, err.message);
});

scanQueue.on('paused', () => {
  logger.warn('Queue has been paused');
});

scanQueue.on('resumed', () => {
  logger.info('Queue has been resumed');
});

scanQueue.on('cleaned', (jobs, type) => {
  logger.info(`Cleaned ${jobs.length} jobs of type ${type}`);
});

/**
 * Add a scan job to the queue
 * @param {Object} data - Job data
 * @param {string} data.scanId - Scan ID from database
 * @param {string} data.sessionId - Session ID
 * @param {string} data.oauthToken - Encrypted OAuth token
 * @param {Array} data.referenceEmbeddings - Face embeddings to match against
 * @returns {Promise<Object>} - Job object
 */
async function addScanJob(data) {
  const job = await scanQueue.add('process-scan', data, {
    jobId: data.scanId,
    priority: 1,
  });

  logger.info(`Scan job added to queue: ${job.id}`);
  return job;
}

/**
 * Get job by ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} - Job object or null
 */
async function getJob(jobId) {
  return scanQueue.getJob(jobId);
}

/**
 * Get job status and progress
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job status info
 */
async function getJobStatus(jobId) {
  const job = await getJob(jobId);
  if (!job) {
    return { status: 'not_found' };
  }

  const state = await job.getState();
  const progress = job.progress();
  const result = job.returnvalue;
  const failedReason = job.failedReason;

  return {
    status: state,
    progress,
    result,
    error: failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };
}

/**
 * Cancel a job
 * @param {string} jobId - Job ID
 * @returns {Promise<void>}
 */
async function cancelJob(jobId) {
  const job = await getJob(jobId);
  if (job) {
    await job.remove();
    logger.info(`Job ${jobId} cancelled`);
  }
}

/**
 * Get queue stats
 * @returns {Promise<Object>} - Queue statistics
 */
async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    scanQueue.getWaitingCount(),
    scanQueue.getActiveCount(),
    scanQueue.getCompletedCount(),
    scanQueue.getFailedCount(),
    scanQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Clean old jobs
 * @param {number} grace - Grace period in milliseconds
 * @returns {Promise<void>}
 */
async function cleanOldJobs(grace = 24 * 3600 * 1000) {
  await scanQueue.clean(grace, 'completed');
  await scanQueue.clean(7 * 24 * 3600 * 1000, 'failed');
  logger.info('Old jobs cleaned');
}

/**
 * Close queue connection
 */
async function close() {
  await scanQueue.close();
  logger.info('Queue closed');
}

module.exports = {
  scanQueue,
  addScanJob,
  getJob,
  getJobStatus,
  cancelJob,
  getQueueStats,
  cleanOldJobs,
  close,
};
