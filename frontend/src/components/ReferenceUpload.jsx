import { useState } from 'react';
import { generateFaceEmbeddings } from '../services/faceRecognition';

function ReferenceUpload({ onEmbeddingsGenerated }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);

    if (files.length < 3 || files.length > 5) {
      setError('Please select 3-5 photos of yourself');
      return;
    }

    setError('');
    setSelectedFiles(files);

    // Create previews
    const previewUrls = files.map(file => URL.createObjectURL(file));
    setPreviews(previewUrls);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select photos first');
      return;
    }

    setIsProcessing(true);
    setProgress('Loading face detection model...');

    try {
      // Generate embeddings from the reference photos
      const embeddings = await generateFaceEmbeddings(
        selectedFiles,
        (msg) => setProgress(msg)
      );

      if (embeddings.length === 0) {
        throw new Error('No faces detected in the uploaded photos. Please upload clear photos of your face.');
      }

      setProgress(`Successfully detected faces in ${embeddings.length} photos!`);

      // Pass embeddings AND original files to parent
      setTimeout(() => {
        onEmbeddingsGenerated({ embeddings, referencePhotos: selectedFiles });
      }, 1000);

    } catch (err) {
      console.error('Error processing photos:', err);
      setError(err.message || 'Failed to process photos. Please try again.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Step 1: Upload Reference Photos
      </h2>
      <p className="text-gray-600 mb-6">
        Upload 3-5 clear photos of yourself. We'll use AI to detect your face and create a unique identifier.
      </p>

      {/* File Input */}
      <div className="mb-6">
        <label className="block mb-2 text-sm font-medium text-gray-900">
          Select 3-5 photos
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          disabled={isProcessing}
          className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none p-2.5"
        />
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>

      {/* Preview Grid */}
      {previews.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-900 mb-3">
            Selected photos ({previews.length}/5)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {previews.map((preview, index) => (
              <div key={index} className="relative aspect-square">
                <img
                  src={preview}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover rounded-lg border-2 border-gray-200"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {isProcessing && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <p className="text-sm text-blue-800">{progress}</p>
          </div>
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={selectedFiles.length === 0 || isProcessing}
        className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-medium"
      >
        {isProcessing ? 'Processing...' : 'Process Photos & Continue'}
      </button>

      {/* Info */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600">
          <strong>Privacy Note:</strong> Your photos are processed entirely in your browser.
          No images are sent to our servers. Only a mathematical representation (embedding)
          of your face is created and encoded into the shareable link.
        </p>
      </div>
    </div>
  );
}

export default ReferenceUpload;
