import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import ReferenceUpload from './components/ReferenceUpload';
import LinkGenerator from './components/LinkGenerator';
import GoogleAuth from './components/GoogleAuth';
import PhotoScanner from './components/PhotoScanner';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Home page component (upload mode)
function HomePage() {
  const [referenceData, setReferenceData] = useState(null);
  const [shareableLink, setShareableLink] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Photo Extractor
          </h1>
          <p className="text-gray-600">
            Extract all your photos from friends automatically
          </p>
        </header>

        <div className="max-w-4xl mx-auto">
          {!referenceData ? (
            <ReferenceUpload onEmbeddingsGenerated={setReferenceData} />
          ) : !shareableLink ? (
            <LinkGenerator
              embeddings={referenceData.embeddings}
              referencePhotos={referenceData.referencePhotos}
              onLinkGenerated={setShareableLink}
            />
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <h2 className="text-2xl font-bold text-green-600 mb-4">
                Link Generated Successfully!
              </h2>
              <div className="bg-gray-100 p-4 rounded-lg mb-6">
                <p className="text-sm text-gray-600 mb-2">Share this link with your friends:</p>
                <p className="font-mono text-sm break-all text-blue-600">{shareableLink}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareableLink);
                  alert('Link copied to clipboard!');
                }}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
              >
                Copy Link
              </button>
              <button
                onClick={() => {
                  setReferenceData(null);
                  setShareableLink('');
                }}
                className="ml-4 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 transition"
              >
                Create New Link
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Scan page component (scan mode)
function ScanPage() {
  const { sessionId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [scanId, setScanId] = useState(null);
  const [jobId, setJobId] = useState(null);

  useEffect(() => {
    // Check if we have scanId and jobId in URL (returned from OAuth)
    const urlParams = new URLSearchParams(window.location.search);
    const urlScanId = urlParams.get('scanId');
    const urlJobId = urlParams.get('jobId');

    if (urlScanId && urlJobId) {
      setScanId(urlScanId);
      setJobId(urlJobId);
      setIsAuthenticated(true);
    }

    fetchSessionData();
  }, [sessionId]);

  const fetchSessionData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Session not found or has expired');
        }
        throw new Error('Failed to load session data');
      }

      const data = await response.json();
      setSessionData(data);
    } catch (err) {
      console.error('Error fetching session data:', err);
      setError(err.message || 'Failed to load session data. The link may be expired or invalid.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Photo Extractor
          </h1>
          <p className="text-gray-600">
            Help your friend find their photos
          </p>
        </header>

        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading session data...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <div className="text-red-600 text-5xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-red-600 mb-2">Error</h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <button
                onClick={() => window.location.href = '/'}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
              >
                Go to Home
              </button>
            </div>
          ) : !isAuthenticated ? (
            <div>
              <div className="bg-white rounded-lg shadow-lg p-8 mb-6 text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Scan for {sessionData.creator_name}'s Photos
                </h2>
                <p className="text-gray-600 mb-2">
                  This scan will help find photos containing {sessionData.creator_name}.
                </p>
                <p className="text-sm text-gray-500">
                  Session created: {new Date(sessionData.created_at).toLocaleDateString()}
                </p>
              </div>
              <GoogleAuth sessionId={sessionId} onAuthenticated={setIsAuthenticated} />
            </div>
          ) : (
            <PhotoScanner
              sessionId={sessionId}
              sessionData={sessionData}
              scanId={scanId}
              jobId={jobId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Main App component with router
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/scan/:sessionId" element={<ScanPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
