import { describe, it, expect } from 'vitest';
import { getLocalDateString, getVenueToday } from '@/lib/turfBooking';

describe('getVenueToday', () => {
  it('uses the venue (IST) calendar day, not the viewer clock', () => {
    // 20:00 UTC on 7 Nov is 01:30 IST on 8 Nov.
    expect(getLocalDateString(getVenueToday(new Date('2026-11-07T20:00:00Z')))).toBe('08-11-2026');
    // 18:00 UTC on 7 Nov is 23:30 IST, still 7 Nov.
    expect(getLocalDateString(getVenueToday(new Date('2026-11-07T18:00:00Z')))).toBe('07-11-2026');
  });
});
