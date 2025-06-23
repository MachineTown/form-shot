import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import themeReducer from './slices/themeSlice';
import navigationReducer from './slices/navigationSlice';
import { firestoreApi } from './services/firestoreApi';

export const store = configureStore({
  reducer: {
    theme: themeReducer,
    navigation: navigationReducer,
    [firestoreApi.reducerPath]: firestoreApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore Firebase timestamp warnings
        ignoredActions: ['firestore/executeQuery/fulfilled'],
        ignoredPaths: ['firestore'],
      },
    }).concat(firestoreApi.middleware),
});

// Enable refetchOnFocus/refetchOnReconnect behaviors
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;