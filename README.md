# AI Photorealistic Generator

A web application that creates a photorealistic AI model of yourself using multiple training images. Built with React, Supabase, and the FLUX framework.

## Features

- Upload and preview multiple training images (12-20 required)
- Automatic trigger word generation
- Image requirements guide:
  - Different facial expressions
  - Various angles
  - Different lighting conditions
  - Various backgrounds
- Real-time training progress tracking
- Automatic image resizing and optimization
- Secure model training and storage

## Tech Stack

- Frontend:
  - React + TypeScript
  - Vite
  - Tailwind CSS
  - React Router
  - JSZip for image bundling
- Backend:
  - Supabase (Storage, Database, Edge Functions)
  - Replicate API (FLUX framework)
  - Deno Runtime for Edge Functions

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   REPLICATE_API_TOKEN=your_replicate_token
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Development

- Frontend runs on `http://localhost:5174`
- Supabase Edge Function runs on `http://localhost:8000`
