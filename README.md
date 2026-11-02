<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.
https://ai.studio/apps/6ff2b903-d2ed-4b09-9fb7-9c053cb4fd40

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Backend

The API lives in the `backend/` folder (Express + Prisma, MySQL). In dev it also serves the Vite app on the same origin, so the frontend calls relative URLs (`/pedidos/...` or `/api/...`).

1. Set `DATABASE_URL` in `.env` to your MySQL connection string (URL-encode special characters in the password).
2. Create the tables: `npm run db:push`
3. Import the SQL dump from `backend/database`: `npm run db:import`
4. Optional: `npm run db:studio` opens Prisma Studio.

Live data (orders, users, places, settings, driver assignments) is refreshed by polling the API every 15-30 seconds.