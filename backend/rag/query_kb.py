"""Check retrieval from the knowledge base, without an LLM.

Prints the closest chunks for each question with their cosine distance
(0 = same meaning, larger = less related).

Run from backend/ (or inside the turf-backend container):
    python -m rag.query_kb                          # built-in sample questions
    python -m rag.query_kb "how do I cancel?"       # your own question(s)
    python -m rag.query_kb -k 5 --source turf "turf with parking"
"""
import argparse

from helpers.chroma_client import get_kb_collection

SAMPLE_QUESTIONS = [
    "How do I cancel my booking?",
    "Can I get a refund?",
    "What is the platform fee?",
    "How much do I pay for 2 hours?",
    "Money was deducted but booking is not confirmed",
    "What is the minimum booking time?",
    "Can I book 6 to 7 and 8 to 9 together?",
    "Which turfs have parking?",
    "Who is the owner of Arambh Cricket Club?",
    "Where can I play pickleball?",
    "Do you sell football shoes?",  # nothing relevant: distances should be high
]


def search(collection, question, k, source=None):
    result = collection.query(
        query_texts=[question],
        n_results=k,
        where={"source": source} if source else None,
        include=["documents", "metadatas", "distances"],
    )
    # query() takes a list of questions, so every field is a list per question;
    # [0] picks the results for our single question.
    return zip(
        result["ids"][0],
        result["distances"][0],
        result["metadatas"][0],
        result["documents"][0],
    )


def main():
    parser = argparse.ArgumentParser(description="Check knowledge-base retrieval.")
    parser.add_argument("questions", nargs="*", help="questions to search for")
    parser.add_argument("-k", type=int, default=3, help="results per question")
    parser.add_argument("--source", choices=["knowledge", "turf"],
                        help="only search one kind of chunk")
    args = parser.parse_args()

    collection = get_kb_collection()
    print(f"Collection has {collection.count()} chunks.\n")

    for question in args.questions or SAMPLE_QUESTIONS:
        print(f"Q: {question}")
        for chunk_id, distance, metadata, document in search(
            collection, question, args.k, args.source
        ):
            label = metadata.get("heading") or metadata.get("turf_id", "")
            snippet = " ".join(document.split())[:100]
            print(f"  {distance:.3f}  {chunk_id:<32} {label}")
            print(f"         {snippet}...")
        print()


if __name__ == "__main__":
    main()
