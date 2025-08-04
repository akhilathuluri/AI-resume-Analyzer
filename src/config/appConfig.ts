/**
 * Application Configuration
 * Centralizes all configuration values and constants
 */

export const CONFIG = {
  // AI Service Configuration
  AI: {
    EMBEDDING_MODEL: 'text-embedding-3-large',
    CHAT_MODEL: 'gpt-4o-mini',
    MAX_INPUT_LENGTH: 7500,
    MAX_TOKENS: 1500,
    TEMPERATURE: 0.3,
    EMBEDDING_DIMENSIONS: 3072,
    MAX_RESUME_MATCHES: 10,
  },

  // Chat Configuration
  CHAT: {
    MAX_MESSAGE_LENGTH: 5000,
    MIN_MESSAGE_LENGTH: 1,
    CONTEXT_MESSAGES: 6, // Number of recent messages to include in context
    MAX_RESUME_CONTENT_PREVIEW: 1500,
    MIN_JOB_DESCRIPTION_LENGTH: 10,
    MAX_JOB_DESCRIPTION_LENGTH: 10000,
  },

  // Cache Configuration
  CACHE: {
    EMBEDDING_TTL_MINUTES: 60,
    CHAT_RESPONSE_TTL_MINUTES: 15,
    RESUME_MATCH_TTL_MINUTES: 30,
    MAX_CACHE_ENTRIES: 100,
    MAX_CACHE_SIZE_MB: 10,
  },

  // Rate Limiting
  RATE_LIMITS: {
    AI_REQUESTS_PER_MINUTE: 20,
    EMAIL_REQUESTS_PER_5_MINUTES: 5,
    UPLOAD_REQUESTS_PER_MINUTE: 10,
  },

  // Email Configuration
  EMAIL: {
    MAX_SUBJECT_LENGTH: 200,
    MAX_MESSAGE_LENGTH: 5000,
    MIN_SUBJECT_LENGTH: 5,
    MIN_MESSAGE_LENGTH: 10,
  },

  // File Validation
  FILES: {
    MAX_FILENAME_LENGTH: 255,
    ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx', '.txt'],
    MAX_FILE_SIZE_MB: 10,
  },

  // UI Configuration
  UI: {
    MESSAGES_PER_PAGE: 50,
    ANIMATION_DELAY_MS: 100,
    SCROLL_BEHAVIOR: 'smooth' as ScrollBehavior,
    LOADING_DOTS_COUNT: 3,
  },

  // Database Configuration
  DATABASE: {
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
    QUERY_TIMEOUT_MS: 30000,
  },

  // Security Configuration
  SECURITY: {
    ALLOWED_HTML_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'strong', 'em', 'code', 'pre',
      'ul', 'ol', 'li', 'blockquote', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a'
    ],
    ALLOWED_HTML_ATTRIBUTES: {
      'a': ['href', 'target', 'rel'],
      'code': ['class'],
      'pre': ['class']
    },
    MAX_LOGIN_ATTEMPTS: 5,
    LOGIN_LOCKOUT_MINUTES: 15,
  },

  // Resume Matching Configuration
  RESUME_MATCHING: {
    COSINE_SIMILARITY_WEIGHT: 0.7,
    KEYWORD_MATCHING_WEIGHT: 0.3,
    MIN_KEYWORD_LENGTH: 3,
    MIN_SIMILARITY_THRESHOLD: 0.1,
    MAX_SIMILARITY_THRESHOLD: 1.0,
  },

  // Environment-specific settings
  ENVIRONMENT: {
    IS_DEVELOPMENT: import.meta.env.DEV,
    IS_PRODUCTION: import.meta.env.PROD,
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api',
    LOG_LEVEL: import.meta.env.VITE_LOG_LEVEL || 'info',
  },
} as const;

// Helper functions for configuration
export const getConfig = () => CONFIG;

export const isDevelopment = () => CONFIG.ENVIRONMENT.IS_DEVELOPMENT;

export const isProduction = () => CONFIG.ENVIRONMENT.IS_PRODUCTION;

// Validation helpers
export const validateFileSize = (sizeBytes: number): boolean => {
  return sizeBytes <= CONFIG.FILES.MAX_FILE_SIZE_MB * 1024 * 1024;
};

export const validateFileExtension = (filename: string): boolean => {
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return (CONFIG.FILES.ALLOWED_EXTENSIONS as readonly string[]).includes(extension);
};

export const validateMessageLength = (message: string): boolean => {
  return message.length >= CONFIG.CHAT.MIN_MESSAGE_LENGTH && 
         message.length <= CONFIG.CHAT.MAX_MESSAGE_LENGTH;
};

export const validateEmailSubject = (subject: string): boolean => {
  return subject.length >= CONFIG.EMAIL.MIN_SUBJECT_LENGTH && 
         subject.length <= CONFIG.EMAIL.MAX_SUBJECT_LENGTH;
};

export const validateEmailMessage = (message: string): boolean => {
  return message.length >= CONFIG.EMAIL.MIN_MESSAGE_LENGTH && 
         message.length <= CONFIG.EMAIL.MAX_MESSAGE_LENGTH;
};

// Error messages
export const ERROR_MESSAGES = {
  VALIDATION: {
    REQUIRED_FIELD: 'This field is required',
    INVALID_EMAIL: 'Please enter a valid email address',
    MESSAGE_TOO_LONG: `Message must be no more than ${CONFIG.CHAT.MAX_MESSAGE_LENGTH} characters`,
    MESSAGE_TOO_SHORT: `Message must be at least ${CONFIG.CHAT.MIN_MESSAGE_LENGTH} characters`,
    SUBJECT_TOO_LONG: `Subject must be no more than ${CONFIG.EMAIL.MAX_SUBJECT_LENGTH} characters`,
    SUBJECT_TOO_SHORT: `Subject must be at least ${CONFIG.EMAIL.MIN_SUBJECT_LENGTH} characters`,
    INVALID_FILE_TYPE: `Only ${CONFIG.FILES.ALLOWED_EXTENSIONS.join(', ')} files are allowed`,
    FILE_TOO_LARGE: `File must be smaller than ${CONFIG.FILES.MAX_FILE_SIZE_MB}MB`,
    SUSPICIOUS_CONTENT: 'Content contains suspicious patterns',
  },
  RATE_LIMIT: {
    TOO_MANY_REQUESTS: 'Too many requests. Please wait a moment before trying again.',
    TOO_MANY_EMAILS: 'Too many emails sent. Please wait before sending another.',
    TOO_MANY_UPLOADS: 'Too many uploads. Please wait before uploading another file.',
  },
  API: {
    CONNECTION_ERROR: 'Unable to connect to the service. Please check your internet connection.',
    TIMEOUT_ERROR: 'Request timed out. Please try again.',
    SERVER_ERROR: 'Server error occurred. Please try again later.',
    EMBEDDING_GENERATION_FAILED: 'Failed to generate embedding for the text.',
    CHAT_GENERATION_FAILED: 'Failed to generate AI response.',
    RESUME_MATCHING_FAILED: 'Failed to find matching resumes.',
  },
  DATABASE: {
    CONNECTION_ERROR: 'Database connection failed.',
    QUERY_ERROR: 'Database query failed.',
    SAVE_ERROR: 'Failed to save data.',
    LOAD_ERROR: 'Failed to load data.',
  },
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid email or password.',
    SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
    PERMISSION_DENIED: 'You do not have permission to perform this action.',
  },
} as const;
