import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { addDays } from 'date-fns';
import api from '@/lib/api';
import turfDetailsReducer from '@/store/turfDetailsSlice';
import { getLocalDateString, getVenueToday } from '@/lib/turfBooking';
import TurfDetails from '@/pages/TurfDetails';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  tryRefreshSession: vi.fn(),
}));

const get = vi.mocked(api.get);

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', NoopObserver);
vi.stubGlobal('ResizeObserver', NoopObserver);

const turf = {
  id: 'turf_1',
  name: 'Test Turf',
  location: 'Pune',
  avg_rating: 4.5,
  total_reviews: 10,
  price_per_hour: 1000,
  sports: ['Football'],
  amenities: [],
  thumbnail: '',
  owner_contact: { name: 'Owner', phone: '123' },
};

const slotsResponse = () => ({
  data: {
    status: true,
    turf,
    available_slots: [
      { start_time: '18:00', end_time: '18:30', available: true },
      { start_time: '18:30', end_time: '19:00', available: true },
    ],
  },
});

const renderPage = () => {
  const store = configureStore({ reducer: { turfDetails: turfDetailsReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/turfs/turf_1']}>
        <Routes>
          <Route path="/turfs/:turfId" element={<TurfDetails />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
};

const requestedDates = () => get.mock.calls.map(([, config]) => (config as { params: { date: string } }).params.date);
const dateStrip = () => screen.getByRole('group', { name: 'Booking date' });

describe('TurfDetails date picker', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation(async () => slotsResponse());
  });

  it('offers today plus the next 6 days, with today selected and loaded first', async () => {
    renderPage();
    await waitFor(() => expect(dateStrip()).toBeInTheDocument());

    const chips = within(dateStrip()).getAllByRole('button');
    expect(chips).toHaveLength(7);
    expect(chips[0]).toHaveTextContent('Today');
    expect(chips[1]).toHaveTextContent('Tomorrow');
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    expect(requestedDates()).toEqual([getLocalDateString(getVenueToday())]);
  });

  it('loads the chosen day and clears the slot selection', async () => {
    renderPage();
    await waitFor(() => expect(dateStrip()).toBeInTheDocument());
    await screen.findAllByText('Available');

    fireEvent.click(screen.getAllByText('6:00 PM')[0]);
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.click(within(dateStrip()).getAllByRole('button')[1]);

    await waitFor(() => expect(requestedDates()).toContain(getLocalDateString(addDays(getVenueToday(), 1))));
    await waitFor(() => expect(screen.getByText('Tap a slot')).toBeInTheDocument());
    expect(within(dateStrip()).getAllByRole('button')[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows passed slots as Passed, not Booked', async () => {
    get.mockImplementation(async () => ({
      data: {
        ...slotsResponse().data,
        available_slots: [
          { start_time: '17:00', end_time: '17:30', available: false, past: true },
          { start_time: '18:00', end_time: '18:30', available: false, past: false },
          { start_time: '18:30', end_time: '19:00', available: true, past: false },
        ],
      },
    }));
    renderPage();
    const card = async (time: string) => (await screen.findAllByText(time))[0].closest('button') as HTMLElement;
    expect(within(await card('5:00 PM')).getByText('Passed')).toBeInTheDocument();
    expect(within(await card('6:00 PM')).getByText('Booked')).toBeInTheDocument();
  });

  it('rolls the window forward when the venue day changes while the page is open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    try {
      vi.setSystemTime(new Date('2026-11-07T18:00:00Z')); // 23:30 IST on 7 Nov
      renderPage();
      await waitFor(() => expect(dateStrip()).toBeInTheDocument());
      expect(requestedDates()).toEqual(['07-11-2026']);

      vi.setSystemTime(new Date('2026-11-07T19:00:00Z')); // 00:30 IST on 8 Nov
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      await waitFor(() => expect(requestedDates()).toContain('08-11-2026'));
      const chips = within(dateStrip()).getAllByRole('button');
      expect(chips[0]).toHaveTextContent('8 Nov');
      expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    } finally {
      vi.useRealTimers();
    }
  });
});
