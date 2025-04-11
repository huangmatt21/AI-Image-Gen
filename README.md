# AI Image Style Transfer

A web application that transforms your images into different artistic styles using AI. Built with React, Supabase, and Stable Diffusion.

## Features

- Upload and preview images
- Multiple style options:
  - Studio Ghibli
  - The Simpsons
  - Disney Cartoon
  - Pixar 3D
- Automatic image resizing
- Real-time processing status
- Side-by-side result comparison

## Tech Stack

- Frontend:
  - React + TypeScript
  - Vite
  - Tailwind CSS
  - React Router
- Backend:
  - Supabase (Storage, Database, Edge Functions)
  - Replicate API (Stable Diffusion XL)

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
