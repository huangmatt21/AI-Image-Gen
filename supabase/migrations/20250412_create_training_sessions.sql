-- Create training_sessions table
CREATE TABLE training_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  trigger_word text NOT NULL,
  training_data_url text NOT NULL,
  model_id text,
  status text NOT NULL DEFAULT 'processing',
  progress float DEFAULT 0,
  num_images integer NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can insert their own training sessions"
ON training_sessions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own training sessions"
ON training_sessions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own training sessions"
ON training_sessions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON training_sessions
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
