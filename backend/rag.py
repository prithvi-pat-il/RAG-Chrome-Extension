import uuid
import os
from dotenv import load_dotenv
from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate


load_dotenv()
os.environ["USER_AGENT"] = "rag-extension"

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")



sessions = {}

def process_url(url):
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise ValueError("A valid HTTP or HTTPS URL is required.")
        
    loader = WebBaseLoader(url)
    docs = loader.load()

    if not docs:
        raise ValueError("Could not extract any content from the provided URL.")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    chunks = splitter.split_documents(docs)

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=GOOGLE_API_KEY
    )

    vectorstore = FAISS.from_documents(chunks, embeddings)

    session_id = str(uuid.uuid4())
    sessions[session_id] = vectorstore

    return session_id


def ask_question(session_id, question):
    vectorstore = sessions.get(session_id)

    if not vectorstore:
        return "Session expired or not found. Please reload or re-process the page."

    retriever = vectorstore.as_retriever()

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.3,
        google_api_key=GOOGLE_API_KEY
    )

    prompt = ChatPromptTemplate.from_template("""
    Answer the question based only on the context below.

    Context:
    {context}

    Question:
    {question}
    """)

    docs = retriever.invoke(question)
    context = "\n\n".join([doc.page_content for doc in docs])

    response = llm.invoke(
        prompt.format(context=context, question=question)
    )

    return response.content
