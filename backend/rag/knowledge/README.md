# Knowledge base (RAG source content)

Markdown files in this folder are the hand-written source for the chatbot's
knowledge base: FAQ, booking rules, payment and platform-fee details, policies.
Turf information is not written here; it comes from the `turfs` collection in Mongo.

These files and Mongo are the source of truth. Chroma (`turf-chroma`, collection
`turfbook_kb`) holds only derived chunks + embeddings and can be wiped and
rebuilt by re-running the ingest script (`rag/build_kb.py`, to be written).

Guidelines:
- One topic per file, e.g. `faq_payments.md`, `booking_rules.md`.
- Only state what the platform actually does today. For undecided policies
  (cancellation/refunds, etc.) say so explicitly so the bot does not invent one.
- No secrets, internal URLs or personal data: anything here can end up in a chat answer.
- Do not state slot times or opening hours here; the bot answers those from live slot data.
- `SUPPORT_EMAIL_PLACEHOLDER` must be replaced with the real support address before the bot goes live.
