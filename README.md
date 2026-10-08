# StudyShare AI backend

## Setup

```powershell
cd backend
npm install
Copy-Item .env.example .env
# Add your Gemini API key to .env
npm start
```

The API runs on `http://localhost:3000`. The Flutter web app calls `POST /api/summarize` with a multipart field named `file`.

Never commit `.env` or expose the Gemini key in Flutter code.