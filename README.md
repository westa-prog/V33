<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ne3GT9VF9NGp54boiU_mhhqkPE96PKw5

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Render Deploy

This repo is configured to run on Render as a single Node service:

1. Frontend builds into `dist/`
2. Backend builds into `backend/dist/`
3. Express serves both the API and the frontend build

Files used for Render:

- [render.yaml](/c:/Users/AA6/Desktop/Asana/V33/render.yaml)
- [package.json](/c:/Users/AA6/Desktop/Asana/V33/package.json)
- [backend/.env.example](/c:/Users/AA6/Desktop/Asana/V33/backend/.env.example)
- [backend architecture doc](/c:/Users/AA6/Desktop/Asana/V33/docs/backend-architecture.md)
- [deployment runbook](/c:/Users/AA6/Desktop/Asana/V33/docs/deployment-runbook.md)
- [release checklist](/c:/Users/AA6/Desktop/Asana/V33/docs/release-checklist.md)
- [API contract](/c:/Users/AA6/Desktop/Asana/V33/docs/api-contract.md)
- [core Supabase migration](/c:/Users/AA6/Desktop/Asana/V33/supabase/migrations/0001_app_core.sql)
- [AI assistant Supabase migration](/c:/Users/AA6/Desktop/Asana/V33/supabase/migrations/0002_ai_assistant.sql)

Required Render environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY`
- `VITE_API_URL`
- `VITE_GOOGLE_CLIENT_ID` if you want Gmail OAuth in the UI
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `RESEND_API_KEY` optional, can be used as the primary/fallback mail provider
- `RESEND_FROM` required when using Resend

Important:

- The app health check is `GET /api/status`.
- The release gate is `GET /api/status -> releaseReady === true`.
- Render builds the frontend first, so all `VITE_*` variables must be present in Render before the first deploy.
- Run the SQL migrations in `supabase/migrations/` before using the app against a fresh Supabase project.

## Local Fullstack Runbook

1. Install root dependencies: `npm install`
2. Install backend dependencies: `npm --prefix backend install`
3. Add frontend env values in `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY`
   - `VITE_API_URL`
   - optional `VITE_GOOGLE_CLIENT_ID`
4. Add backend env values in `backend/.env`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - either SMTP settings:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `SMTP_FROM`
   - or Resend settings:
   - `RESEND_API_KEY`
   - `RESEND_FROM`
5. Run frontend dev server: `npm run dev`
6. Run backend dev server: `npm run dev:server`

## Current Verification

- Frontend TypeScript check passes: `npx tsc -p tsconfig.json --noEmit`
- Backend build passes: `npm --prefix backend run build`
- Full Vite production build could not be executed in this sandbox because `esbuild` fails here with `spawn EPERM`
