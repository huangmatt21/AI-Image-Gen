import { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon } from 'lucide-react';
import { Button } from '../components/Button';
import { supabase } from '../lib/supabase';

const MIN_IMAGES = 12;
const MAX_IMAGES = 20;

const IMAGE_REQUIREMENTS = [
  'Different facial expressions (smiling, neutral, serious)',
  'Various angles (front, profile, 3/4 view)',
  'Different lighting conditions',
  'Various backgrounds',
  'High-quality, clear photos',
];

export function Upload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [trainingImages, setTrainingImages] = useState<File[]>([]);
  const [triggerWord, setTriggerWord] = useState<string>('');
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);

  // Generate default trigger word on mount
  useEffect(() => {
    setTriggerWord(`PERSON_${Math.random().toString(36).substring(2, 7).toUpperCase()}`);
  }, []);
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/login');
        } else {
          setUserId(user.id);
        }
      } catch (err) {
        console.error('Error checking auth:', err);
        navigate('/login');
      }
    };

    initAuth();
  }, [navigate]);

  const resizeImage = async (file: File, maxWidth = 1024, maxHeight = 1024): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          'image/jpeg',
          0.9
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    if (files.length + trainingImages.length > MAX_IMAGES) {
      setError(`You can only upload up to ${MAX_IMAGES} images. Please remove some images first.`);
      return;
    }

    try {
      const resizedFiles = await Promise.all(
        files.map(async (file) => {
          const resizedBlob = await resizeImage(file);
          return new File([resizedBlob], file.name, { type: 'image/jpeg' });
        })
      );

      setTrainingImages(prev => [...prev, ...resizedFiles]);
      setError('');
    } catch (err) {
      console.error('Error processing images:', err);
      setError('Failed to process images. Please try again with different images.');
    }
  };

  const removeImage = (index: number) => {
    setTrainingImages(prev => prev.filter((_, i) => i !== index));
  };

  const regenerateTriggerWord = () => {
    const newTriggerWord = `PERSON_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    setTriggerWord(newTriggerWord);
  };

  const handleSubmit = async () => {
    if (!userId || trainingImages.length < MIN_IMAGES || !triggerWord) return;

    try {
      setIsTraining(true);
      setError('');

      // Create a zip file of all images
      const zip = new JSZip();
      const imageFolder = zip.folder('training_images');

      // Add each image to the zip
      for (let i = 0; i < trainingImages.length; i++) {
        const file = trainingImages[i];
        imageFolder?.file(`image_${i + 1}.jpg`, file);
      }

      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], 'training_images.zip', { type: 'application/zip' });

      // Upload zip to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('training_data')
        .upload(`${userId}/${triggerWord}/${Date.now()}.zip`, zipFile);

      if (uploadError) {
        throw new Error('Failed to upload training data');
      }

      // Get the public URL of the uploaded zip
      const { data: { publicUrl } } = await supabase.storage
        .from('training_data')
        .getPublicUrl(uploadData.path);

      // Save training record to database
      const { data: trainingData, error: insertError } = await supabase
        .from('training_sessions')
        .insert({
          user_id: userId,
          trigger_word: triggerWord,
          training_data_url: publicUrl,
          status: 'processing',
          num_images: trainingImages.length
        })
        .select()
        .single();

      if (insertError) {
        throw new Error('Failed to save training record');
      }

      // Start training process via Edge Function
      const response = await fetch('http://localhost:8000/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          training_data_url: publicUrl,
          trigger_word: triggerWord,
          session_id: trainingData.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start training');
      }

      // Poll for training progress
      const pollInterval = setInterval(async () => {
        const { data: session } = await supabase
          .from('training_sessions')
          .select('status, progress')
          .eq('id', trainingData.id)
          .single();

        if (session) {
          setTrainingProgress(session.progress || 0);

          if (session.status === 'completed') {
            clearInterval(pollInterval);
            navigate(`/generate/${trainingData.id}`);
          } else if (session.status === 'failed') {
            clearInterval(pollInterval);
            setError('Training failed. Please try again.');
            setIsTraining(false);
          }
        }
      }, 5000); // Poll every 5 seconds

    } catch (err) {
      console.error('Error:', err);
      setError('Something went wrong. Please try again.');
      setIsTraining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">Create Your AI Portrait Model</h1>
          <p className="text-gray-600">Upload 12-20 photos of yourself in different poses and lighting</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
          {/* Image Requirements */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">Photo Requirements:</h3>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              {IMAGE_REQUIREMENTS.map((req, index) => (
                <li key={index}>{req}</li>
              ))}
            </ul>
            <p className="mt-2 text-blue-600 font-medium">
              Current: {trainingImages.length} / {MIN_IMAGES} required ({MAX_IMAGES} max)
            </p>
          </div>

          {/* Image Upload Area */}
          <div 
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-purple-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="space-y-4">
              <UploadIcon className="w-12 h-12 text-gray-400 mx-auto" />
              <p className="text-gray-500">Click to add more photos</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Image Preview Grid */}
          {trainingImages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {trainingImages.map((file, index) => (
                <div key={index} className="relative group">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Training image ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(index);
                    }}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Trigger Word Input */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Set Your Trigger Word</h2>
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={triggerWord}
                onChange={(e) => setTriggerWord(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2 border rounded-lg font-mono"
                placeholder="PERSON_XYZ123"
              />
              <Button
                onClick={regenerateTriggerWord}
                className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                Generate New
              </Button>
            </div>
            <div className="text-sm text-gray-500">
              <p>This word will be used to identify you in prompts. For example:</p>
              <p className="mt-1 font-mono bg-gray-100 p-2 rounded">
                "A photo of {triggerWord} in a business suit"
              </p>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-center">{error}</p>
          )}

          <div className="flex justify-center">
            <Button
              size="lg"
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              onClick={handleSubmit}
              disabled={isTraining || trainingImages.length < MIN_IMAGES || !triggerWord}
            >
              {isTraining ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Training Model ({Math.round(trainingProgress)}%)
                </span>
              ) : (
                'Start Training'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}