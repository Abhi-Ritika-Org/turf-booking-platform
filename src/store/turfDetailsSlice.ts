import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '@/lib/api'
import type { BookingSlot, TurfDetailsResponse } from '@/lib/turfBooking'

type TurfDetailsState = {
  data: TurfDetailsResponse | null
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
  error: string | null
  requestedDate: string | null
}

const emptyState: TurfDetailsState = {
  data: null,
  status: 'idle',
  error: null,
  requestedDate: null,
}

const normalizeSlots = (slots: BookingSlot[] = []) => {
  return slots
    .filter((slot) => typeof slot?.start_time === 'string' && typeof slot?.end_time === 'string')
    .map((slot) => ({
      start_time: slot.start_time,
      end_time: slot.end_time,
      available: Boolean(slot.available),
    }))
}

const normalizeResponse = (response: any): TurfDetailsResponse => {
  const turf = response?.turf ?? {}
  const thumbnailUrl = turf.thumbnail_url ?? turf.thumbnail ?? ''
  const ownerContact = turf.owner_contact ?? turf.owner ?? {}

  return {
    status: Boolean(response?.status),
    available_slots: normalizeSlots(response?.available_slots ?? []),
    turf: {
      id: turf.id ?? '',
      name: turf.name ?? 'Unnamed Turf',
      location: turf.location ?? 'Location unavailable',
      avg_rating: typeof turf.avg_rating === 'number' ? turf.avg_rating : 0,
      total_reviews: typeof turf.total_reviews === 'number' ? turf.total_reviews : 0,
      price_per_hour: typeof turf.price_per_hour === 'number' ? turf.price_per_hour : 0,
      sports: Array.isArray(turf.sports) ? turf.sports : [],
      amenities: Array.isArray(turf.amenities) ? turf.amenities : [],
      images: Array.isArray(turf.images) ? turf.images : thumbnailUrl ? [thumbnailUrl] : [],
      thumbnail: thumbnailUrl,
      owner_contact: {
        name: ownerContact.name ?? 'Not provided',
        phone: ownerContact.phone ?? 'Not provided',
      },
    },
  }
}

export const fetchTurfDetails = createAsyncThunk(
  'turfDetails/fetchTurfDetails',
  async (
    { turfId, date }: { turfId: string; date: string },
    { rejectWithValue },
  ) => {
    try {
      const response = await api.get(`/api/turfs/turf-details/${turfId}`, {
        params: {
          date,
        },
      })

      return {
        data: normalizeResponse(response.data),
        requestedDate: date,
      }
    } catch (err: any) {
      if (err?.response?.data?.message) {
        return rejectWithValue(err.response.data.message)
      }

      return rejectWithValue(err?.message || 'Failed to load turf details')
    }
  },
)

const turfDetailsSlice = createSlice({
  name: 'turfDetails',
  initialState: emptyState,
  reducers: {
    clearTurfDetails() {
      return emptyState
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTurfDetails.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchTurfDetails.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.data = action.payload.data
        state.requestedDate = action.payload.requestedDate
      })
      .addCase(fetchTurfDetails.rejected, (state, action) => {
        state.status = 'failed'
        state.error = (action.payload as string) || action.error.message || 'Failed to load turf details'
      })
  },
})

export const { clearTurfDetails } = turfDetailsSlice.actions
export default turfDetailsSlice.reducer
