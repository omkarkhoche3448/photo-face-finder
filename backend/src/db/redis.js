const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const redis = new Redis(config.redis.url, config.redis.options);

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redis.on('ready', () => {
  logger.info('Redis is ready to accept commands');
});

/**
 * Set a key-value pair with optional expiry
 * @param {string} key - Redis key
 * @param {any} value - Value to store (will be JSON stringified if object)
 * @param {number} ttl - Time to live in seconds (optional)
 */
async function set(key, value, ttl = null) {
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
  if (ttl) {
    return redis.setex(key, ttl, stringValue);
  }
  return redis.set(key, stringValue);
}

/**
 * Get a value by key
 * @param {string} key - Redis key
 * @param {boolean} parseJSON - Whether to parse as JSON (default: true)
 * @returns {Promise<any>} - Value or null if not found
 */
async function get(key, parseJSON = true) {
  const value = await redis.get(key);
  if (!value) return null;

  if (parseJSON) {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

/**
 * Delete one or more keys
 * @param {string|string[]} keys - Key(s) to delete
 */
async function del(keys) {
  return redis.del(keys);
}

/**
 * Check if key exists
 * @param {string} key - Redis key
 * @returns {Promise<boolean>} - True if exists
 */
async function exists(key) {
  const result = await redis.exists(key);
  return result === 1;
}

/**
 * Set hash field
 * @param {string} key - Hash key
 * @param {string} field - Field name
 * @param {any} value - Field value
 */
async function hset(key, field, value) {
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
  return redis.hset(key, field, stringValue);
}

/**
 * Get hash field
 * @param {string} key - Hash key
 * @param {string} field - Field name
 * @param {boolean} parseJSON - Whether to parse as JSON (default: true)
 */
async function hget(key, field, parseJSON = true) {
  const value = await redis.hget(key, field);
  if (!value) return null;

  if (parseJSON) {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

/**
 * Get all hash fields
 * @param {string} key - Hash key
 * @param {boolean} parseJSON - Whether to parse values as JSON (default: true)
 */
async function hgetall(key, parseJSON = true) {
  const hash = await redis.hgetall(key);
  if (!hash || Object.keys(hash).length === 0) return null;

  if (parseJSON) {
    const parsed = {};
    for (const [field, value] of Object.entries(hash)) {
      try {
        parsed[field] = JSON.parse(value);
      } catch (e) {
        parsed[field] = value;
      }
    }
    return parsed;
  }
  return hash;
}

/**
 * Set multiple hash fields
 * @param {string} key - Hash key
 * @param {Object} obj - Object with field-value pairs
 */
async function hmset(key, obj) {
  const stringified = {};
  for (const [field, value] of Object.entries(obj)) {
    stringified[field] = typeof value === 'object' ? JSON.stringify(value) : value;
  }
  return redis.hmset(key, stringified);
}

/**
 * Increment a counter
 * @param {string} key - Counter key
 * @param {number} amount - Amount to increment by (default: 1)
 */
async function incr(key, amount = 1) {
  if (amount === 1) {
    return redis.incr(key);
  }
  return redis.incrby(key, amount);
}

/**
 * Set expiry on a key
 * @param {string} key - Redis key
 * @param {number} seconds - Expiry time in seconds
 */
async function expire(key, seconds) {
  return redis.expire(key, seconds);
}

/**
 * Publish a message to a channel
 * @param {string} channel - Channel name
 * @param {any} message - Message to publish
 */
async function publish(channel, message) {
  const stringMessage = typeof message === 'object' ? JSON.stringify(message) : message;
  return redis.publish(channel, stringMessage);
}

/**
 * Subscribe to a channel
 * @param {string} channel - Channel name
 * @param {Function} callback - Callback function for messages
 */
function subscribe(channel, callback) {
  const subscriber = redis.duplicate();
  subscriber.subscribe(channel);
  subscriber.on('message', (ch, message) => {
    if (ch === channel) {
      try {
        const parsed = JSON.parse(message);
        callback(parsed);
      } catch (e) {
        callback(message);
      }
    }
  });
  return subscriber;
}

/**
 * Close Redis connection
 */
async function close() {
  await redis.quit();
  logger.info('Redis connection closed');
}

module.exports = {
  redis,
  set,
  get,
  del,
  exists,
  hset,
  hget,
  hgetall,
  hmset,
  incr,
  expire,
  publish,
  subscribe,
  close,
};
