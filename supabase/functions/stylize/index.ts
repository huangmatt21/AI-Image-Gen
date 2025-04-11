import { createClient } from "@supabase/supabase-js";
import Replicate from "replicate";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    let model: string;
    let modelInput: { input: { prompt: string; image: string; num_inference_steps: number; denoising_strength: number; } };

    model = "stability-ai/sdxl:c221b2b8ef527988fb59bf24a8b97c4561f1c671f73bd389f866bfb27c061316";
    
    switch (style) {
      case "ghibli":
        modelInput = {
          input: {
            image,
            prompt: "Studio Ghibli style anime art, Hayao Miyazaki style, soft lighting, pastel colors, masterpiece quality",
            num_inference_steps: 50,
            denoising_strength: 0.55
          }
        };
        break;
      case "simpsons":
        modelInput = {
          input: {
            image,
            prompt: "The Simpsons style, yellow skin, cartoon art style, bright colors, Matt Groening art",
            num_inference_steps: 50,
            denoising_strength: 0.55
          }
        };
        break;
      case "cartoon":
        modelInput = {
          input: {
            image,
            prompt: "Disney animation style, hand-drawn cartoon, vibrant colors, classic animation",
            num_inference_steps: 50,
            denoising_strength: 0.55
          }
        };
        break;
      case "pixar":
        modelInput = {
          input: {
            image,
            prompt: "Pixar 3D animation style, high quality, detailed, CGI render, cinematic lighting",
            num_inference_steps: 50,
            denoising_strength: 0.55
          }
        };
        break;
      default:
        return new Response(
          JSON.stringify({ error: "Invalid style" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

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