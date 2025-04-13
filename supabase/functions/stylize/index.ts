import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';

interface TrainingResponse {
  id: string;
  detail?: string;
  status: string;
  progress: number;
}

interface TrainingRequest {
  training_data_url: string;
  trigger_word: string;
  session_id: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const replicateApiToken = Deno.env.get('REPLICATE_API_TOKEN');

if (!supabaseUrl || !supabaseServiceKey || !replicateApiToken) {
  throw new Error('Missing environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Add CORS headers to all responses
  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: responseHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: responseHeaders }
    );
  }

  try {
    // Check content type
    const contentType = req.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Parse request body
    let requestData;
    try {
      requestData = await req.json();
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: responseHeaders }
      );
    }

    const { training_data_url, trigger_word, session_id } = requestData;

    if (!training_data_url || !trigger_word || !session_id) {
      throw new Error('Missing required fields');
    }

    // Start training using FLUX
    const response = await fetch('https://api.replicate.com/v1/trainings', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'ostris/flux-dev-lora-trainer',
        input: {
          input_images: training_data_url,
          trigger_word: trigger_word,
          steps: 1000,
          learning_rate: 0.0001,
          batch_size: 1,
          resolution: 512,
          autocaptioning: true
        }
      })
    });

    const training = await response.json();

    if (response.status !== 201) {
      throw new Error(`Replicate API error: ${training.detail}`);
    }

    // Update training session with Replicate training ID
    const { error: updateError } = await supabase
      .from('training_sessions')
      .update({
        model_id: training.id,
        status: 'training'
      })
      .eq('id', session_id);

    if (updateError) {
      throw updateError;
    }

    // Start polling for training progress
    const pollTraining = async () => {
      const pollResponse = await fetch(`https://api.replicate.com/v1/trainings/${training.id}`, {
        headers: {
          'Authorization': `Token ${replicateApiToken}`,
          'Content-Type': 'application/json',
        },
      });

      const pollData = await pollResponse.json();

      // Update progress in database
      await supabase
        .from('training_sessions')
        .update({
          status: pollData.status,
          progress: pollData.progress * 100 // Convert to percentage
        })
        .eq('id', session_id);

      // If training is still running, poll again in 10 seconds
      if (pollData.status === 'processing') {
        setTimeout(pollTraining, 10000);
      }
    };

    // Start polling
    pollTraining();

    return new Response(
      JSON.stringify({ training_id: training.id }),
      { headers: responseHeaders }
    );

  } catch (err) {
    console.error('Error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: responseHeaders }
    );
  }
});