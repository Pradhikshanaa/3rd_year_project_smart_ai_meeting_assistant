# AI Meeting Assistant

## Deploy the frontend to Vercel

1. Import `https://github.com/Pradhikshanaa/ai_meeting_assistant-` into Vercel.
2. Set **Root Directory** to `frontend`.
3. Keep the framework preset as **Vite**. The build command is `npm run build` and the output directory is `dist`.
4. Add these Vercel environment variables:

```text
VITE_API_URL=https://<your-backend-domain>/api
VITE_SOCKET_URL=https://<your-backend-domain>
```

5. Deploy. The `frontend/vercel.json` rewrite keeps React Router routes working on refresh.

## Backend requirement

Vercel is serving the React frontend only. Deploy the `backend` Flask-SocketIO app on a persistent Python host such as Render, Railway, or Fly.io, then set its database, `SECRET_KEY`, `GEMINI_API_KEY`, SMTP, and CORS environment variables there. WebRTC signaling requires the backend's Socket.IO endpoint to remain available; it cannot be hosted as a normal Vercel static deployment.

For a local check, run the backend on port `5000`, set `VITE_API_URL=http://127.0.0.1:5000/api` and `VITE_SOCKET_URL=http://127.0.0.1:5000`, then run `npm run dev` from `frontend`.