import { createClient } from "@supabase/supabase-js";
import Replicate from "replicate";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check for authentication token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { image, style, imageId } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: "Image is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const replicateApiToken = Deno.env.get("REPLICATE_API_TOKEN");
    if (!replicateApiToken) {
      throw new Error("REPLICATE_API_TOKEN is not set");
    }

    const replicate = new Replicate({
      auth: replicateApiToken,
    });

    // Check for required environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    if (style !== "ghibli") {
      return new Response(
        JSON.stringify({ error: "Invalid style" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = "aaronaftab/mirage-ghibli:166efd159b4138da932522bc5af40d39194033f587d9bdbab1e594119eae3e7f";
    const modelInput = {
      input: {
        image,
        prompt: "ghibli style portrait, highly detailed face, soft lighting, character portrait in the style of Hayao Miyazaki",
        prompt_strength: 0.78 // Recommended range is 0.76-0.8
      }
    };

    console.log('Running model:', { model, modelInput });
    const output = await replicate.run(model, modelInput);

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Update the image record with the processed URL
    if (imageId) {
      const { error: updateError } = await supabaseClient
        .from('images')
        .update({
          processed_url: output,
          status: 'completed'
        })
        .eq('id', imageId);

      if (updateError) {
        console.error('Error updating image record:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ url: output }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});