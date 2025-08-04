/**
 * AI Service - Backend API interface for AI operations
 * Removes direct API token exposure from frontend
 */

export interface EmbeddingRequest {
  text: string;
  model?: string;
}

export interface ChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface EmbeddingResponse {
  embedding: number[];
  error?: string;
}

export interface ChatResponse {
  content: string;
  error?: string;
}

export interface ResumeMatch {
  id: string;
  filename: string;
  similarity: number;
  file_path: string;
  content?: string;
}

export interface ResumeMatchRequest {
  jobDescription: string;
  userId: string;
}

export interface ResumeMatchResponse {
  matches: ResumeMatch[];
  error?: string;
}

class AIService {
  private baseUrl: string;

  constructor() {
    // In production, this would point to your backend API
    this.baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
  }

  /**
   * Generate embeddings via backend API
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.text.substring(0, 7500), // Ensure within limits
          model: request.model || 'text-embedding-3-large'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { embedding: data.embedding };
    } catch (error) {
      console.error('Error generating embedding:', error);
      return { 
        embedding: [], 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Generate chat completion via backend API
   */
  async generateChatCompletion(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: request.messages,
          model: request.model || 'gpt-4o-mini',
          max_tokens: request.maxTokens || 1500,
          temperature: request.temperature || 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { content: data.content };
    } catch (error) {
      console.error('Error generating chat completion:', error);
      return { 
        content: '', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Find similar resumes via backend API with caching
   */
  async findSimilarResumes(request: ResumeMatchRequest): Promise<ResumeMatchResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/resumes/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { matches: data.matches };
    } catch (error) {
      console.error('Error finding similar resumes:', error);
      return { 
        matches: [], 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

// Fallback implementation for development (when backend is not available)
class FallbackAIService extends AIService {
  private retryCount = new Map<string, number>();
  private lastRequestTime = 0;
  private rateLimitResetTime = 0;
  private readonly maxRetries = 3;
  private readonly baseDelay = 2000; // 2 seconds between requests
  private serviceHealthy = true;
  private lastHealthCheck = 0;
  private readonly healthCheckInterval = 5 * 60 * 1000; // 5 minutes

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if GitHub token is configured
   */
  private isTokenConfigured(): boolean {
    const token = import.meta.env.VITE_GITHUB_TOKEN;
    return !!(token && token.startsWith('github_pat_') && token.length > 20);
  }

  /**
   * Perform a health check on the AI service
   */
  private async performHealthCheck(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.serviceHealthy) {
      return this.serviceHealthy;
    }

    if (!this.isTokenConfigured()) {
      console.warn('GitHub token not properly configured');
      this.serviceHealthy = false;
      this.lastHealthCheck = now;
      return false;
    }

    try {
      const response = await fetch('https://models.inference.ai.azure.com/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      this.serviceHealthy = response.ok;
      console.log(`AI service health check: ${this.serviceHealthy ? 'healthy' : 'unhealthy'} (${response.status})`);
    } catch (error) {
      console.warn('AI service health check failed:', error);
      this.serviceHealthy = false;
    }

    this.lastHealthCheck = now;
    return this.serviceHealthy;
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    
    // If we're currently rate limited, wait
    if (this.rateLimitResetTime > now) {
      const waitTime = this.rateLimitResetTime - now;
      console.log(`Rate limited. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await this.sleep(waitTime);
    }

    // Implement basic rate limiting (1 request per 2 seconds)
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.baseDelay) {
      const waitTime = this.baseDelay - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms before next request`);
      await this.sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<Response>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Wait for rate limit before each attempt
        await this.waitForRateLimit();

        const response = await operation();

        if (response.ok) {
          // Reset retry count on success
          this.retryCount.delete(operationName);
          const data = await response.json();
          return data;
        }

        // Handle specific HTTP errors
        if (response.status === 429) {
          // Rate limited
          const retryAfter = response.headers.get('retry-after');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt + 1) * 2000;
          
          this.rateLimitResetTime = Date.now() + waitTime;
          console.log(`Rate limited (429). Attempt ${attempt + 1}/${this.maxRetries + 1}. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
          
          if (attempt < this.maxRetries) {
            await this.sleep(waitTime);
            continue;
          }
        } else if (response.status >= 500) {
          // Server error - retry with exponential backoff
          const waitTime = Math.pow(2, attempt + 1) * 1000;
          console.log(`Server error (${response.status}). Attempt ${attempt + 1}/${this.maxRetries + 1}. Waiting ${waitTime}ms...`);
          
          if (attempt < this.maxRetries) {
            await this.sleep(waitTime);
            continue;
          }
        }

        // Non-retryable error
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.log(`${operationName} error. Attempt ${attempt + 1}/${this.maxRetries + 1}:`, lastError.message);
        
        if (attempt < this.maxRetries) {
          const waitTime = Math.pow(2, attempt + 1) * 1000;
          await this.sleep(waitTime);
          continue;
        }
      }
    }

    throw lastError || new Error(`Failed after ${this.maxRetries + 1} attempts`);
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    console.log('Attempting to generate embeddings using GitHub Models API');
    
    // Perform health check first
    const isHealthy = await this.performHealthCheck();
    if (!isHealthy) {
      console.warn('AI service is not healthy, returning error');
      return { 
        embedding: [], 
        error: 'AI embedding service is currently unavailable. Please check your GitHub token configuration.' 
      };
    }
    
    try {
      // GitHub Models API endpoint for embeddings
      const operation = () => fetch('https://models.inference.ai.azure.com/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-large',
          input: request.text.substring(0, 8000), // GitHub Models limit
          encoding_format: 'float'
        }),
      });

      const data = await this.retryWithBackoff<any>(operation, 'generateEmbedding');
      
      if (data?.data?.[0]?.embedding && Array.isArray(data.data[0].embedding)) {
        console.log(`✅ Successfully generated embedding with ${data.data[0].embedding.length} dimensions`);
        this.serviceHealthy = true; // Mark service as healthy on success
        return { embedding: data.data[0].embedding };
      } else {
        console.error('Invalid embedding response format:', data);
        throw new Error('Invalid embedding response format');
      }
    } catch (error) {
      console.error('❌ Error generating embedding after retries:', error);
      
      // Mark service as potentially unhealthy
      this.serviceHealthy = false;
      
      // Provide a more user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('405') || errorMessage.includes('Method Not Allowed')) {
        return { 
          embedding: [], 
          error: 'AI embedding service endpoint not available. Using fallback keyword matching.' 
        };
      } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        return { 
          embedding: [], 
          error: 'GitHub token authentication failed. Please verify your VITE_GITHUB_TOKEN.' 
        };
      } else if (errorMessage.includes('429')) {
        return { 
          embedding: [], 
          error: 'Rate limit exceeded. Please wait a moment before trying again.' 
        };
      }
      
      return { 
        embedding: [], 
        error: `Embedding generation failed: ${errorMessage}`
      };
    }
  }

  async generateChatCompletion(request: ChatRequest): Promise<ChatResponse> {
    console.warn('Using GitHub Models API for chat completion');
    
    try {
      // GitHub Models API endpoint for chat completions
      const operation = () => fetch('https://models.inference.ai.azure.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: request.messages,
          max_tokens: request.maxTokens || 1500,
          temperature: request.temperature || 0.3,
          stream: false
        }),
      });

      const data = await this.retryWithBackoff<any>(operation, 'generateChatCompletion');
      
      if (data?.choices?.[0]?.message?.content) {
        console.log('Generated chat completion successfully');
        return { content: data.choices[0].message.content };
      } else {
        console.error('Invalid chat response format:', data);
        throw new Error('Invalid chat response format');
      }
    } catch (error) {
      console.error('Error generating chat completion after retries:', error);
      
      // Provide a more user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('405') || errorMessage.includes('Method Not Allowed')) {
        return { 
          content: 'I apologize, but the AI chat service is currently unavailable. Please try again later.', 
          error: 'Chat service temporarily unavailable.' 
        };
      } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
        return { 
          content: 'Authentication failed with the AI service. Please check the configuration.', 
          error: 'API authentication failed.' 
        };
      }
      
      return { 
        content: 'I encountered an error processing your request. Please try again.', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Test the AI service with a simple embedding generation
   */
  async testService(): Promise<{ success: boolean; message: string; details?: any }> {
    console.log('🧪 Testing AI service...');
    
    if (!this.isTokenConfigured()) {
      return {
        success: false,
        message: 'GitHub token not configured properly. Please check VITE_GITHUB_TOKEN environment variable.'
      };
    }

    try {
      const testText = 'Software engineer with React experience';
      const result = await this.generateEmbedding({ text: testText });
      
      if (result.embedding.length > 0) {
        return {
          success: true,
          message: `✅ AI service is working! Generated ${result.embedding.length}-dimensional embedding.`,
          details: {
            embeddingDimensions: result.embedding.length,
            testText: testText
          }
        };
      } else {
        return {
          success: false,
          message: `❌ AI service test failed: ${result.error || 'Unknown error'}`,
          details: { error: result.error }
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `❌ AI service test failed with exception: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error }
      };
    }
  }

  /**
   * Get service status and configuration info
   */
  getServiceInfo(): { configured: boolean; endpoint: string; model: string; status: string } {
    return {
      configured: this.isTokenConfigured(),
      endpoint: 'https://models.inference.ai.azure.com',
      model: 'text-embedding-3-large',
      status: this.serviceHealthy ? 'healthy' : 'unhealthy'
    };
  }
}

// Export singleton instance
export const aiService = import.meta.env.PROD 
  ? new AIService() 
  : new FallbackAIService();
