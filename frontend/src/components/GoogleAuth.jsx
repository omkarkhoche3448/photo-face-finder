import { useState } from 'react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function GoogleAuth({ sessionId, onAuthenticated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get OAuth URL from backend
      const response = await fetch(`${API_BASE_URL}/api/auth/google/init/${sessionId}`);

      if (!response.ok) {
        throw new Error('Failed to initialize OAuth flow');
      }

      const { authUrl } = await response.json();

      // Open OAuth popup
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        authUrl,
        'Google OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Check if popup was blocked
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        setError('Popup blocked. Please allow popups for this site.');
        setLoading(false);
        return;
      }

      // Monitor popup for redirect back to our app
      const checkPopup = setInterval(() => {
        try {
          // Check if popup is closed
          if (popup.closed) {
            clearInterval(checkPopup);
            setLoading(false);
            return;
          }

          // Check if popup redirected back to our frontend domain with success params
          // The backend redirects to frontend URL with scanId and jobId
          const popupUrl = popup.location.href;

          // Check if URL contains our frontend origin and has the required params
          if (popupUrl.includes(window.location.origin) && popupUrl.includes('scanId=') && popupUrl.includes('jobId=')) {
            const url = new URL(popupUrl);
            const scanId = url.searchParams.get('scanId');
            const jobId = url.searchParams.get('jobId');

            if (scanId && jobId) {
              clearInterval(checkPopup);
              popup.close();
              onAuthenticated(true);
            }
          }
        } catch (e) {
          // Cross-origin error (popup is on Google's domain or backend) - expected
        }
      }, 500);

    } catch (err) {
      console.error('Google auth error:', err);
      setError(err.message || 'Failed to authenticate with Google');
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="text-6xl mb-4">📸</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Sign in with Google
        </h2>
        <p className="text-gray-600">
          We need access to your Google Photos to find and extract photos where your friend appears.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-700"></div>
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <div className="text-xs text-gray-500 text-center">
          <p>We will only access your photos (read-only)</p>
          <p>Your photos are processed locally and never stored</p>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-2">What happens next?</h3>
        <ol className="text-sm text-gray-600 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">1.</span>
            <span>You'll be asked to grant read-only access to your Google Photos</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">2.</span>
            <span>We'll scan your photos to find matches (takes 1-2 minutes)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold">3.</span>
            <span>Matched photos are automatically uploaded to secure storage</span>
          </li>
        </ol>
      </div>
    </div>
  );
}

export default GoogleAuth;
