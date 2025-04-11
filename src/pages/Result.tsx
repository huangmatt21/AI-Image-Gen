import { useLocation, useNavigate } from 'react-router-dom';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '../components/Button';

export function Result() {
  const navigate = useNavigate();
  const location = useLocation();
  const { originalImage, stylizedImage } = location.state || {};

  const handleDownload = async () => {
    try {
      const response = await fetch(stylizedImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stylized-image.png';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  };

  if (!originalImage || !stylizedImage) {
    navigate('/upload');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">Your Stylized Image</h1>
          <p className="text-gray-600">Here's your transformed artwork</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Original</h2>
            <img src={originalImage} alt="Original" className="w-full h-auto rounded-lg" />
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Stylized</h2>
            <img src={stylizedImage} alt="Stylized" className="w-full h-auto rounded-lg" />
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <Button
            onClick={handleDownload}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          <Button
            onClick={() => navigate('/upload')}
            variant="outline"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Another
          </Button>
        </div>
      </div>
    </div>
  );
}