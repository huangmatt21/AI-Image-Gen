import { useState, useRef, useEffect } from 'react';
import { X, UploadIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import JSZip from 'jszip';
import { supabase } from '../lib/supabase';

const MIN_IMAGES = 12;
const MAX_IMAGES = 20;
const BUCKET_NAME = 'public-images';

const STYLE_OPTIONS = [
  { id: 'ghibli', name: 'Ghibli', description: 'Studio Ghibli anime style' },
  { id: 'simpsons', name: 'Simpsons', description: 'The Simpsons cartoon style' },
  { id: 'cartoon', name: 'Cartoon', description: 'Modern cartoon style' },
  { id: 'pixar', name: 'Pixar', description: 'Pixar 3D animation style' },
];

const ZIP_REQUIREMENTS = [
  'ZIP file containing 12-20 photos',
  'Photos should include:',
  '- Different facial expressions (smiling, neutral, serious)',
  '- Various angles (front, profile, 3/4 view)',
  '- Different lighting conditions',
  '- Various backgrounds',
  '- High-quality, clear photos',
];

export function Upload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [imageCount, setImageCount] = useState<number>(0);
  const [triggerWord, setTriggerWord] = useState<string>('');
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState(STYLE_OPTIONS[0].id);
  const [pollIntervalId, setPollIntervalId] = useState<NodeJS.Timeout | null>(null);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        setPollIntervalId(null);
      }
    };
  }, [pollIntervalId]);

  // Initialize trigger word
  useEffect(() => {
    regenerateTriggerWord();
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/zip') {
      setError('Please upload a ZIP file containing your photos.');
      return;
    }

    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const allFiles = Object.values(contents.files);
      
      // Filter out macOS system files and get unique paths
      const imageFiles = allFiles
        .filter(f => {
          // Exclude macOS system files and directories
          const isMacSystemFile = f.name.startsWith('__MACOSX/') || f.name.includes('.DS_Store');
          const isImageFile = !f.dir && f.name.match(/\.(jpg|jpeg|png)$/i);
          return !isMacSystemFile && isImageFile;
        })
        // Get unique files by base name to handle duplicates
        .filter((f, index, self) => 
          index === self.findIndex((t) => 
            t.name.split('/').pop() === f.name.split('/').pop()
          )
        );

      console.log('All files in ZIP:', allFiles.map(f => f.name));
      console.log('Filtered image files:', imageFiles.map(f => f.name));
      console.log('Number of unique image files:', imageFiles.length);

      if (imageFiles.length < MIN_IMAGES) {
        setError(`Not enough images. Found ${imageFiles.length}, but need at least ${MIN_IMAGES} images.`);
        return;
      }
      if (imageFiles.length > MAX_IMAGES) {
        setError(`Too many images. Found ${imageFiles.length}, but maximum allowed is ${MAX_IMAGES} images. Please remove some images from your ZIP file.`);
        return;
      }

      setZipFile(file);
      setImageCount(imageFiles.length);
      setError('');
    } catch (err) {
      console.error('Error processing ZIP file:', err);
      setError('Failed to process ZIP file. Please make sure it\'s a valid ZIP archive.');
    }
  };

  const regenerateTriggerWord = () => {
    const adjectives = ['creative', 'dynamic', 'elegant', 'vibrant', 'sleek'];
    const nouns = ['portrait', 'headshot', 'photo', 'image', 'snapshot'];
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNum = Math.floor(Math.random() * 1000);
    setTriggerWord(`${randomAdjective}_${randomNoun}_${randomNum}`);
  };

  const handleSubmit = async () => {
    if (!zipFile || !triggerWord) return;

    try {
      setIsTraining(true);
      setError('');
      
      // Upload each image from the ZIP file
      const zip = new JSZip();
      const contents = await zip.loadAsync(zipFile);
      const imageFiles = Object.values(contents.files).filter(f => {
        const isMacSystemFile = f.name.startsWith('__MACOSX/') || f.name.includes('.DS_Store');
        const isImageFile = !f.dir && f.name.match(/\.(jpg|jpeg|png)$/i);
        return !isMacSystemFile && isImageFile;
      });

      // Create a unique user ID for this session if not exists
      const sessionId = localStorage.getItem('sessionId') || Math.random().toString(36).substring(2, 15);
      localStorage.setItem('sessionId', sessionId);

      // Create a folder for this training session
      const folderPath = `${sessionId}/${triggerWord}`;

      // Upload each image
      for (let i = 0; i <imageFiles.length; i++) {
        const file = imageFiles[i];
        const imageData = await file.async('blob');
        const fileName = file.name.split('/').pop() || file.name;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(`${folderPath}/${fileName}`, imageData, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Failed to upload ${fileName}: ${uploadError.message}`);
        }
        // Update progress
        setTrainingProgress((i + 1) / imageFiles.length);
      }

      // Start the training process
      const response = await fetch('http://localhost:8000/stylize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          userId: sessionId,
          triggerWord,
          folderPath: `${sessionId}/${triggerWord}`,
          imageCount: imageFiles.length,
          style: selectedStyle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to start training process');
      }

      const result = await response.json();
      console.log('Training started:', result);

      // Poll for training status
      let pollCount = 0;
      const maxPolls = 60; // 5 minutes maximum (5s * 60)
      const intervalId = setInterval(async () => {
        try {
          const statusResponse = await fetch(`http://localhost:8000/status/${sessionId}/${triggerWord}`, {
            headers: {
              'Access-Control-Allow-Origin': '*',
            }
          });
          const statusData = await statusResponse.json();

          if (statusData.error) {
            if (intervalId) clearInterval(intervalId);
            throw new Error(statusData.error);
          }

          if (statusData.status === 'completed') {
            if (intervalId) clearInterval(intervalId);
            navigate(`/result?userId=${sessionId}&triggerWord=${triggerWord}`);
          } else if (statusData.status === 'failed') {
            if (intervalId) clearInterval(intervalId);
            throw new Error('Training failed. Please try again.');
          } else {
            // Update progress
            setTrainingProgress(statusData.progress || 0);
          }

          pollCount++;
          if (pollCount >= maxPolls) {
            if (intervalId) clearInterval(intervalId);
            throw new Error('Training timed out. Please try again.');
          }
        } catch (err) {
          if (pollIntervalId) {
        clearInterval(pollIntervalId);
        setPollIntervalId(null);
      }
          throw err;
        }
      }, 5000); // Poll every 5 seconds
      
      setPollIntervalId(intervalId);
    } catch (err) {
      console.error('Error during upload:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsTraining(false);
      setTrainingProgress(0);
      // Clear any existing intervals
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        setPollIntervalId(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">Create Your AI Portrait Model</h1>
          <p className="text-gray-600">Upload a ZIP file containing 12-20 photos of yourself</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
          {/* Upload Requirements */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">Photo Requirements:</h3>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              {ZIP_REQUIREMENTS.map((req, index) => (
                <li key={index}>{req}</li>
              ))}
            </ul>
          </div>

          {/* ZIP Upload Area */}
          <div 
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-purple-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="w-12 h-12 text-gray-400 mx-auto" />
            <p className="text-gray-500 mt-2">
              {zipFile ? 'Click to replace ZIP file' : 'Click to upload ZIP file'}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* ZIP File Preview */}
          {zipFile && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold text-gray-900">{zipFile.name}</p>
                  <p className="text-sm text-gray-500">{imageCount} images detected</p>
                </div>
                <button
                  onClick={() => {
                    setZipFile(null);
                    setImageCount(0);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="text-red-500 hover:text-red-400"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          )}

          {/* Trigger Word Input */}
          <div className="space-y-2">
            <label htmlFor="trigger-word" className="block text-sm font-medium text-gray-700">
              Trigger Word
            </label>
            <div className="flex gap-2">
              <input
                id="trigger-word"
                type="text"
                value={triggerWord}
                onChange={(e) => setTriggerWord(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Enter a unique word to identify your model"
              />
              <Button
                onClick={regenerateTriggerWord}
                variant="outline"
                className="px-4 py-2"
              >
                Regenerate
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-center mt-4">{error}</p>
          )}

          {/* Style Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Select Style
            </label>
            <div className="grid grid-cols-2 gap-4">
              {STYLE_OPTIONS.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${selectedStyle === style.id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-200'
                    }`}
                >
                  <h3 className="font-medium text-gray-900">{style.name}</h3>
                  <p className="text-sm text-gray-500">{style.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end mt-6">
            <Button
              onClick={handleSubmit}
              disabled={isTraining || !zipFile || !triggerWord}
              className="px-6 py-2"
            >
              {isTraining ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Training... {Math.round(trainingProgress * 100)}%
                </div>
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