"""Chatbot: the /api/chat endpoint and the RAG answer() logic. Agent and tools
are tested in test_agent.py.

Chroma and the LLM are replaced with fakes, so these tests need neither a
running Chroma nor an OpenRouter key.
"""
import pytest

from tests.conftest import body


class FakeCollection:
    def __init__(self, hits=(), raises=None):
        # hits: (id, text, distance) tuples, closest first
        self.hits = list(hits)
        self.raises = raises

    def query(self, query_texts, n_results, include):
        if self.raises:
            raise self.raises
        hits = self.hits[:n_results]
        return {
            'ids': [[h[0] for h in hits]],
            'documents': [[h[1] for h in hits]],
            'metadatas': [[{'source': 'knowledge'} for _ in hits]],
            'distances': [[h[2] for h in hits]],
        }


class FakeLLM:
    """Mimics client.chat.completions.create(...) of the openai SDK."""

    def __init__(self, reply='Contact the turf owner.', raises=None):
        self.reply = reply
        self.raises = raises
        self.calls = []
        self.chat = self
        self.completions = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.raises:
            raise self.raises
        message = type('Message', (), {'content': self.reply})
        choice = type('Choice', (), {'message': message})
        return type('Response', (), {'choices': [choice]})


@pytest.fixture
def fake_answer(monkeypatch):
    """Patch the run_agent() the endpoint calls; returns a setter for its behaviour."""
    import apis.chat as chat_module

    calls = []

    def use(result=None, raises=None):
        def fake(message, ctx):
            calls.append((message, ctx.user_id))
            if raises is not None:
                raise raises
            return result or {'answer': 'Contact the turf owner.', 'sources': ['faq.md#11'], 'tools': []}

        monkeypatch.setattr(chat_module, 'run_agent', fake)
        return calls

    return use


# --- /api/chat endpoint ---

def test_chat_requires_token(client):
    response = client.post('/api/chat', json={'message': 'hi'})
    assert response.status_code == 401


def test_chat_returns_answer_and_sources(client, auth_headers, user_id, fake_answer):
    calls = fake_answer()
    response = client.post('/api/chat', json={'message': '  How do I cancel?  '}, headers=auth_headers)
    assert response.status_code == 200, body(response)
    assert body(response) == {
        'status': True,
        'answer': 'Contact the turf owner.',
        'sources': ['faq.md#11'],
    }
    # The agent gets the user from the token, not from the request body.
    assert calls == [('How do I cancel?', user_id)]


@pytest.mark.parametrize('payload', [{}, {'message': ''}, {'message': '   '}, {'message': None}])
def test_chat_rejects_empty_message(client, auth_headers, fake_answer, payload):
    calls = fake_answer()
    response = client.post('/api/chat', json=payload, headers=auth_headers)
    assert response.status_code == 400
    assert body(response)['status'] is False
    assert calls == []


def test_chat_rejects_too_long_message(client, auth_headers, fake_answer):
    calls = fake_answer()
    response = client.post('/api/chat', json={'message': 'a' * 1001}, headers=auth_headers)
    assert response.status_code == 400
    assert calls == []


def test_chat_returns_503_when_assistant_unavailable(client, auth_headers, fake_answer):
    from rag.chat import AssistantUnavailable

    fake_answer(raises=AssistantUnavailable('LLM is unavailable'))
    response = client.post('/api/chat', json={'message': 'How do I cancel?'}, headers=auth_headers)
    assert response.status_code == 503
    assert body(response)['status'] is False
    assert 'try again' in body(response)['error']


def test_chat_returns_500_on_unexpected_error(client, auth_headers, fake_answer):
    fake_answer(raises=ValueError('boom'))
    response = client.post('/api/chat', json={'message': 'How do I cancel?'}, headers=auth_headers)
    assert response.status_code == 500
    assert 'boom' not in response.text


# --- rag.chat.answer() ---

def test_answer_skips_llm_when_nothing_relevant():
    from rag.chat import NO_CONTEXT_ANSWER, answer

    llm = FakeLLM()
    result = answer('Do you sell shoes?', collection=FakeCollection([('faq.md#1', 'x', 0.7)]), client=llm)
    assert result == {'answer': NO_CONTEXT_ANSWER, 'sources': []}
    assert llm.calls == []


def test_answer_sends_only_close_chunks_to_llm():
    from rag.chat import answer

    llm = FakeLLM(reply='  Contact the turf owner.  ')
    collection = FakeCollection([
        ('faq.md#11', 'Can I cancel? Contact the owner.', 0.28),
        ('payments.md#7', 'Refunds are handled by the owner.', 0.36),
        ('faq.md#1', 'Do I need an account?', 0.65),
    ])
    result = answer('How do I cancel?', collection=collection, client=llm)

    assert result == {'answer': 'Contact the turf owner.', 'sources': ['faq.md#11', 'payments.md#7']}
    prompt = llm.calls[0]['messages'][-1]['content']
    assert 'Contact the owner.' in prompt
    assert 'Do I need an account?' not in prompt
    assert prompt.endswith('Question: How do I cancel?')


def test_answer_raises_unavailable_when_chroma_fails():
    from rag.chat import AssistantUnavailable, answer

    with pytest.raises(AssistantUnavailable):
        answer('x', collection=FakeCollection(raises=ConnectionError('down')), client=FakeLLM())


def test_answer_raises_unavailable_when_llm_fails():
    from openai import APIConnectionError

    from rag.chat import AssistantUnavailable, answer

    llm = FakeLLM(raises=APIConnectionError(request=None))
    collection = FakeCollection([('faq.md#11', 'Contact the owner.', 0.2)])
    with pytest.raises(AssistantUnavailable):
        answer('How do I cancel?', collection=collection, client=llm)
