/**
 * API Client for Photo Extractor Backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Handle API response
 */
async function handleResponse(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Session API
 */
export const sessionAPI = {
  /**
   * Create a new session with reference photos
   * @param {FormData} formData - Form data with creatorName, creatorEmail, and referencePhotos
   */
  async create(formData) {
    const response = await fetch(`${API_BASE_URL}/sessions/create`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse(response);
  },

  /**
   * Get session by ID
   */
  async get(sessionId) {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`);
    return handleResponse(response);
  },

  /**
   * Get session statistics
   */
  async getStats(sessionId) {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/stats`);
    return handleResponse(response);
  },

  /**
   * Get sessions by email
   */
  async getByEmail(email) {
    const response = await fetch(`${API_BASE_URL}/sessions/by-email?email=${encodeURIComponent(email)}`);
    return handleResponse(response);
  },

  /**
   * Delete session
   */
  async delete(sessionId) {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },
};

/**
 * Auth API
 */
export const authAPI = {
  /**
   * Get Google OAuth URL
   */
  async getOAuthUrl(sessionId) {
    const response = await fetch(`${API_BASE_URL}/auth/google/init/${sessionId}`);
    return handleResponse(response);
  },
};

/**
 * Scan API
 */
export const scanAPI = {
  /**
   * Get scan details
   */
  async get(scanId) {
    const response = await fetch(`${API_BASE_URL}/scans/${scanId}`);
    return handleResponse(response);
  },

  /**
   * Monitor scan progress via Server-Sent Events (SSE)
   * @param {string} scanId - Scan ID
   * @param {Function} onProgress - Callback for progress updates
   * @param {Function} onComplete - Callback when scan completes
   * @param {Function} onError - Callback for errors
   * @returns {EventSource} EventSource instance (can be closed)
   */
  monitorProgress(scanId, onProgress, onComplete, onError) {
    const eventSource = new EventSource(`${API_BASE_URL}/scans/${scanId}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onProgress(data);

        // Check if scan is complete
        if (data.status === 'completed') {
          eventSource.close();
          if (onComplete) onComplete(data);
        } else if (data.status === 'failed') {
          eventSource.close();
          if (onError) onError(new Error(data.error || 'Scan failed'));
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
      if (onError) onError(error);
    };

    // Handle close event
    eventSource.addEventListener('close', () => {
      eventSource.close();
    });

    return eventSource;
  },

  /**
   * Get scan results with matched photos
   */
  async getResults(scanId, limit = 50, offset = 0) {
    const response = await fetch(
      `${API_BASE_URL}/scans/${scanId}/results?limit=${limit}&offset=${offset}`
    );
    return handleResponse(response);
  },

  /**
   * Cancel a running scan
   */
  async cancel(scanId) {
    const response = await fetch(`${API_BASE_URL}/scans/${scanId}/cancel`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  /**
   * Delete scan
   */
  async delete(scanId) {
    const response = await fetch(`${API_BASE_URL}/scans/${scanId}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  /**
   * Get all scans for a session
   */
  async getBySession(sessionId) {
    const response = await fetch(`${API_BASE_URL}/scans/session/${sessionId}`);
    return handleResponse(response);
  },
};

/**
 * Health API
 */
export const healthAPI = {
  /**
   * Check API health
   */
  async check() {
    const response = await fetch(`${API_BASE_URL}/health`);
    return handleResponse(response);
  },
};

export default {
  session: sessionAPI,
  auth: authAPI,
  scan: scanAPI,
  health: healthAPI,
};
