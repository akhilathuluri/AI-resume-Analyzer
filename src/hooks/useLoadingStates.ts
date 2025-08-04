import { useState, useCallback } from 'react';

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  lastSuccess: Date | null;
  retryCount: number;
}

export interface LoadingStates {
  chatHistory: LoadingState;
  messageSubmit: LoadingState;
  resumeMatching: LoadingState;
  emailSending: LoadingState;
  embedding: LoadingState;
  chatCompletion: LoadingState;
}

const initialLoadingState: LoadingState = {
  isLoading: false,
  error: null,
  lastSuccess: null,
  retryCount: 0
};

const initialLoadingStates: LoadingStates = {
  chatHistory: { ...initialLoadingState },
  messageSubmit: { ...initialLoadingState },
  resumeMatching: { ...initialLoadingState },
  emailSending: { ...initialLoadingState },
  embedding: { ...initialLoadingState },
  chatCompletion: { ...initialLoadingState }
};

export const useLoadingStates = () => {
  const [loadingStates, setLoadingStates] = useState<LoadingStates>(initialLoadingStates);

  const updateLoadingState = useCallback((
    key: keyof LoadingStates, 
    updates: Partial<LoadingState>
  ) => {
    setLoadingStates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...updates
      }
    }));
  }, []);

  const startLoading = useCallback((key: keyof LoadingStates) => {
    updateLoadingState(key, {
      isLoading: true,
      error: null
    });
  }, [updateLoadingState]);

  const finishLoading = useCallback((key: keyof LoadingStates, success: boolean = true, error?: string) => {
    updateLoadingState(key, {
      isLoading: false,
      error: error || null,
      lastSuccess: success ? new Date() : undefined,
      retryCount: success ? 0 : undefined
    });
  }, [updateLoadingState]);

  const incrementRetry = useCallback((key: keyof LoadingStates) => {
    setLoadingStates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        retryCount: prev[key].retryCount + 1
      }
    }));
  }, []);

  const resetLoadingState = useCallback((key: keyof LoadingStates) => {
    updateLoadingState(key, initialLoadingState);
  }, [updateLoadingState]);

  const isAnyLoading = Object.values(loadingStates).some(state => state.isLoading);

  return {
    loadingStates,
    startLoading,
    finishLoading,
    incrementRetry,
    resetLoadingState,
    isAnyLoading
  };
};

// Enhanced loading indicators with progress
export const useProgressiveLoading = (estimatedDuration: number = 5000) => {
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const startProgressiveLoading = useCallback(() => {
    setIsLoading(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90; // Don't reach 100% until actually complete
        }
        return prev + (100 / (estimatedDuration / 200)); // Update every 200ms
      });
    }, 200);

    return () => {
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        setIsLoading(false);
        setProgress(0);
      }, 300);
    };
  }, [estimatedDuration]);

  return {
    progress,
    isLoading,
    startProgressiveLoading
  };
};
