import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

type UserData = Record<string, unknown>

interface UserDataState {
  data: UserData | null
}

const initialState: UserDataState = {
  data: null,
}

const userDataSlice = createSlice({
  name: 'userData',
  initialState,
  reducers: {
    setUserData(state, action: PayloadAction<UserData | null>) {
      state.data = action.payload
    },
    clearUserData(state) {
      state.data = null
    },
  },
})

export const { setUserData, clearUserData } = userDataSlice.actions
export default userDataSlice.reducer
