import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '@/lib/api'

export const loginUser = createAsyncThunk(
  'auth/user-login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post('/api/auth/login', { email, password })
      return res.data
    } catch (err: any) { 
      // If server responded with an error payload, surface that
      if (err && err.response) {
        return rejectWithValue(err.response.data?.detail || err.response.data || err.message || 'Login failed')
      }

      // No response received (network error / timeout) -> show generic message
      if (err && err.request) {
        return rejectWithValue('Something went wrong')
      }

      return rejectWithValue(err?.message || 'Login failed')
    }
  }
)

// New signup thunk (matches frontend payload: email, mobile, password, full_name)
export const signupUser = createAsyncThunk(
  'auth/user-signup',
  async (
    { email, mobile, password, full_name }: { email: string; mobile: string; password: string; full_name?: string },
    { rejectWithValue }
  ) => {
    try {
      const res = await api.post('/api/auth/user-signup', { email, mobile, password, full_name })
      return res.data
    } catch (err: any) {
      if (err && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.message === 'canceled')) {
        return rejectWithValue({ canceled: true })
      }

      if (err && err.response) {
        // If API sent structured error object, return it so UI can display details
        return rejectWithValue(err.response.data || err.response.data?.detail || err.message || 'Signup failed')
      }

      if (err && err.request) {
        return rejectWithValue('Something went wrong')
      }

      return rejectWithValue(err?.message || 'Signup failed')
    }
  }
)

const initialState = {
  token: null as string | null,
  status: 'idle',
  error: null as unknown,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setToken(state, action) {
      state.token = action.payload
    },
    clearToken(state) {
      state.token = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        const token = action.payload?.access_token
        state.status = 'succeeded'
        state.token = token
      })
      .addCase(loginUser.rejected, (state, action) => {
        // Ignore canceled requests (no UI error)
        if (action.payload && (action.payload as any).canceled) {
          state.status = 'idle'
          state.error = null
          return
        }
        state.status = 'failed'
        state.error = action.payload || action.error.message
      })
      // Signup cases
      .addCase(signupUser.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(signupUser.fulfilled, (state, action) => {
        // If backend returns a token on signup, persist it similarly to login
        const token = action.payload?.access_token
        state.status = 'succeeded'
        if (token) {
          state.token = token
        }
      })
      .addCase(signupUser.rejected, (state, action) => {
        // Ignore canceled requests (no UI error)
        if (action.payload && (action.payload as any).canceled) {
          state.status = 'idle'
          state.error = null
          return
        }
        state.status = 'failed'
        state.error = action.payload || action.error.message
      })
  }
})

export const { setToken, clearToken } = authSlice.actions
export default authSlice.reducer
