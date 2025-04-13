import { useNavigate } from 'react-router-dom';
import { Wand2 } from 'lucide-react';
import { Button } from '../components/Button';

export function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl text-center space-y-8">
        <div className="flex items-center justify-center">
          <Wand2 className="w-12 h-12 text-purple-400" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
          Transform Your Photos with AI Magic
        </h1>
        <p className="text-xl text-gray-300">
          Turn your photos into stunning AI-generated headshots with just a few clicks. Upload 12-20 photos to get started.
        </p>
        <Button
          size="lg"
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-full"
          onClick={() => navigate('/upload')}
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}