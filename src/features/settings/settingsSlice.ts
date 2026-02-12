import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

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
    const response = await fetch('/api/settings');
    if (!response.ok) {
        throw new Error('Failed to fetch settings');
    }
    return response.json();
});

export const saveSettings = createAsyncThunk('settings/saveSettings', async (settings: Record<string, string>) => {
    const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
    });
    if (!response.ok) {
        throw new Error('Failed to save settings');
    }
    return settings;
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
