import { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function LinkGenerator({ embeddings, referencePhotos, onLinkGenerated }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [creatorName, setCreatorName] = useState('');
  const [creatorEmail, setCreatorEmail] = useState('');

  const generateLink = async () => {
    if (!creatorName || !creatorEmail) {
      setError('Please enter your name and email');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Create FormData with reference photos
      const formData = new FormData();
      formData.append('creatorName', creatorName);
      formData.append('creatorEmail', creatorEmail);

      // Add reference photos (files were stored during upload)
      if (referencePhotos && referencePhotos.length > 0) {
        referencePhotos.forEach((file) => {
          formData.append('referencePhotos', file);
        });
      }

      const response = await fetch(`${API_BASE_URL}/api/sessions/create`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate link');
      }

      const data = await response.json();

      // Use the shareable link from backend
      onLinkGenerated(data.shareableLink);
    } catch (err) {
      console.error('Error generating link:', err);
      setError(err.message || 'Failed to generate link. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">
        Step 2: Generate Shareable Link
      </h2>
      <p className="text-gray-600 mb-6 text-center">
        Your face embeddings have been created successfully! Enter your details to generate a shareable link.
      </p>

      <div className="mb-6 p-4 bg-green-50 rounded-lg">
        <p className="text-sm text-green-800 text-center">
          ✓ Detected faces in {embeddings ? embeddings.length : referencePhotos.length} photo{embeddings && embeddings.length > 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
            Your Name
          </label>
          <input
            type="text"
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
            Your Email
          </label>
          <input
            type="email"
            value={creatorEmail}
            onChange={(e) => setCreatorEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        onClick={generateLink}
        disabled={isGenerating}
        className="w-full bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition font-medium"
      >
        {isGenerating ? 'Generating Link...' : 'Generate Shareable Link'}
      </button>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600">
          The link will be saved and you can share it with friends to automatically extract photos containing you.
        </p>
      </div>
    </div>
  );
}

export default LinkGenerator;
