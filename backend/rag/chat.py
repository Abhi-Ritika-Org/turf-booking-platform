"""Answer a question with RAG: retrieve chunks from Chroma, put them in the
prompt, and let the LLM (via OpenRouter) write the answer.

Kept free of HTTP so it can be tried from the command line and reused by
/api/chat. When Chroma or the LLM cannot be used, AssistantUnavailable is
raised so the caller can answer 503.

Run from backend/ (or inside the turf-backend container):
    python -m rag.chat "How do I cancel my booking?"
"""
import sys
import threading

from openai import OpenAI, OpenAIError

from config import (
    OPEN_ROUTER_API_KEY,
    OPEN_ROUTER_BASE_URL,
    OPEN_ROUTER_MODEL,
)
from helpers.chroma_client import get_kb_collection

TOP_K = 4
# Cosine distance above this is treated as unrelated (from rag.query_kb runs)
MAX_DISTANCE = 0.6

NO_CONTEXT_ANSWER = (
    "Sorry, I don't have information about that. I can help with TurfBook "
    "bookings, payments, cancellations and turf details."
)

SYSTEM_PROMPT = """You are TurfBook's assistant. TurfBook is an app for booking sports turfs.

Rules:
- Answer ONLY using the context below. Do not use outside knowledge.
- If the context does not contain the answer, say you don't know and suggest contacting TurfBook support.
- Never guess slot availability or opening hours. Tell the user to open the turf's page and pick a date.
- Keep answers short and simple. Amounts are in Indian rupees (Rs.)."""

_client = None
_lock = threading.Lock()


class AssistantUnavailable(Exception):
    """Chroma or the LLM is down, rate-limited or not configured."""


def get_llm_client():
    """Shared OpenAI-SDK client pointed at OpenRouter. Created on first use so
    the API still starts when the key is not configured."""
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                if not OPEN_ROUTER_API_KEY or not OPEN_ROUTER_MODEL:
                    raise RuntimeError(
                        "OPEN_ROUTER_API_KEY and OPEN_ROUTER_MODEL must be set in backend/.env"
                    )
                # Short timeout / one retry: the agent may make several calls per request,
                # and each one holds a worker thread (the frontend gives up after 60 s).
                _client = OpenAI(
                    base_url=OPEN_ROUTER_BASE_URL, api_key=OPEN_ROUTER_API_KEY, timeout=20, max_retries=1
                )
    return _client


def retrieve(collection, question, k=TOP_K, max_distance=MAX_DISTANCE):
    """The k closest chunks, dropping any farther than max_distance."""
    result = collection.query(
        query_texts=[question],
        n_results=k,
        include=["documents", "metadatas", "distances"],
    )
    chunks = []
    for chunk_id, text, metadata, distance in zip(
        result["ids"][0],
        result["documents"][0],
        result["metadatas"][0],
        result["distances"][0],
    ):
        if distance <= max_distance:
            chunks.append({"id": chunk_id, "text": text, "metadata": metadata, "distance": distance})
    return chunks


def build_messages(question, chunks):
    context = "\n\n".join(f"[{i}] {c['text']}" for i, c in enumerate(chunks, start=1))
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
    ]


def answer(question, collection=None, client=None):
    """Returns {"answer": str, "sources": [chunk ids]}."""
    try:
        collection = collection or get_kb_collection()
        chunks = retrieve(collection, question)
    except Exception as e:
        raise AssistantUnavailable("Knowledge base is unavailable") from e
    if not chunks:
        # Nothing relevant: skip the LLM call so it cannot make something up.
        return {"answer": NO_CONTEXT_ANSWER, "sources": []}

    try:
        client = client or get_llm_client()
        response = client.chat.completions.create(
            model=OPEN_ROUTER_MODEL,
            messages=build_messages(question, chunks),
            temperature=0.2,
        )
    except (OpenAIError, RuntimeError) as e:
        raise AssistantUnavailable("LLM is unavailable") from e
    if not response.choices:
        # OpenRouter can return 200 with no choices when the upstream provider errors.
        raise AssistantUnavailable("LLM returned no answer")
    text = (response.choices[0].message.content or "").strip()
    return {"answer": text, "sources": [c["id"] for c in chunks]}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit('Usage: python -m rag.chat "your question"')
    try:
        result = answer(" ".join(sys.argv[1:]))
    except AssistantUnavailable as e:
        sys.exit(f"{e}: {e.__cause__}")
    print(result["answer"])
    print(f"\nSources: {', '.join(result['sources']) or 'none'}")
