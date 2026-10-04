from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag import process_url, ask_question

app = FastAPI(title="RAG Chrome Extension Backend")

# Allow Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ProcessRequest(BaseModel):
    url: str

class AskRequest(BaseModel):
    question: str
    session_id: str

@app.get("/")
def read_root():
    return {"status": "ok", "message": "RAG Backend is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/process")
def process(data: ProcessRequest):
    try:
        session_id = process_url(data.url)
        return {"session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/ask")
def ask(data: AskRequest):
    try:
        answer = ask_question(data.session_id, data.question)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))