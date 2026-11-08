import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import api from '@/lib/api';
import authReducer, { clearToken, setToken } from '@/store/authSlice';
import { ChatWidget } from '@/components/ChatWidget';
import { CHAT_BUSY_MESSAGE } from '@/lib/chat';

vi.mock('@/lib/api', () => ({
  default: { post: vi.fn() },
  tryRefreshSession: vi.fn(),
}));

const post = vi.mocked(api.post);

const makeStore = (token: string | null) => {
  const store = configureStore({ reducer: { auth: authReducer } });
  if (token) store.dispatch(setToken(token));
  return store;
};

const renderWidget = (token: string | null = 'access-token') => {
  const store = makeStore(token);
  render(
    <Provider store={store}>
      <ChatWidget />
    </Provider>,
  );
  return store;
};

const openChat = () => fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
const input = () => screen.getByLabelText('Chat message') as HTMLTextAreaElement;
const sendButton = () => screen.getByRole('button', { name: 'Send message' });

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const httpError = (status: number, error = 'nope') => ({ isAxiosError: true, response: { status, data: { status: false, error } } });

describe('ChatWidget', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('is hidden when logged out and disappears on logout', () => {
    const { unmount } = render(
      <Provider store={makeStore(null)}>
        <ChatWidget />
      </Provider>,
    );
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument();
    unmount();

    const store = renderWidget();
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument();
    act(() => {
      store.dispatch(clearToken());
    });
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument();
  });

  it('shows the user message and then the assistant answer', async () => {
    post.mockResolvedValueOnce({
      data: { status: true, answer: 'Line one\nLine two', sources: ['faq.md#11'] },
    });
    renderWidget();
    openChat();

    fireEvent.change(input(), { target: { value: '  What is the platform fee?  ' } });
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(screen.getByText('What is the platform fee?')).toBeInTheDocument();
    expect(input().value).toBe('');
    expect(post).toHaveBeenCalledWith(
      '/api/chat',
      { message: 'What is the platform fee?' },
      expect.objectContaining({ timeout: expect.any(Number) }),
    );

    expect(await screen.findByText(/Line one/)).toBeInTheDocument();
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByText('faq.md#11')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-typing')).not.toBeInTheDocument();
  });

  it('sends a suggested question on click', async () => {
    post.mockResolvedValueOnce({ data: { status: true, answer: 'Contact the turf owner.', sources: [] } });
    renderWidget();
    openChat();

    fireEvent.click(screen.getByRole('button', { name: 'How do I cancel my booking?' }));

    expect(post).toHaveBeenCalledWith('/api/chat', { message: 'How do I cancel my booking?' }, expect.anything());
    expect(await screen.findByText('Contact the turf owner.')).toBeInTheDocument();
    expect(screen.queryByText('Sources')).not.toBeInTheDocument();
  });

  it('does not send on Shift+Enter', () => {
    renderWidget();
    openChat();
    fireEvent.change(input(), { target: { value: 'hello' } });
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true });
    expect(post).not.toHaveBeenCalled();
  });

  it('disables send for empty input and while a request is pending', async () => {
    const pending = deferred<{ data: unknown }>();
    post.mockReturnValueOnce(pending.promise as never);
    renderWidget();
    openChat();

    expect(sendButton()).toBeDisabled();
    fireEvent.change(input(), { target: { value: '   ' } });
    expect(sendButton()).toBeDisabled();

    fireEvent.change(input(), { target: { value: 'first' } });
    expect(sendButton()).toBeEnabled();
    fireEvent.click(sendButton());

    expect(screen.getByTestId('chat-typing')).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: 'second' } });
    expect(sendButton()).toBeDisabled();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(post).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ data: { status: true, answer: 'done', sources: [] } });
    });
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('shows the busy message on 503 and retry resends the same question', async () => {
    post.mockRejectedValueOnce(httpError(503, 'rate limited'));
    post.mockResolvedValueOnce({ data: { status: true, answer: 'Refunds are at owner discretion.', sources: [] } });
    renderWidget();
    openChat();

    fireEvent.change(input(), { target: { value: 'Can I get a refund?' } });
    fireEvent.click(sendButton());

    expect(await screen.findByText(CHAT_BUSY_MESSAGE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Refunds are at owner discretion.')).toBeInTheDocument();
    expect(screen.queryByText(CHAT_BUSY_MESSAGE)).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith('/api/chat', { message: 'Can I get a refund?' }, expect.anything());
    // The user bubble is not duplicated by the retry.
    expect(screen.getAllByText('Can I get a refund?')).toHaveLength(1);
  });

  it('shows the server message on 400 without a retry, and a generic message on network errors', async () => {
    post.mockRejectedValueOnce(httpError(400, 'Message is too long'));
    post.mockRejectedValueOnce({ isAxiosError: true, request: {} });
    renderWidget();
    openChat();

    fireEvent.change(input(), { target: { value: 'x' } });
    fireEvent.click(sendButton());
    expect(await screen.findByText('Message is too long')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();

    fireEvent.change(input(), { target: { value: 'y' } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getByText(/Something went wrong/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
  it('retrying an older failed message places the answer directly under its question', async () => {
    post.mockRejectedValueOnce(httpError(503));
    post.mockResolvedValueOnce({ data: { status: true, answer: 'A2', sources: [] } });
    post.mockResolvedValueOnce({ data: { status: true, answer: 'A1', sources: [] } });
    renderWidget();
    openChat();

    fireEvent.change(input(), { target: { value: 'Q1' } });
    fireEvent.click(sendButton());
    await screen.findByText(CHAT_BUSY_MESSAGE);

    fireEvent.change(input(), { target: { value: 'Q2' } });
    fireEvent.click(sendButton());
    await screen.findByText('A2');

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await screen.findByText('A1');

    const order = ['Q1', 'Q2', 'A1', 'A2'].map((t) => screen.getByText(t));
    const position = (el: HTMLElement) => order.filter((o) => o.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).length;
    // Expected display order: Q2, A2, Q1, A1.
    const [q1, q2, a1, a2] = order.map(position);
    expect([q2, a2, q1, a1]).toEqual([0, 1, 2, 3]);
    expect(screen.getAllByText('Q1')).toHaveLength(1);
  });

  it('closes the panel on Escape', () => {
    renderWidget();
    openChat();
    expect(screen.getByRole('dialog', { name: 'TurfBook assistant' })).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
