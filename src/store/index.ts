import { configureStore } from '@reduxjs/toolkit'
import authReducer from './authSlice'
import userDataReducer from './userDataSlice'
import turfDetailsReducer from './turfDetailsSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    userData: userDataReducer,
    turfDetails: turfDetailsReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
