# ZeroDayGPT 🖥️⚡

A hacker-style full-stack chatbot with WebSocket streaming, Stack Overflow integration, and AI-powered fraud detection.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, Vanilla CSS (hacker terminal theme) |
| Backend | FastAPI (Python), WebSocket streaming |
| LLM | OpenAI-compatible API (configurable model) |
| OCR | Tesseract |
| NLP | scikit-learn TF-IDF + Logistic Regression |
| Data | Stack Exchange API |
| Deploy | Docker + Docker Compose |

## Quick Start (Local Dev)

### 1. Backend

```powershell
cd backend
pip install -r requirements.txt
copy .env.example .env
# Edit .env: set OPENAI_API_KEY, MODEL_NAME, API_SECRET_KEY
uvicorn main:app --reload --port 8000
```

> **Windows Tesseract**: Download from https://github.com/UB-Mannheim/tesseract/wiki  
> Set `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe` in `.env`

### 2. Frontend

```powershell
cd frontend
npm install
copy .env.example .env
# Edit .env: set VITE_API_KEY to match backend API_SECRET_KEY
npm run dev
```

Open http://localhost:5173

## Docker Deployment

```powershell
# Copy and configure env files first
copy backend\.env.example backend\.env
# Edit backend/.env with your keys

docker-compose up --build
```

- Frontend: http://localhost:3000  
- Backend API: http://localhost:8000  
- API Docs: http://localhost:8000/docs

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `WS` | `/ws/chat` | Streaming chat (WebSocket) |
| `GET` | `/stackoverflow?query=...` | Fetch Stack Overflow Q&A |
| `POST` | `/fraudcheck` | Fraud detection (file upload) |
| `GET` | `/health` | Backend health check |

All REST endpoints require `X-API-Key` header.

## Environment Variables

### Backend (`backend/.env`)
```
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4o
API_SECRET_KEY=your-secret-key
STACK_API_KEY=optional-stack-exchange-key
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

### Frontend (`frontend/.env`)
```
VITE_API_KEY=your-secret-key
VITE_WS_URL=ws://localhost:8000/ws/chat
VITE_API_BASE=http://localhost:8000
```

## Features

- **💬 Streaming Chat** — Real-time token streaming via WebSocket
- **🔍 Stack Overflow Feed** — Live Q&A fetched from Stack Exchange API
- **🛡️ Fraud Detector** — Upload email screenshots or text; OCR + NLP returns risk verdict
- **🎨 Hacker UI** — Neon green terminal theme, ASCII banner, scanline overlay, blinking cursor
- **🔐 Auth** — API key authentication on all endpoints
- **🐳 Docker** — Full containerized deployment
