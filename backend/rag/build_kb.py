"""Build the chatbot knowledge base in Chroma.

Reads the markdown files in rag/knowledge/ and the turfs collection in Mongo,
turns them into chunks with stable ids, upserts them into the turfbook_kb
collection and deletes chunks whose source no longer exists. Safe to rerun.

Run from backend/ (or inside the turf-backend container):
    python -m rag.build_kb
"""
from pathlib import Path

from config import MongoDb
from helpers.chroma_client import get_kb_collection

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"


def load_markdown_chunks():
    """One chunk per '## ' section of every knowledge file except README.md."""
    chunks = []
    for path in sorted(KNOWLEDGE_DIR.glob("*.md")):
        if path.name == "README.md":
            continue
        sections = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("## "):
                sections.append({"heading": line[3:].strip(), "lines": []})
            elif sections:
                sections[-1]["lines"].append(line)
        for number, section in enumerate(sections, start=1):
            body = "\n".join(section["lines"]).strip()
            if not body:
                continue
            chunks.append({
                "id": f"{path.name}#{number}",
                "text": f"{section['heading']}\n{body}",
                "metadata": {
                    "source": "knowledge",
                    "file": path.name,
                    "heading": section["heading"],
                },
            })
    return chunks


def turf_to_text(turf):
    """Labelled sentences, so questions like 'who owns X' or 'turfs with
    parking' have words to match on."""
    owner = turf.get("owner_contact") or {}
    parts = [
        f"Turf: {(turf.get('name') or '').strip()}.",
        f"Location: {turf.get('location', 'not listed')}.",
        f"Price: Rs. {turf.get('price_per_hour', 'not listed')} per hour.",
        f"Sports: {', '.join(turf.get('sports') or []) or 'not listed'}.",
        f"Amenities: {', '.join(turf.get('amenities') or []) or 'not listed'}.",
    ]
    if turf.get("avg_rating") is not None:
        parts.append(
            f"Rating: {turf['avg_rating']} from {turf.get('total_reviews', 0)} reviews."
        )
    if owner.get("name") or owner.get("phone"):
        parts.append(
            f"Owner contact for cancellations and changes: "
            f"{owner.get('name') or ''}, {owner.get('phone') or ''}."
        )
    return " ".join(parts)


def load_turf_chunks(db):
    """One chunk per turf document."""
    chunks = []
    for turf in db["turfs"].find({}, {"_id": 0}):
        if not turf.get("id"):
            continue
        chunks.append({
            "id": f"{turf['id']}#0",
            "text": turf_to_text(turf),
            "metadata": {"source": "turf", "turf_id": turf["id"]},
        })
    return chunks


def build_kb():
    chunks = load_markdown_chunks() + load_turf_chunks(MongoDb)
    collection = get_kb_collection()

    if chunks:
        collection.upsert(
            ids=[c["id"] for c in chunks],
            documents=[c["text"] for c in chunks],
            metadatas=[c["metadata"] for c in chunks],
        )

    new_ids = {c["id"] for c in chunks}
    existing_ids = set(collection.get(include=[])["ids"])
    stale_ids = sorted(existing_ids - new_ids)
    if stale_ids:
        collection.delete(ids=stale_ids)

    print(f"Upserted {len(chunks)} chunks, deleted {len(stale_ids)} stale chunks.")


if __name__ == "__main__":
    build_kb()
