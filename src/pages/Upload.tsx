import { useState, useRef, useEffect } from 'react';
import { X, UploadIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import JSZip from 'jszip';
import { supabase } from '../lib/supabase';

const MIN_IMAGES = 12;
const MAX_IMAGES = 20;

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
  const [userId, setUserId] = useState<string | null>(null);

  // Initialize trigger word
  useEffect(() => {
    setUserId('demo-user'); // Use a demo user ID
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
    if (!userId || !zipFile || !triggerWord) return;

    try {
      setIsTraining(true);
      setError('');

      const bucketName = 'training-images';
      
      // First check if bucket exists
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some(b => b.name === bucketName);

      if (!bucketExists) {
        // Create bucket if it doesn't exist
        const { error: createError } = await supabase.storage.createBucket(bucketName, {
          public: true,
          fileSizeLimit: null
        });

        if (createError) {
          throw new Error(`Failed to create bucket: ${createError.message}`);
        }
      }

      // Upload to the training-images bucket
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(`${userId}/${triggerWord}.zip`, zipFile, {
          cacheControl: '3600',
          upsert: false
        });

      // Check for upload errors
      if (uploadError) {
        throw new Error(`Failed to upload images: ${uploadError.message}`);
      }

      // Get the URL of the uploaded file
      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(`${userId}/${triggerWord}.zip`);

      // Start the training process
      const response = await fetch('http://localhost:8000/stylize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          triggerWord,
          imageUrl: publicUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Training failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Training started:', result);

      // Poll for training status
      const pollInterval = setInterval(async () => {
        const pollResponse = await fetch(`http://localhost:8000/status/${result.id}`);
        const pollResult = await pollResponse.json();

        if (pollResult.status === 'completed') {
          clearInterval(pollInterval);
          setIsTraining(false);
          navigate('/result', { state: { modelId: result.id } });
        } else if (pollResult.status === 'failed') {
          clearInterval(pollInterval);
          setIsTraining(false);
          setError('Training failed. Please try again.');
        } else {
          setTrainingProgress(pollResult.progress || 0);
        }
      }, 5000);
    } catch (err) {
      console.error('Error during training:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsTraining(false);
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