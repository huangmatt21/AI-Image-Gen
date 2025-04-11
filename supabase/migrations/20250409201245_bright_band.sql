/*
  # Create images table for storing image processing data

  1. New Tables
    - `images`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `original_url` (text, stores the original image URL)
      - `processed_url` (text, stores the processed image URL)
      - `status` (text, tracks processing status)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `images` table
    - Add policies for authenticated users to:
      - Insert their own images
      - Read their own images
      - Read public processed images
      - Update their own images
      - Delete their own images
*/

CREATE TABLE IF NOT EXISTS images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  original_url text NOT NULL,
  processed_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- Allow users to insert their own images
CREATE POLICY "Users can insert their own images"
  ON images
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to read their own images
CREATE POLICY "Users can read their own images"
  ON images
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to read public processed images
CREATE POLICY "Users can read public processed images"
  ON images
  FOR SELECT
  TO authenticated
  USING (status = 'completed' OR user_id = auth.uid());

-- Allow users to update their own images
CREATE POLICY "Users can update their own images"
  ON images
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own images
CREATE POLICY "Users can delete their own images"
  ON images
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to handle image deletion and cleanup
CREATE OR REPLACE FUNCTION handle_deleted_image()
RETURNS TRIGGER AS $$
BEGIN
  -- Add storage cleanup logic here if needed
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run when an image is deleted
CREATE TRIGGER on_image_deleted
  AFTER DELETE ON images
  FOR EACH ROW
  EXECUTE FUNCTION handle_deleted_image();