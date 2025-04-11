import { createClient } from "@supabase/supabase-js";
import OpenAI from "npm:openai@4.24.1";

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

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const openai = new OpenAI({
      apiKey: openaiApiKey
    });

    // Check for required environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    let systemPrompt: string;
    let userPrompt: string;
    
    switch (style) {
      case "ghibli":
        systemPrompt = "You are an expert in Studio Ghibli's art style and anime aesthetics. Your goal is to create detailed, evocative prompts that will help generate images capturing the essence of Hayao Miyazaki's distinctive style.";
        userPrompt = "Create a detailed prompt for generating an image in Studio Ghibli's style. The image should have soft, warm lighting, pastel colors, and the distinctive Ghibli character design. Include specific details about lighting, atmosphere, and artistic elements that make Ghibli's style unique.";
        break;
      case "simpsons":
        systemPrompt = "You are an expert in The Simpsons' distinctive art style and animation. Your goal is to create detailed prompts that capture Matt Groening's iconic character design and color palette.";
        userPrompt = "Create a detailed prompt for generating an image in The Simpsons style. Focus on the distinctive yellow skin tone, overbite, and large eyes. Include specific details about the bold colors, line work, and characteristics that make The Simpsons style immediately recognizable.";
        break;
      case "cartoon":
        systemPrompt = "You are an expert in Disney's traditional animation style. Your goal is to create detailed prompts that capture the magic and artistry of classic Disney animation.";
        userPrompt = "Create a detailed prompt for generating an image in classic Disney animation style. Focus on the fluid lines, expressive features, and rich color palette. Include specific details about the artistic elements that make Disney's style timeless.";
        break;
      case "pixar":
        systemPrompt = "You are an expert in Pixar's 3D animation style. Your goal is to create detailed prompts that capture Pixar's signature blend of realism and stylization.";
        userPrompt = "Create a detailed prompt for generating an image in Pixar's style. Focus on the detailed texturing, expressive features, and cinematic lighting. Include specific details about the technical and artistic elements that make Pixar's style distinctive.";
        break;
      default:
        return new Response(
          JSON.stringify({ error: "Invalid style" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log('Generating prompt with GPT-4...');
    const promptResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const generatedPrompt = promptResponse.choices[0].message.content;
    console.log('Generated prompt:', generatedPrompt);

    console.log('Generating image with DALL-E 3...');
    const imageResponse = await openai.images.generate({
      prompt: generatedPrompt,
      n: 1,
      size: "1024x1024",
      model: "dall-e-3"
    });

    const output = imageResponse.data[0].url;

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