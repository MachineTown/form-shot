import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface NavigationState {
  selectedCustomer: string | null;
  selectedStudy: string | null;
  selectedPackage: string | null;
  selectedForm: string | null;
  sidebarOpen: boolean;
  searchQuery: string;
  recentlyViewed: Array<{
    id: string;
    customerId: string;
    studyId: string;
    packageName: string;
    timestamp: number;
  }>;
}

const MAX_RECENTLY_VIEWED = 10;

const initialState: NavigationState = {
  selectedCustomer: null,
  selectedStudy: null,
  selectedPackage: null,
  selectedForm: null,
  sidebarOpen: true,
  searchQuery: '',
  recentlyViewed: JSON.parse(localStorage.getItem('recentlyViewed') || '[]'),
};

const navigationSlice = createSlice({
  name: 'navigation',
  initialState,
  reducers: {
    setSelectedCustomer: (state, action: PayloadAction<string | null>) => {
      state.selectedCustomer = action.payload;
      if (!action.payload) {
        state.selectedStudy = null;
        state.selectedPackage = null;
        state.selectedForm = null;
      }
    },
    setSelectedStudy: (state, action: PayloadAction<string | null>) => {
      state.selectedStudy = action.payload;
      if (!action.payload) {
        state.selectedPackage = null;
        state.selectedForm = null;
      }
    },
    setSelectedPackage: (state, action: PayloadAction<string | null>) => {
      state.selectedPackage = action.payload;
      if (!action.payload) {
        state.selectedForm = null;
      }
    },
    setSelectedForm: (state, action: PayloadAction<string | null>) => {
      state.selectedForm = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    addToRecentlyViewed: (state, action: PayloadAction<{
      id: string;
      customerId: string;
      studyId: string;
      packageName: string;
    }>) => {
      const newItem = {
        ...action.payload,
        timestamp: Date.now(),
      };
      
      // Remove if already exists
      state.recentlyViewed = state.recentlyViewed.filter(
        item => item.id !== newItem.id
      );
      
      // Add to beginning
      state.recentlyViewed.unshift(newItem);
      
      // Keep only MAX_RECENTLY_VIEWED items
      state.recentlyViewed = state.recentlyViewed.slice(0, MAX_RECENTLY_VIEWED);
      
      // Save to localStorage
      localStorage.setItem('recentlyViewed', JSON.stringify(state.recentlyViewed));
    },
    clearRecentlyViewed: (state) => {
      state.recentlyViewed = [];
      localStorage.removeItem('recentlyViewed');
    },
  },
});

export const {
  setSelectedCustomer,
  setSelectedStudy,
  setSelectedPackage,
  setSelectedForm,
  toggleSidebar,
  setSidebarOpen,
  setSearchQuery,
  addToRecentlyViewed,
  clearRecentlyViewed,
} = navigationSlice.actions;

export default navigationSlice.reducer;