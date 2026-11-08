"""The chatbot agent: the LLM decides which tools to call (rag/tools.py), our
code runs them for the logged-in user, and the LLM answers from the results.

Run from backend/ (or inside the turf-backend container):
    python -m rag.agent <user_id> "show my last 3 bookings"
"""
import json
import sys
from openai import OpenAIError

from config import OPEN_ROUTER_MODEL
from rag.chat import AssistantUnavailable, get_llm_client
from rag.tools import OTHER_USER_MESSAGE, TOOL_SCHEMAS, ToolContext, run_tool, venue_now

MAX_STEPS = 6

FALLBACK_ANSWER = "Sorry, I couldn't work that out. Please try asking in a different way."

SYSTEM_PROMPT = """You are TurfBook's assistant. TurfBook is an app for booking sports turfs in India.
Today is {today} ({weekday}).

How to answer:
- Policy, rules, fees, payments, cancellations, refunds, support: call search_knowledge_base and answer only from its results.
- Free slots, open times, "is X free": call get_availability. Never guess availability.
- Prices for a specific time: call quote_price.
- Turf details or finding a turf_id from a name: call list_turfs.
- The user's own bookings: call list_my_bookings or get_booking.
- If a tool returns an error, explain it simply or fix your arguments and try again.
- If the tools don't give you the answer, say you don't know. Do not use outside knowledge.

Privacy:
- You can only see the logged-in user's own bookings and account. The tools find the user automatically; never ask for their user id.
- If the user asks for another person's bookings, payments or account details (by name, email, phone, user id or anything else), do not call any tool and reply exactly:
  "{other_user_message}"

You cannot create, cancel or change bookings, or take payments. For cancellations, give the turf owner's contact.
Keep answers short and friendly. Amounts are in Indian rupees (Rs.)."""


def build_system_prompt(now=None):
    now = now or venue_now()
    return SYSTEM_PROMPT.format(
        today=now.strftime("%d-%m-%Y"), weekday=now.strftime("%A"), other_user_message=OTHER_USER_MESSAGE
    )


def run_agent(question, ctx, client=None, max_steps=MAX_STEPS):
    """Returns {"answer": str, "sources": [knowledge chunk ids], "tools": [tool names called]}."""
    messages = [
        {"role": "system", "content": build_system_prompt()},
        {"role": "user", "content": question},
    ]
    sources, tools_used = [], []

    try:
        client = client or get_llm_client()
        for _ in range(max_steps):
            response = client.chat.completions.create(
                model=OPEN_ROUTER_MODEL,
                messages=messages,
                tools=TOOL_SCHEMAS,
                temperature=0.2,
            )
            if not response.choices:
                # OpenRouter can return 200 with no choices when the upstream provider errors.
                raise AssistantUnavailable("LLM returned no answer")
            message = response.choices[0].message
            if not message.tool_calls:
                answer = (message.content or "").strip() or FALLBACK_ANSWER
                return {"answer": answer, "sources": sources, "tools": tools_used}

            # Keep the model's tool request in the history, then add one result per call.
            messages.append({
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {"id": call.id, "type": "function",
                     "function": {"name": call.function.name, "arguments": call.function.arguments}}
                    for call in message.tool_calls
                ],
            })
            for call in message.tool_calls:
                result = run_tool(ctx, call.function.name, call.function.arguments)
                tools_used.append(call.function.name)
                if call.function.name == "search_knowledge_base":
                    sources += [r["id"] for r in result.get("results", []) if r["id"] not in sources]
                messages.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(result, default=str),
                })
    except (OpenAIError, RuntimeError) as e:
        raise AssistantUnavailable("LLM is unavailable") from e

    return {"answer": FALLBACK_ANSWER, "sources": sources, "tools": tools_used}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit('Usage: python -m rag.agent <user_id> "your question"')
    from config import MongoDb

    try:
        result = run_agent(" ".join(sys.argv[2:]), ToolContext(user_id=sys.argv[1], db=MongoDb))
    except AssistantUnavailable as e:
        sys.exit(f"{e}: {e.__cause__}")
    print(result["answer"])
    print(f"\nTools: {', '.join(result['tools']) or 'none'}")
    print(f"Sources: {', '.join(result['sources']) or 'none'}")
