"""Chatbot agent: the tools (real Mongo/mongomock, no LLM) and the agent loop
(scripted fake LLM). The key rule under test: tools only ever return the
logged-in user's data."""
import json
from datetime import datetime

import pytest
from openai import APIConnectionError

from rag.agent import FALLBACK_ANSWER, run_agent
from rag.chat import AssistantUnavailable
from rag.tools import OTHER_USER_MESSAGE, ToolContext, run_tool
from tests.conftest import TURF_ID

OTHER_USER = 'user_someone_else'
NOW = datetime(2026, 10, 31, 12, 0)  # naive local time, like stored slot times


@pytest.fixture(autouse=True)
def fixed_now(monkeypatch):
    import rag.agent as agent
    import rag.tools as tools

    monkeypatch.setattr(tools, 'venue_now', lambda: NOW)
    monkeypatch.setattr(agent, 'venue_now', lambda: NOW)


def add_booking(db, booking_id, user_id, start, end, status='confirmed', amount=1030):
    db['bookings'].insert_one({
        'booking_id': booking_id, 'turf_id': TURF_ID, 'user_id': user_id,
        'start_time': start, 'end_time': end, 'status': status, 'amount': amount,
        'razorpay_order_id': f'order_{booking_id}',
    })


@pytest.fixture
def ctx(mongo_db, turf):
    return ToolContext(user_id='user_me', db=mongo_db)


@pytest.fixture
def bookings(mongo_db, turf):
    add_booking(mongo_db, 'bk_old', 'user_me', datetime(2026, 10, 1, 18), datetime(2026, 10, 1, 19))
    add_booking(mongo_db, 'bk_mid', 'user_me', datetime(2026, 10, 15, 18), datetime(2026, 10, 15, 19),
                status='payment_pending')
    add_booking(mongo_db, 'bk_new', 'user_me', datetime(2026, 11, 2, 18), datetime(2026, 11, 2, 19))
    add_booking(mongo_db, 'bk_other', OTHER_USER, datetime(2026, 11, 3, 18), datetime(2026, 11, 3, 19))


def call(ctx, tool, **args):
    return run_tool(ctx, tool, json.dumps(args))


# --- user data stays the caller's ---

def test_list_my_bookings_returns_only_own_latest_first(ctx, bookings):
    result = call(ctx, 'list_my_bookings', limit=3)
    assert [b['booking_id'] for b in result['bookings']] == ['bk_new', 'bk_mid', 'bk_old']
    first = result['bookings'][0]
    assert first['turf_name'] == 'Test Turf'
    assert first['booking_date'] == '02-11-2026'
    assert first['booking_start_time'] == '18:00'
    assert 'razorpay_order_id' not in first
    assert 'user_id' not in first


def test_list_my_bookings_limit_and_status(ctx, bookings):
    assert [b['booking_id'] for b in call(ctx, 'list_my_bookings', limit=1)['bookings']] == ['bk_new']
    pending = call(ctx, 'list_my_bookings', status='payment_pending')
    assert [b['booking_id'] for b in pending['bookings']] == ['bk_mid']
    # Limit is clamped rather than trusted.
    assert len(call(ctx, 'list_my_bookings', limit=500)['bookings']) == 3
    # Models sometimes send null for optional arguments.
    assert len(call(ctx, 'list_my_bookings', limit=None, status=None)['bookings']) == 3


def test_list_my_bookings_upcoming_soonest_first(ctx, mongo_db, bookings):
    add_booking(mongo_db, 'bk_later', 'user_me', datetime(2026, 11, 20, 18), datetime(2026, 11, 20, 19))
    result = call(ctx, 'list_my_bookings', upcoming=True, limit=1)
    assert [b['booking_id'] for b in result['bookings']] == ['bk_new']  # 02-11, not the later 20-11


def test_list_my_bookings_when_none(mongo_db, turf, bookings):
    result = call(ToolContext(user_id='user_new', db=mongo_db), 'list_my_bookings')
    assert result['bookings'] == []


def test_get_booking_of_another_user_looks_like_not_found(ctx, bookings):
    other = call(ctx, 'get_booking', booking_id='bk_other')
    missing = call(ctx, 'get_booking', booking_id='bk_does_not_exist')
    assert other == missing == {'error': 'No booking with that id in your account.'}
    assert call(ctx, 'get_booking', booking_id='bk_new')['status'] == 'confirmed'


@pytest.mark.parametrize('identity', [{'user_id': OTHER_USER}, {'email': 'x@example.com'}, {'Phone': '+91999'}])
def test_tool_refuses_identity_arguments(ctx, bookings, identity):
    result = run_tool(ctx, 'list_my_bookings', json.dumps({'limit': 3, **identity}))
    assert result == {'error': OTHER_USER_MESSAGE}


def test_run_tool_rejects_bad_calls(ctx):
    assert 'Unknown tool' in run_tool(ctx, 'delete_everything', '{}')['error']
    assert 'valid JSON' in run_tool(ctx, 'list_turfs', '{not json')['error']
    assert 'JSON object' in run_tool(ctx, 'list_turfs', '[1]')['error']
    assert 'Invalid arguments' in run_tool(ctx, 'get_booking', '{"bogus": 1}')['error']
    assert "'booking_id' is required" in run_tool(ctx, 'get_booking', '{}')['error']
    assert "must be a integer" in call(ctx, 'list_my_bookings', limit='3')['error']
    assert "must be one of" in call(ctx, 'list_my_bookings', status='cancelled')['error']


@pytest.mark.parametrize('tool,args', [
    ('list_my_bookings', {'status': {'$ne': 'confirmed'}}),
    ('get_booking', {'booking_id': {'$ne': None}}),
    ('get_availability', {'turf_id': {'$ne': None}, 'date': '02-11-2026'}),
])
def test_run_tool_blocks_mongo_operators(ctx, bookings, tool, args):
    assert 'must be a string' in call(ctx, tool, **args)['error']


# --- turf tools ---

def test_list_turfs_filters(ctx):
    assert [t['turf_id'] for t in call(ctx, 'list_turfs')['turfs']] == [TURF_ID]
    assert call(ctx, 'list_turfs', name='test')['turfs'][0]['name'] == 'Test Turf'
    assert call(ctx, 'list_turfs', name='nope')['turfs'] == []


def test_get_availability_merges_free_ranges(ctx, mongo_db):
    add_booking(mongo_db, 'bk_a', OTHER_USER, datetime(2026, 11, 2, 18), datetime(2026, 11, 2, 19))
    add_booking(mongo_db, 'bk_p', OTHER_USER, datetime(2026, 11, 2, 20), datetime(2026, 11, 2, 21),
                status='payment_pending')  # pending does not block displayed availability
    result = call(ctx, 'get_availability', turf_id=TURF_ID, date='02-11-2026')
    assert result['free_time_ranges'] == ['00:00-18:00', '19:00-24:00']
    assert 'user_id' not in json.dumps(result)


def test_get_availability_whole_day_free(ctx):
    # Regression: used to read "00:00-00:00", which the model took as fully booked.
    result = call(ctx, 'get_availability', turf_id=TURF_ID, date='09-11-2026')
    assert result['free_time_ranges'] == ['00:00-24:00']


def test_get_availability_today_hides_past_slots(ctx):
    result = call(ctx, 'get_availability', turf_id=TURF_ID, date='31-10-2026')
    assert result['free_time_ranges'] == ['12:00-24:00']


def test_get_availability_errors(ctx):
    assert 'past' in call(ctx, 'get_availability', turf_id=TURF_ID, date='30-10-2026')['error']
    assert 'DD-MM-YYYY' in call(ctx, 'get_availability', turf_id=TURF_ID, date='2026-11-02')['error']
    assert 'not found' in call(ctx, 'get_availability', turf_id='turf_nope', date='02-11-2026')['error']


def test_quote_price_matches_booking_pricing(ctx):
    result = call(ctx, 'quote_price', turf_id=TURF_ID, date='02-11-2026', start_time='18:00', end_time='20:00')
    assert (result['turf_charges'], result['platform_fee'], result['total']) == (2000, 60, 2060)
    # 23:30-00:00 is the last slot of the day.
    late = call(ctx, 'quote_price', turf_id=TURF_ID, date='02-11-2026', start_time='23:30', end_time='00:00')
    assert (late['turf_charges'], late['platform_fee'], late['total']) == (500, 15, 515)


def test_quote_price_errors(ctx):
    assert 'after start' in call(ctx, 'quote_price', turf_id=TURF_ID, date='02-11-2026',
                                 start_time='20:00', end_time='18:00')['error']
    assert 'not found' in call(ctx, 'quote_price', turf_id='turf_nope', date='02-11-2026',
                               start_time='18:00', end_time='19:00')['error']


def test_search_knowledge_base(ctx, monkeypatch):
    import rag.tools as tools

    monkeypatch.setattr(tools, 'get_kb_collection', lambda: None)
    monkeypatch.setattr(tools, 'retrieve', lambda collection, query: [
        {'id': 'faq.md#12', 'text': 'Refunds are at the owner\'s discretion.', 'metadata': {}, 'distance': 0.3}])
    assert call(ctx, 'search_knowledge_base', query='refund') == {
        'results': [{'id': 'faq.md#12', 'text': 'Refunds are at the owner\'s discretion.'}]}

    def down(*_):
        raise ConnectionError('chroma down')

    monkeypatch.setattr(tools, 'get_kb_collection', down)
    assert 'unavailable' in call(ctx, 'search_knowledge_base', query='refund')['error']


# --- agent loop with a scripted LLM ---

class ScriptedLLM:
    """Fake openai client. Each step is either a str (final answer) or a list of
    (tool_name, args_dict) tool calls."""

    def __init__(self, steps, raises=None):
        self.steps = list(steps)
        self.raises = raises
        self.requests = []
        self.chat = self
        self.completions = self

    def create(self, **kwargs):
        self.requests.append(kwargs)
        if self.raises:
            raise self.raises
        step = self.steps.pop(0)
        if isinstance(step, str):
            message = type('Message', (), {'content': step, 'tool_calls': None})
        else:
            calls = [
                type('Call', (), {'id': f'call_{i}', 'function': type('Fn', (), {
                    'name': name, 'arguments': json.dumps(args)})})
                for i, (name, args) in enumerate(step)
            ]
            message = type('Message', (), {'content': None, 'tool_calls': calls})
        return type('Response', (), {'choices': [type('Choice', (), {'message': message})]})


def tool_results(llm):
    """The tool messages sent back to the LLM in its last request."""
    return [json.loads(m['content']) for m in llm.requests[-1]['messages'] if m['role'] == 'tool']


def test_agent_runs_tool_and_answers_for_the_logged_in_user(ctx, bookings):
    llm = ScriptedLLM([[('list_my_bookings', {'limit': 3})], 'Your last 3 bookings are ...'])
    result = run_agent('show me my last 3 bookings', ctx, client=llm)

    assert result == {'answer': 'Your last 3 bookings are ...', 'sources': [], 'tools': ['list_my_bookings']}
    sent = tool_results(llm)[0]
    assert [b['booking_id'] for b in sent['bookings']] == ['bk_new', 'bk_mid', 'bk_old']
    assert 'bk_other' not in json.dumps(llm.requests[-1]['messages'])


def test_agent_cannot_fetch_another_users_data(ctx, bookings):
    llm = ScriptedLLM([
        [('list_my_bookings', {'user_id': OTHER_USER})],
        [('get_booking', {'booking_id': 'bk_other'})],
        OTHER_USER_MESSAGE,
    ])
    result = run_agent(f'show bookings of {OTHER_USER}', ctx, client=llm)

    assert result['answer'] == OTHER_USER_MESSAGE
    assert tool_results(llm) == [{'error': OTHER_USER_MESSAGE},
                                 {'error': 'No booking with that id in your account.'}]


def test_agent_prompt_has_today_and_privacy_rule(ctx):
    llm = ScriptedLLM(['Hi!'])
    run_agent('hi', ctx, client=llm)
    system = llm.requests[0]['messages'][0]['content']
    assert 'Today is ' in system
    assert OTHER_USER_MESSAGE in system
    assert {t['function']['name'] for t in llm.requests[0]['tools']} >= {'list_my_bookings', 'get_availability'}


def test_agent_collects_knowledge_sources(ctx, monkeypatch):
    import rag.tools as tools

    monkeypatch.setattr(tools, 'get_kb_collection', lambda: None)
    monkeypatch.setattr(tools, 'retrieve', lambda collection, query: [
        {'id': 'faq.md#12', 'text': 'Refunds ...', 'metadata': {}, 'distance': 0.3}])
    llm = ScriptedLLM([[('search_knowledge_base', {'query': 'refund'})], 'Refunds are up to the owner.'])
    assert run_agent('refund?', ctx, client=llm)['sources'] == ['faq.md#12']


def test_agent_gives_up_after_max_steps(ctx):
    llm = ScriptedLLM([[('list_turfs', {})]] * 3)
    result = run_agent('loop forever', ctx, client=llm, max_steps=3)
    assert result['answer'] == FALLBACK_ANSWER
    assert result['tools'] == ['list_turfs'] * 3


def test_agent_raises_unavailable_when_llm_fails(ctx):
    with pytest.raises(AssistantUnavailable):
        run_agent('hi', ctx, client=ScriptedLLM([], raises=APIConnectionError(request=None)))


def test_agent_raises_unavailable_on_empty_choices(ctx):
    class NoChoices(ScriptedLLM):
        def create(self, **kwargs):
            return type('Response', (), {'choices': None})

    with pytest.raises(AssistantUnavailable):
        run_agent('hi', ctx, client=NoChoices([]))
