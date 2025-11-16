import { useState, useEffect, useRef } from 'react';
import { scanAPI } from '../services/api';

/**
 * Progress Monitor Component
 * Displays real-time scan progress using Server-Sent Events (SSE)
 */
export default function ProgressMonitor({ scanId, onComplete, onError }) {
  const [progress, setProgress] = useState({
    status: 'pending',
    totalPhotos: 0,
    scannedPhotos: 0,
    matchedPhotos: 0,
    uploadedPhotos: 0,
    currentBatch: 0,
    totalBatches: 0,
  });

  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!scanId) return;

    // Start monitoring progress
    const handleProgress = (data) => {
      setProgress(data);
    };

    const handleComplete = (data) => {
      setProgress(data);
      if (onComplete) {
        onComplete(data);
      }
    };

    const handleError = (error) => {
      console.error('Scan error:', error);
      if (onError) {
        onError(error);
      }
    };

    // Connect to SSE endpoint
    eventSourceRef.current = scanAPI.monitorProgress(
      scanId,
      handleProgress,
      handleComplete,
      handleError
    );

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [scanId, onComplete, onError]);

  // Calculate percentages
  const scanPercentage = progress.totalPhotos > 0
    ? Math.floor((progress.scannedPhotos / progress.totalPhotos) * 100)
    : 0;

  const uploadPercentage = progress.matchedPhotos > 0
    ? Math.floor((progress.uploadedPhotos / progress.matchedPhotos) * 100)
    : 0;

  const getStatusColor = () => {
    switch (progress.status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'processing':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case 'pending':
        return 'Preparing scan...';
      case 'processing':
        return 'Processing photos...';
      case 'completed':
        return 'Scan completed!';
      case 'failed':
        return 'Scan failed';
      default:
        return progress.status;
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* Status Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Scan Progress</h2>
        <p className={`text-lg font-semibold ${getStatusColor()}`}>
          {getStatusText()}
        </p>
      </div>

      {/* Photo Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center p-4 bg-gray-50 rounded">
          <p className="text-3xl font-bold text-blue-600">{progress.totalPhotos.toLocaleString()}</p>
          <p className="text-sm text-gray-600">Total Photos</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded">
          <p className="text-3xl font-bold text-purple-600">{progress.scannedPhotos.toLocaleString()}</p>
          <p className="text-sm text-gray-600">Scanned</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded">
          <p className="text-3xl font-bold text-green-600">{progress.matchedPhotos.toLocaleString()}</p>
          <p className="text-sm text-gray-600">Matches Found</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded">
          <p className="text-3xl font-bold text-orange-600">{progress.uploadedPhotos.toLocaleString()}</p>
          <p className="text-sm text-gray-600">Uploaded</p>
        </div>
      </div>

      {/* Scanning Progress Bar */}
      {progress.status === 'processing' && progress.totalPhotos > 0 && (
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Scanning Photos
            </span>
            <span className="text-sm font-medium text-gray-700">
              {scanPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-300"
              style={{ width: `${scanPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Batch {progress.currentBatch} of {progress.totalBatches}
          </p>
        </div>
      )}

      {/* Upload Progress Bar */}
      {progress.matchedPhotos > 0 && progress.uploadedPhotos < progress.matchedPhotos && (
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Uploading Matched Photos
            </span>
            <span className="text-sm font-medium text-gray-700">
              {uploadPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-green-600 h-4 rounded-full transition-all duration-300"
              style={{ width: `${uploadPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {progress.uploadedPhotos} / {progress.matchedPhotos} photos uploaded
          </p>
        </div>
      )}

      {/* Completion Message */}
      {progress.status === 'completed' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-semibold">
            ✓ Scan completed successfully!
          </p>
          <p className="text-green-700 text-sm mt-1">
            Found {progress.matchedPhotos} photos containing the target person.
          </p>
        </div>
      )}

      {/* Error Message */}
      {progress.status === 'failed' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-semibold">
            ✗ Scan failed
          </p>
          {progress.error && (
            <p className="text-red-700 text-sm mt-1">
              {progress.error}
            </p>
          )}
        </div>
      )}

      {/* Loading Spinner */}
      {progress.status === 'processing' && (
        <div className="flex justify-center items-center mt-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Processing in background...</span>
        </div>
      )}
    </div>
  );
}
