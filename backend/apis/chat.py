import logging
from typing import Optional

from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import get_db
from middleware import current_user_id
from rag.agent import run_agent
from rag.chat import AssistantUnavailable
from rag.tools import ToolContext

MAX_MESSAGE_LENGTH = 1000


class ChatRequest(BaseModel):
    message: Optional[str] = None


def chat(
    payload: ChatRequest,
    user_id: str = Depends(current_user_id),
    mongo_db=Depends(get_db),
):
    """Answer a user's question with the agent (help articles + live turf and
    booking data). Stateless: each message is answered on its own, without chat
    history. The agent's tools only ever see this user's data."""
    message = (payload.message or "").strip()
    if not message:
        return JSONResponse({'status': False, 'error': 'Message is required!'}, status_code=400)
    if len(message) > MAX_MESSAGE_LENGTH:
        return JSONResponse(
            {'status': False, 'error': f'Message must be at most {MAX_MESSAGE_LENGTH} characters!'},
            status_code=400,
        )

    try:
        result = run_agent(message, ToolContext(user_id=user_id, db=mongo_db))
    except AssistantUnavailable:
        logging.exception("Chat assistant unavailable")
        return JSONResponse(
            {'status': False, 'error': 'The assistant is busy right now. Please try again in a moment.'},
            status_code=503,
        )
    except Exception:
        logging.exception("Error in chat")
        return JSONResponse({'status': False, 'error': 'Something went wrong'}, status_code=500)

    return JSONResponse(
        {'status': True, 'answer': result['answer'], 'sources': result['sources']}, status_code=200
    )
