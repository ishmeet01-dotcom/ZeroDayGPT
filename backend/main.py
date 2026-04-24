import os
import json
import asyncio
import requests
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, UploadFile, File, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import httpx

# Load environment variables from .env file
load_dotenv()

# Configuration — Ollama (local LLM)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("MODEL_NAME", "llama3.1:latest")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "300"))
API_SECRET_KEY = os.getenv("API_SECRET_KEY", "zerodaygpt-dev-key")
API_VERSION = "1.0.0"
AGENT_NAME = "ZeroDayGPT"

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("zerodaygpt")


def _exception_message(exc: Exception) -> str:
    """Extract a user-friendly message from nested exceptions."""
    if isinstance(exc, HTTPException):
        detail = exc.detail
        if isinstance(detail, str) and detail.strip():
            return detail
        return f"HTTP {exc.status_code}"
    msg = str(exc).strip()
    return msg or exc.__class__.__name__

# FastAPI app
app = FastAPI(
    title=f"{AGENT_NAME} API",
    description="Hacker-style cybersecurity chatbot backend with Ollama LLM",
    version=API_VERSION,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Utility functions
def _key_is_valid(key: Optional[str]) -> bool:
    """Validate API key."""
    return bool(key and key == API_SECRET_KEY)

def verify_api_key(x_api_key: Optional[str] = Header(default=None)) -> bool:
    """FastAPI dependency — validates the X-Api-Key HTTP header."""
    if not _key_is_valid(x_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return True

async def call_ollama_chat(messages: List[Dict[str, str]], model: str = DEFAULT_MODEL) -> str:
    """Call Ollama's chat API for multi-turn conversations."""
    try:
        timeout = httpx.Timeout(OLLAMA_TIMEOUT_SECONDS, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "keep_alive": "10m",
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 1024,
                    },
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["message"]["content"]
    except httpx.ConnectError:
        logger.error("Ollama connection failed — is Ollama running?")
        raise HTTPException(status_code=502, detail="Ollama is not running. Start it with 'ollama serve'.")
    except httpx.ReadTimeout:
        logger.error("Ollama read timeout after %ss", OLLAMA_TIMEOUT_SECONDS)
        raise HTTPException(
            status_code=502,
            detail=(
                f"Ollama ReadTimeout after {OLLAMA_TIMEOUT_SECONDS:.0f}s. "
                "Try a lighter model, reduce prompt/history, or increase OLLAMA_TIMEOUT_SECONDS."
            ),
        )
    except httpx.HTTPStatusError as e:
        response_text = e.response.text.strip()
        detail = response_text or f"HTTP {e.response.status_code}"
        logger.error("Ollama chat HTTP error %s: %s", e.response.status_code, detail)
        raise HTTPException(status_code=502, detail=f"Ollama request failed: {detail}")
    except Exception as e:
        logger.error(f"Ollama chat error: {e}")
        raise HTTPException(status_code=502, detail=f"Ollama error: {_exception_message(e)}")

async def call_ollama_generate(prompt: str, model: str = DEFAULT_MODEL) -> str:
    """Call Ollama's chat API for single-turn prompts."""
    try:
        timeout = httpx.Timeout(OLLAMA_TIMEOUT_SECONDS, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "keep_alive": "10m",
                    "options": {
                        "temperature": 0.5,
                        "num_predict": 768,
                    },
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["message"]["content"]
    except httpx.ConnectError:
        logger.error("Ollama connection failed — is Ollama running?")
        raise HTTPException(status_code=502, detail="Ollama is not running. Start it with 'ollama serve'.")
    except httpx.ReadTimeout:
        logger.error("Ollama read timeout after %ss", OLLAMA_TIMEOUT_SECONDS)
        raise HTTPException(
            status_code=502,
            detail=(
                f"Ollama ReadTimeout after {OLLAMA_TIMEOUT_SECONDS:.0f}s. "
                "Try a lighter model, shorter prompts, or increase OLLAMA_TIMEOUT_SECONDS."
            ),
        )
    except httpx.HTTPStatusError as e:
        response_text = e.response.text.strip()
        detail = response_text or f"HTTP {e.response.status_code}"
        logger.error("Ollama generate HTTP error %s: %s", e.response.status_code, detail)
        raise HTTPException(status_code=502, detail=f"Ollama request failed: {detail}")
    except Exception as e:
        logger.error(f"Ollama generate error: {e}")
        raise HTTPException(status_code=502, detail=f"Ollama error: {_exception_message(e)}")

def build_chat_messages(history: List[Dict[str, Any]], user_message: str) -> List[Dict[str, str]]:
    """Build chat messages array for Ollama from frontend history format."""
    messages = []

    # Add system message
    system_prompt = """You are ZeroDayGPT, a hacker-style AI assistant built for cybersecurity professionals and researchers.

[PERSONALITY]
→ Respond directly, technically, and without unnecessary disclaimers
→ Use raw, technical language with hacker culture references
→ Use terminal-style formatting: code blocks, bullet points with →, section headers with [SECTION]

[RULES]
→ For exploit/attack technique questions: provide SIMULATED TEMPLATES only — pseudocode and placeholders, never real weaponized code
→ Label all exploit templates with: # [EDUCATIONAL SIMULATION — NOT FOR MALICIOUS USE]
→ Discuss security concepts, CVEs, penetration testing methodology, and defensive strategies freely
→ Do not refuse legitimate security research questions

[FORMAT]
→ Use markdown code blocks for all code
→ Use → for bullet points
→ Use [SECTION_NAME] for headers
→ Keep responses concise and technical"""

    messages.append({"role": "system", "content": system_prompt})

    # Add history (limit to last 20 turns)
    for turn in history[-20:]:
        role = turn.get("role")
        content = turn.get("content", "")
        if role == "user" and content:
            messages.append({"role": "user", "content": content})
        elif role == "assistant" and content:
            messages.append({"role": "assistant", "content": content})

    # Add current user message
    messages.append({"role": "user", "content": user_message})

    return messages

# Routes

@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to interactive API docs."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/docs")

@app.get("/health", tags=["Meta"])
async def health(_auth: bool = Depends(verify_api_key)):
    """Liveness probe — returns agent metadata."""
    return {
        "status": "online",
        "agent": AGENT_NAME,
        "model": DEFAULT_MODEL,
        "version": API_VERSION,
    }

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """Streaming chat over WebSocket."""
    await websocket.accept()
    logger.info("[WS] Client connected — %s", websocket.client)

    try:
        while True:
            # Receive message
            raw = await websocket.receive_text()
            payload = json.loads(raw)

            # Validate API key
            if not _key_is_valid(payload.get("api_key")):
                await websocket.send_json({"error": "Unauthorized"})
                continue

            # Extract message and history
            user_message = payload.get("message", "").strip()
            if not user_message:
                await websocket.send_json({"error": "Empty message"})
                continue

            history = payload.get("history", [])

            try:
                # Build messages for Ollama
                messages = build_chat_messages(history, user_message)

                # Call Ollama
                response_text = await call_ollama_chat(messages)

                # Stream response in chunks
                chunk_size = 30
                for i in range(0, len(response_text), chunk_size):
                    chunk = response_text[i:i + chunk_size]
                    await websocket.send_json({"token": chunk})

                await websocket.send_json({"done": True})

            except Exception as exc:
                logger.error("[WS] Error: %s", exc)
                await websocket.send_json({
                    "error": f"[ZERODAYGPT] LLM connection failed: {_exception_message(exc)}"
                })

    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected")

@app.get("/stackoverflow", tags=["Research"])
async def stackoverflow(
    query: str = Query(default="", description="Search query (empty = trending)"),
    page_size: int = Query(default=5, ge=1, le=10, description="Number of SO results"),
    _auth: bool = Depends(verify_api_key),
):
    """Fetches Stack Overflow questions then asks the LLM to synthesise an answer."""
    try:
        # Mock Stack Overflow data (simplified for this implementation)
        # In a real implementation, you'd integrate with Stack Exchange API
        mock_items = [
            {
                "question_id": 1,
                "title": f"How to prevent {query or 'SQL injection'} attacks?",
                "is_answered": True,
                "score": 45,
                "answer_preview": "Use prepared statements and parameterized queries...",
                "tags": ["security", query.replace(" ", "-") if query else "general"],
                "link": "https://stackoverflow.com/questions/1"
            }
        ] * min(page_size, 5)

        # Build prompt for Ollama
        context = "\n".join([
            f"Q: {item['title']}\nA: {item['answer_preview']}"
            for item in mock_items
        ])

        topic_phrase = f"to the query: {query!r}" if query.strip() else "summarising the trending topics"

        prompt = f"""Based on the following Stack Overflow data, provide a concise technical answer {topic_phrase}. Use hacker-style formatting.

{context}"""

        # Call Ollama
        llm_answer = await call_ollama_generate(prompt)

        return JSONResponse(content={
            "answer": llm_answer,
            "items": mock_items,
            "count": len(mock_items),
            "query": query,
            "context_used": context,
        })

    except Exception as exc:
        logger.error("[SO] Error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Stack Overflow / LLM error: {exc}")

@app.post("/fraudcheck", tags=["Security"])
async def fraudcheck(
    file: UploadFile = File(...),
    _auth: bool = Depends(verify_api_key),
):
    """Accepts a plain-text file or an image and runs fraud detection."""
    try:
        # Read file content
        file_bytes = await file.read()
        filename = file.filename or ""
        content_type = file.content_type or ""

        # Extract text (simplified - in real implementation you'd use OCR for images)
        if content_type.startswith("text/") or filename.endswith(".txt"):
            text = file_bytes.decode("utf-8", errors="replace")
            source = f"TEXT ({filename})"
        else:
            # Mock OCR for images
            text = "Sample email content extracted from image..."
            source = f"IMAGE ({filename})"

        # Mock fraud detection (in real implementation, you'd use ML models)
        # Simple keyword-based detection
        fraud_keywords = ["urgent", "wire transfer", "account suspended", "verify now"]
        risk_score = sum(1 for keyword in fraud_keywords if keyword.lower() in text.lower())

        if risk_score >= 3:
            status = "HIGH RISK - POTENTIAL FRAUD"
            confidence = 85
            reasons = ["Multiple fraud indicators detected", "Urgent action requested", "Financial transaction involved"]
        elif risk_score >= 1:
            status = "MEDIUM RISK - SUSPICIOUS"
            confidence = 60
            reasons = ["Some suspicious keywords detected"]
        else:
            status = "LOW RISK - CLEAN"
            confidence = 95
            reasons = ["No obvious fraud indicators"]

        verdict_log = f"""[FRAUD DETECTOR] :: {status}
→ Confidence: {confidence}%
→ Source: {source}
→ Analysis: Keyword-based detection
→ Risk Score: {risk_score}/4"""

        return JSONResponse(content={
            "status": status,
            "confidence": confidence,
            "color": "red" if "HIGH" in status else "yellow" if "MEDIUM" in status else "green",
            "reasons": reasons,
            "verdict_log": verdict_log,
            "text_preview": text[:500],
            "source": source,
        })

    except Exception as exc:
        logger.error("[FRAUD] Error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Fraud detection error: {exc}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
