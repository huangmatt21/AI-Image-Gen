import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon } from 'lucide-react';
import { Button } from '../components/Button';
import { supabase } from '../lib/supabase';

const STYLES = [
  { id: 'ghibli', name: 'Studio Ghibli', description: 'Transform your photo into a magical Ghibli-style portrait' },
];

export function Upload() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Try to sign in anonymously
          const { error } = await supabase.auth.signInAnonymously();
          if (error) {
            if (error.status === 422 && error.message.includes('anonymous_provider_disabled')) {
              // If anonymous auth is disabled, create a temporary session
              const { error: signUpError } = await supabase.auth.signUp({
                email: `temp_${Math.random().toString(36).slice(2)}@temp.com`,
                password: Math.random().toString(36).slice(2)
              });
              if (signUpError) {
                throw signUpError;
              }
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        console.error('Auth error:', error);
        setError('Authentication failed. Please try again.');
      }
    };
    initAuth();
  }, []);

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
    const file = event.target.files?.[0];
    if (file) {
      try {
        const resizedBlob = await resizeImage(file);
        const resizedFile = new File([resizedBlob], file.name, { type: 'image/jpeg' });
        setSelectedFile(resizedFile);
        setError('');
      } catch (err) {
        console.error('Error resizing image:', err);
        setError('Failed to process image. Please try a different one.');
      }
    }
  };

  const handleStyleSelect = (styleId: string) => {
    setSelectedStyle(styleId);
    setError('');
  };

  const handleSubmit = async () => {
    if (!selectedFile || !selectedStyle) {
      setError('Please select both an image and a style');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('Starting image upload process...');
      
      // 1. Check authentication
      const { data: authData, error: authError } = await supabase.auth.getUser();
      console.log('Auth check result:', { user: authData?.user, error: authError });
      
      if (!authData.user) {
        throw new Error('User not authenticated');
      }

      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${authData.user.id}/${fileName}`;

      // List buckets to check if 'originals' exists
      const { data: bucketList, error: listError } = await supabase.storage
        .listBuckets();
      console.log('Available buckets:', bucketList);

      if (listError) {
        console.error('Error listing buckets:', listError);
        throw new Error('Failed to check storage configuration');
      }

      const imagesBucket = bucketList?.find(bucket => bucket.name === 'images');
      if (!imagesBucket) {
        console.error('Images bucket not found in:', bucketList?.map(b => b.name));
        throw new Error('Storage bucket not found. Please check your Supabase storage configuration.');
      }

      console.log('Attempting file upload:', { filePath });
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, selectedFile);
      
      console.log('Upload result:', { data: uploadData, error: uploadError });

      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error('Storage is not configured. Please try again later.');
        }
        throw uploadError;
      }

      // 2. Get the public URL of the uploaded image
      const { data: { publicUrl: originalUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      // 3. Create a record in the images table
      const { data: imageRecord, error: insertError } = await supabase
        .from('images')
        .insert({
          user_id: authData.user.id,
          original_url: originalUrl,
          status: 'pending'
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // 4. Call the edge function to process the image
      console.log('Calling edge function with:', { originalUrl, style: selectedStyle, imageId: imageRecord.id });
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch('http://localhost:8000', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: originalUrl,
          style: selectedStyle,
          imageId: imageRecord.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process image');
      }

      const data = await response.json();

      // 5. Update the image record with the processed URL
      const { error: updateError } = await supabase
        .from('images')
        .update({
          processed_url: data.url,
          status: 'completed'
        })
        .eq('id', imageRecord.id);

      if (updateError) {
        throw updateError;
      }

      navigate('/result', { 
        state: { 
          originalImage: originalUrl,
          stylizedImage: data.url 
        } 
      });
    } catch (err: any) {
      console.error('Error details:', {
        error: err,
        message: err.message,
        stack: err.stack,
        cause: err.cause
      });
      setError(`Failed to generate image: ${err.message || 'Unknown error occurred'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">Create Your Artwork</h1>
          <p className="text-gray-600">Upload a photo and choose your preferred style</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
          <div 
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-purple-500 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? (
              <div className="space-y-4">
                <img 
                  src={URL.createObjectURL(selectedFile)} 
                  alt="Preview" 
                  className="max-h-64 mx-auto rounded"
                />
                <p className="text-sm text-gray-500">Click to change image</p>
              </div>
            ) : (
              <div className="space-y-4">
                <UploadIcon className="w-12 h-12 text-gray-400 mx-auto" />
                <p className="text-gray-500">Click to upload your photo</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Choose a Style</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {STYLES.map((style) => (
                <button
                  key={style.id}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    selectedStyle === style.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300'
                  }`}
                  onClick={() => handleStyleSelect(style.id)}
                >
                  <h3 className="font-semibold text-gray-900">{style.name}</h3>
                  <p className="text-sm text-gray-500">{style.description}</p>
                </button>
              ))}
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
              disabled={isLoading || !selectedFile || !selectedStyle}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </span>
              ) : (
                'Generate Artwork'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}