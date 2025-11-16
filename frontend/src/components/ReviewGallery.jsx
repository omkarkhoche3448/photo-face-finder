// Optional component for reviewing matched photos before upload
// Currently disabled by default (as per requirements)

function ReviewGallery({ photos, onConfirm }) {
  const ENABLE_REVIEW = import.meta.env.VITE_ENABLE_REVIEW === 'true';

  if (!ENABLE_REVIEW) {
    // Auto-confirm if review is disabled
    onConfirm(photos);
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Review Matched Photos
      </h2>
      <p className="text-gray-600 mb-6">
        Found {photos.length} photos containing the target person. Review and confirm upload.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {photos.map((photo, index) => (
          <div key={index} className="relative aspect-square">
            <img
              src={`${photo.baseUrl}=w300-h300`}
              alt={`Match ${index + 1}`}
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => onConfirm(photos)}
        className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition font-medium"
      >
        Confirm & Upload {photos.length} Photos
      </button>
    </div>
  );
}

export default ReviewGallery;
