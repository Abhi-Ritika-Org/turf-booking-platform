import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

type UserData = Record<string, unknown>

type UserDataState = UserData | null;

const initialState: UserDataState = null;


const userDataSlice = createSlice({
  name: 'userData',
  initialState,
  reducers: {
    setUserData(_state, action: PayloadAction<UserData | null>) {
      return action.payload;
    },
    clearUserData(_state) {
      return null;
    },
  },
})

export const { setUserData, clearUserData } = userDataSlice.actions
export default userDataSlice.reducer
