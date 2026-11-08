import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Bot, Loader2, MessageCircle, RotateCw, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useAppSelector } from '@/hooks/useAppSelector';
import { CHAT_MESSAGE_MAX_LENGTH, ChatError, CHAT_GENERIC_MESSAGE, sendChatMessage } from '@/lib/chat';
import { cn } from '@/lib/utils';

type ChatMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; text: string; sources: string[] }
  | { id: number; role: 'error'; text: string; retryText: string | null; userMessageId: number };

const SUGGESTED_QUESTIONS = [
  'How do I cancel my booking?',
  'What is the platform fee?',
  'Can I get a refund?',
  'How do I pay for a booking?',
];

/** Floating assistant chat. Rendered only while the user is logged in. */
export const ChatWidget = () => {
  const token = useAppSelector((state) => state.auth.token);
  // Unmounting the panel on logout also drops the in-memory conversation.
  if (!token) return null;
  return <ChatWidgetPanel />;
};

// Touch keyboards can't type Shift+Enter, so there Enter inserts a newline and the button sends.
const isCoarsePointer = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

const CHAR_COUNTER_THRESHOLD = CHAT_MESSAGE_MAX_LENGTH - 100;

// The assistant answers in plain text with occasional **bold** markdown. Rendered as React
// nodes (never dangerouslySetInnerHTML) so no HTML from the model is ever interpreted.
const renderWithBold = (text: string): ReactNode =>
  text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );

const ChatWidgetPanel = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const nextId = useRef(0);
  const pendingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, pending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const ask = async (question: string, retry?: { errorId: number; userMessageId: number }) => {
    const text = question.trim();
    if (!text || pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    const userMessageId = nextId.current++;
    setMessages((prev) => {
      // A retry removes the failed exchange and re-asks at the bottom, so the answer always
      // lands directly under its question even if other messages were sent in between.
      const base = retry ? prev.filter((m) => m.id !== retry.errorId && m.id !== retry.userMessageId) : prev;
      return [...base, { id: userMessageId, role: 'user', text }];
    });

    try {
      const res = await sendChatMessage(text);
      setMessages((prev) => [
        ...prev,
        { id: nextId.current++, role: 'assistant', text: res.answer, sources: res.sources },
      ]);
    } catch (err) {
      const chatErr = err instanceof ChatError ? err : null;
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: 'error',
          text: chatErr?.message ?? CHAT_GENERIC_MESSAGE,
          // A rejected (400) message won't succeed on retry; everything else may.
          retryText: chatErr?.kind === 'invalid' ? null : text,
          userMessageId,
        },
      ]);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const canSend = input.trim().length > 0 && !pending;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    const text = input;
    setInput('');
    void ask(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isCoarsePointer()) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      {open && (
        <Card
          role="dialog"
          aria-label="TurfBook assistant"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden shadow-xl',
            'inset-0 rounded-none border-0',
            'sm:inset-auto sm:bottom-40 sm:right-4 sm:h-[min(560px,calc(100vh-12rem))] sm:w-[380px] sm:rounded-lg sm:border',
            'md:bottom-24 md:right-6 md:h-[min(560px,calc(100vh-8rem))]',
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="turf-gradient rounded-lg p-1.5">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">TurfBook Assistant</p>
                <p className="mt-1 text-xs text-muted-foreground">Bookings, payments, cancellations, turfs</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" aria-label="Close chat" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-3 p-4" aria-live="polite">
              {messages.length === 0 && (
                <div className="flex flex-col gap-3 py-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Hi! Ask me anything about booking turfs on TurfBook.
                  </p>
                  <div className="flex flex-col gap-2">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <Button
                        key={q}
                        variant="outline"
                        size="sm"
                        className="h-auto whitespace-normal py-2 text-left"
                        disabled={pending}
                        onClick={() => void ask(q)}
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => {
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                        {m.text}
                      </div>
                    </div>
                  );
                }
                if (m.role === 'assistant') {
                  return (
                    <div key={m.id} className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground">
                        <p className="whitespace-pre-wrap break-words">{renderWithBold(m.text)}</p>
                        {m.sources.length > 0 && (
                          <details className="mt-1.5 text-xs text-muted-foreground">
                            <summary className="cursor-pointer select-none">Sources</summary>
                            <p className="mt-1 break-all">{m.sources.join(', ')}</p>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} role="alert" className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      {m.retryText !== null && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7"
                          disabled={pending}
                          onClick={() => void ask(m.retryText as string, { errorId: m.id, userMessageId: m.userMessageId })}
                        >
                          <RotateCw className="mr-1 h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {pending && (
                <div className="flex justify-start" data-testid="chat-typing">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {input.length >= CHAR_COUNTER_THRESHOLD && (
            <p className="border-t px-3 pt-2 text-right text-xs text-muted-foreground" aria-live="polite">
              {input.length}/{CHAT_MESSAGE_MAX_LENGTH} characters
            </p>
          )}
          <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question..."
              aria-label="Chat message"
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              rows={1}
              // text-base below sm prevents iOS Safari from zooming into the focused input.
              className="max-h-32 min-h-[40px] resize-none text-base sm:text-sm"
            />
            <Button type="submit" size="icon" aria-label="Send message" disabled={!canSend}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </Card>
      )}

      <Button
        size="icon"
        aria-label={open ? 'Minimize chat' : 'Open chat'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          // Below md, sit above the TurfDetails mobile booking bar (fixed bottom-0).
          'fixed bottom-24 right-4 z-50 h-14 w-14 rounded-full shadow-lg md:bottom-6 md:right-6',
          // On phones the panel is full-screen and has its own close button.
          open && 'hidden sm:inline-flex',
        )}
      >
        {open ? <X className="!h-7 !w-7" /> : <Bot className="!h-8 !w-8" />}
      </Button>
    </>
  );
};

export default ChatWidget;
