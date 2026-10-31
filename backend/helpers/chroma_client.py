"""Shared Chroma client for the RAG knowledge base.

Created lazily (not in config.py) because chromadb.HttpClient connects to the
server on construction; building it at import time would stop the whole API
from starting whenever Chroma is down. A failed attempt is not cached, so the
next call retries.
"""
import threading

import chromadb
from chromadb.config import Settings

from config import CHROMA_COLLECTION, CHROMA_HOST, CHROMA_PORT

_client = None
_lock = threading.Lock()


def get_chroma_client():
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = chromadb.HttpClient(
                    host=CHROMA_HOST,
                    port=CHROMA_PORT,
                    settings=Settings(anonymized_telemetry=False),
                )
    return _client


def get_kb_collection():
    """The knowledge-base collection. Uses Chroma's default embedding function
    (local all-MiniLM-L6-v2), so callers can pass plain text as documents /
    query_texts. Changing the embedding model requires re-ingesting everything."""
    return get_chroma_client().get_or_create_collection(
        CHROMA_COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )
