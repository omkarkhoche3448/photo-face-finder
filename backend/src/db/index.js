const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: config.database.url,
  max: config.database.pool.max,
  min: config.database.pool.min,
  idleTimeoutMillis: config.database.pool.idle,
  connectionTimeoutMillis: config.database.pool.connectionTimeoutMillis,
});

// Test connection
pool.on('connect', () => {
  logger.info('Database connected successfully');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
  process.exit(-1);
});

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Executed query: ${text.substring(0, 100)}... Duration: ${duration}ms`);
    return res;
  } catch (error) {
    logger.error(`Database query error: ${error.message}`, { query: text, params });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} - Database client
 */
async function getClient() {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);

  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    logger.error('A client has been checked out for more than 5 seconds!');
  }, 5000);

  // Monkey patch the query method to keep track of the last query executed
  client.query = (...args) => {
    client.lastQuery = args;
    return query(...args);
  };

  client.release = () => {
    clearTimeout(timeout);
    client.query = query;
    client.release = release;
    return release();
  };

  return client;
}

/**
 * Execute a transaction
 * @param {Function} callback - Callback function with client parameter
 * @returns {Promise<any>} - Transaction result
 */
async function transaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close all database connections
 */
async function close() {
  await pool.end();
  logger.info('Database pool closed');
}

module.exports = {
  query,
  getClient,
  transaction,
  close,
  pool,
};
