import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { readSettingsRuntime, saveSettingsRuntime } from '@/lib/settingsRuntimeClient';

interface SettingsState {
    settings: Record<string, string>;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
}

const initialState: SettingsState = {
    settings: {},
    status: 'idle',
    error: null
};

export const fetchSettings = createAsyncThunk('settings/fetchSettings', async () => {
    return readSettingsRuntime();
});

export const saveSettings = createAsyncThunk('settings/saveSettings', async (settings: Record<string, string>) => {
    return saveSettingsRuntime(settings);
});

const settingsSlice = createSlice({
    name: 'settings',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchSettings.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchSettings.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.settings = action.payload;
            })
            .addCase(fetchSettings.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message || 'Failed to fetch settings';
            })
            .addCase(saveSettings.fulfilled, (state, action) => {
                state.settings = { ...state.settings, ...action.payload };
            });
    },
});

export default settingsSlice.reducer;
