export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryCondition?: (error: Error) => boolean;
}

export interface RetryState {
  attempt: number;
  lastError: Error | null;
  isRetrying: boolean;
  nextRetryIn: number;
}

const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryCondition: (error: Error) => {
    // Retry on network errors, rate limits, and server errors
    return error.message.includes('network') ||
           error.message.includes('429') ||
           error.message.includes('rate limit') ||
           error.message.includes('500') ||
           error.message.includes('502') ||
           error.message.includes('503') ||
           error.message.includes('504');
  }
};

export class RetryManager {
  private retryStates = new Map<string, RetryState>();

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...defaultRetryConfig, ...config };
    let currentState = this.retryStates.get(operationId) || {
      attempt: 0,
      lastError: null,
      isRetrying: false,
      nextRetryIn: 0
    };

    for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
      currentState.attempt = attempt + 1;
      currentState.isRetrying = attempt > 0;
      this.retryStates.set(operationId, currentState);

      try {
        // Add delay for retries
        if (attempt > 0) {
          const delay = Math.min(
            finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
            finalConfig.maxDelay
          );
          
          currentState.nextRetryIn = delay;
          this.retryStates.set(operationId, currentState);
          
          console.log(`Retrying ${operationId} (attempt ${attempt + 1}/${finalConfig.maxAttempts}) in ${delay}ms`);
          await this.sleep(delay);
        }

        const result = await operation();
        
        // Success - clear retry state
        this.retryStates.delete(operationId);
        return result;

      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        currentState.lastError = errorObj;
        this.retryStates.set(operationId, currentState);

        console.warn(`Attempt ${attempt + 1}/${finalConfig.maxAttempts} failed for ${operationId}:`, errorObj.message);

        // Check if we should retry
        const shouldRetry = finalConfig.retryCondition?.(errorObj) ?? true;
        
        if (!shouldRetry || attempt === finalConfig.maxAttempts - 1) {
          // Final failure - clear retry state and throw
          this.retryStates.delete(operationId);
          throw errorObj;
        }
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error(`All retry attempts failed for ${operationId}`);
  }

  getRetryState(operationId: string): RetryState | null {
    return this.retryStates.get(operationId) || null;
  }

  isRetrying(operationId: string): boolean {
    return this.retryStates.get(operationId)?.isRetrying || false;
  }

  clearRetryState(operationId: string): void {
    this.retryStates.delete(operationId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create a singleton instance
export const retryManager = new RetryManager();

// Predefined retry configurations for different operations
export const RETRY_CONFIGS = {
  embedding: {
    maxAttempts: 3,
    baseDelay: 2000,
    maxDelay: 8000,
    backoffMultiplier: 2,
    retryCondition: (error: Error) => {
      return error.message.includes('429') || 
             error.message.includes('rate limit') ||
             error.message.includes('network') ||
             error.message.includes('fetch');
    }
  },
  chatCompletion: {
    maxAttempts: 2,
    baseDelay: 1500,
    maxDelay: 6000,
    backoffMultiplier: 2,
    retryCondition: (error: Error) => {
      return error.message.includes('429') || 
             error.message.includes('rate limit') ||
             error.message.includes('network');
    }
  },
  database: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    retryCondition: (error: Error) => {
      return error.message.includes('network') ||
             error.message.includes('timeout') ||
             error.message.includes('connection');
    }
  },
  email: {
    maxAttempts: 2,
    baseDelay: 3000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryCondition: (error: Error) => {
      return !error.message.includes('invalid email') &&
             !error.message.includes('not found');
    }
  }
} as const;

// Utility function for creating retry-wrapped functions
export function withRetry<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  operationId: string,
  config?: Partial<RetryConfig>
) {
  return async (...args: TArgs): Promise<TReturn> => {
    return retryManager.executeWithRetry(
      () => fn(...args),
      operationId,
      config
    );
  };
}
