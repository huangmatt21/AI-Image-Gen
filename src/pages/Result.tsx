import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '../components/Button';
import { supabase } from '../lib/supabase';

export function Result() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const userId = searchParams.get('userId');
  const triggerWord = searchParams.get('triggerWord');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [originalImage, setOriginalImage] = useState<string>();
  const [stylizedImage, setStylizedImage] = useState<string>();

  useEffect(() => {
    const loadImages = async () => {
      if (!userId || !triggerWord) {
        navigate('/upload');
        return;
      }

      // Get session ID from localStorage to verify ownership
      const sessionId = localStorage.getItem('sessionId');
      if (sessionId !== userId) {
        navigate('/upload');
        return;
      }

      try {
        // Check training status
        const response = await fetch(`http://localhost:8000/status/${userId}/${triggerWord}`);
        const status = await response.json();

        if (status.error) {
          throw new Error(status.error);
        }

        if (status.status !== 'completed') {
          throw new Error('Training is still in progress');
        }

        // Get image URLs from Supabase
        const { data: originalData, error: originalError } = await supabase.storage
          .from('public-images')
          .createSignedUrl(`${userId}/${triggerWord}/original.jpg`, 3600);

        if (originalError) throw originalError;

        const { data: stylizedData, error: stylizedError } = await supabase.storage
          .from('public-images')
          .createSignedUrl(`${userId}/${triggerWord}/stylized.jpg`, 3600);

        if (stylizedError) throw stylizedError;

        setOriginalImage(originalData.signedUrl);
        setStylizedImage(stylizedData.signedUrl);
      } catch (err) {
        console.error('Error loading images:', err);
        setError(err instanceof Error ? err.message : 'Failed to load images');
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, [userId, triggerWord, navigate]);

  const handleDownload = async () => {
    if (!stylizedImage) return;
    
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
      setError('Failed to download image');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto"></div>
          <p className="text-gray-600">Loading your stylized images...</p>
        </div>
      </div>
    );
  }

  if (error || !originalImage || !stylizedImage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-500">{error || 'Failed to load images'}</p>
          <Button onClick={() => navigate('/upload')} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
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