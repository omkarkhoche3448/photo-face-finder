import { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function PhotoScanner({ sessionId, scanId, jobId }) {
  const [status, setStatus] = useState('waiting');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Initializing scan...');
  const [matchedPhotos, setMatchedPhotos] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!scanId || !jobId) {
      setError('Missing scan or job ID');
      return;
    }

    // Poll job status every 2 seconds
    const pollInterval = setInterval(() => {
      checkJobStatus();
    }, 2000);

    // Initial check
    checkJobStatus();

    return () => clearInterval(pollInterval);
  }, [scanId, jobId]);

  const checkJobStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/scans/${scanId}/status`);

      if (!response.ok) {
        throw new Error('Failed to fetch scan status');
      }

      const data = await response.json();

      setStatus(data.status);
      setProgress(data.progress || 0);
      setMessage(data.message || 'Processing...');

      if (data.matchedPhotos) {
        setMatchedPhotos(data.matchedPhotos);
      }

      if (data.status === 'failed') {
        setError(data.error || 'Scan failed');
      }
    } catch (err) {
      console.error('Error checking job status:', err);
      setError(err.message);
    }
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-red-600 text-5xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-red-600 mb-2">Error</h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="text-green-600 text-6xl mb-4">✓</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Scan Complete!</h2>
          <p className="text-gray-600">
            Found {matchedPhotos.length} photos with matches
          </p>
        </div>

        {matchedPhotos.length > 0 && (
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Matched Photos</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {matchedPhotos.map((photo, index) => (
                <div key={index} className="relative">
                  <img
                    src={photo.thumbnailUrl || photo.url}
                    alt={`Match ${index + 1}`}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2 rounded-b-lg">
                    Confidence: {Math.round((photo.similarity || 0) * 100)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {matchedPhotos.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-600">No matching photos found in your library.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Scanning Your Photos
        </h2>
        <p className="text-gray-600">{message}</p>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className="bg-blue-600 h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <p className="text-center text-sm text-gray-600 mt-2">{progress}% complete</p>
      </div>

      {/* Status indicator */}
      <div className="flex items-center justify-center gap-2 text-gray-600">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
        <span className="text-sm">
          {status === 'waiting' && 'Waiting to start...'}
          {status === 'processing' && 'Processing photos...'}
          {status === 'uploading' && 'Uploading matched photos...'}
        </span>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200">
        <p className="text-sm text-gray-500 text-center">
          This may take a few minutes depending on your library size.
          <br />
          You can safely close this page and return later.
        </p>
      </div>
    </div>
  );
}

export default PhotoScanner;
