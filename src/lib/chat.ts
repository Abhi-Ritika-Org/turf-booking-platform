import { isAxiosError } from 'axios';
import api from '@/lib/api';

/** Max length the backend accepts for a chat message. */
export const CHAT_MESSAGE_MAX_LENGTH = 1000;

/** Answers come from a free LLM and can take a while. */
const CHAT_TIMEOUT_MS = 60_000;

export type ChatResponse = {
  answer: string;
  sources: string[];
};

export type ChatErrorResponse = {
  status: false;
  error: string;
};

/**
 * - `busy`: 503, assistant temporarily unavailable (LLM rate-limited, vector DB down).
 * - `invalid`: 400, message rejected (empty / too long).
 * - `generic`: anything else, including network failures and timeouts.
 */
export type ChatErrorKind = 'busy' | 'invalid' | 'generic';

export class ChatError extends Error {
  kind: ChatErrorKind;

  constructor(kind: ChatErrorKind, message: string) {
    super(message);
    this.name = 'ChatError';
    this.kind = kind;
  }
}

export const CHAT_BUSY_MESSAGE = 'The assistant is busy right now. Please try again in a moment.';
export const CHAT_GENERIC_MESSAGE = 'Something went wrong while contacting the assistant. Please try again.';

/**
 * POST /api/chat. The backend is stateless, so only the current question is sent.
 * Decisions are based on the HTTP status code and the `answer` / `error` fields, not the
 * boolean `status` field. Throws a ChatError on failure.
 */
export async function sendChatMessage(message: string): Promise<ChatResponse> {
  try {
    const res = await api.post('/api/chat', { message }, { timeout: CHAT_TIMEOUT_MS });
    const data = res?.data ?? {};
    if (typeof data.answer !== 'string') {
      throw new ChatError('generic', CHAT_GENERIC_MESSAGE);
    }
    return {
      answer: data.answer,
      sources: Array.isArray(data.sources) ? data.sources.filter((s: unknown) => typeof s === 'string') : [],
    };
  } catch (err: unknown) {
    if (err instanceof ChatError) throw err;

    const response = isAxiosError<Partial<ChatErrorResponse>>(err) ? err.response : undefined;
    const httpStatus = response?.status;
    const serverError = response?.data?.error;

    if (httpStatus === 503) {
      throw new ChatError('busy', CHAT_BUSY_MESSAGE);
    }
    if (httpStatus === 400) {
      throw new ChatError(
        'invalid',
        typeof serverError === 'string' && serverError ? serverError : 'That message could not be sent.',
      );
    }
    throw new ChatError('generic', CHAT_GENERIC_MESSAGE);
  }
}
