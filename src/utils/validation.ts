import DOMPurify from 'dompurify';

/**
 * Input validation and sanitization utilities
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedValue?: string;
}

export class InputValidator {
  /**
   * Validate and sanitize text input
   */
  static validateText(
    input: string,
    options: {
      maxLength?: number;
      minLength?: number;
      allowHtml?: boolean;
      required?: boolean;
    } = {}
  ): ValidationResult {
    const {
      maxLength = 10000,
      minLength = 0,
      allowHtml = false,
      required = false,
    } = options;

    // Check if required
    if (required && (!input || input.trim().length === 0)) {
      return {
        isValid: false,
        error: 'This field is required',
      };
    }

    // If not required and empty, return as valid
    if (!required && (!input || input.trim().length === 0)) {
      return {
        isValid: true,
        sanitizedValue: '',
      };
    }

    // Check length
    if (input.length > maxLength) {
      return {
        isValid: false,
        error: `Text must be no more than ${maxLength} characters`,
      };
    }

    if (input.length < minLength) {
      return {
        isValid: false,
        error: `Text must be at least ${minLength} characters`,
      };
    }

    // Sanitize HTML if not allowed
    let sanitizedValue = input;
    if (!allowHtml) {
      sanitizedValue = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
    } else {
      // Allow only safe HTML tags
      sanitizedValue = DOMPurify.sanitize(input, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
        ALLOWED_ATTR: [],
      });
    }

    // Check for suspicious patterns
    if (this.containsSuspiciousContent(sanitizedValue)) {
      return {
        isValid: false,
        error: 'Content contains suspicious patterns',
      };
    }

    return {
      isValid: true,
      sanitizedValue,
    };
  }

  /**
   * Validate email address
   */
  static validateEmail(email: string): ValidationResult {
    if (!email || email.trim().length === 0) {
      return {
        isValid: false,
        error: 'Email is required',
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const sanitizedEmail = DOMPurify.sanitize(email.trim().toLowerCase());

    if (!emailRegex.test(sanitizedEmail)) {
      return {
        isValid: false,
        error: 'Please enter a valid email address',
      };
    }

    if (sanitizedEmail.length > 254) {
      return {
        isValid: false,
        error: 'Email address is too long',
      };
    }

    return {
      isValid: true,
      sanitizedValue: sanitizedEmail,
    };
  }

  /**
   * Validate file path
   */
  static validateFilePath(filePath: string): ValidationResult {
    if (!filePath || filePath.trim().length === 0) {
      return {
        isValid: false,
        error: 'File path is required',
      };
    }

    const sanitizedPath = DOMPurify.sanitize(filePath.trim());

    // Check for path traversal attacks
    if (sanitizedPath.includes('..') || sanitizedPath.includes('~')) {
      return {
        isValid: false,
        error: 'Invalid file path',
      };
    }

    // Check for suspicious characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(sanitizedPath)) {
      return {
        isValid: false,
        error: 'File path contains invalid characters',
      };
    }

    return {
      isValid: true,
      sanitizedValue: sanitizedPath,
    };
  }

  /**
   * Validate job description for AI processing
   */
  static validateJobDescription(jobDescription: string): ValidationResult {
    const result = this.validateText(jobDescription, {
      maxLength: 10000,
      minLength: 10,
      required: true,
      allowHtml: false,
    });

    if (!result.isValid) {
      return result;
    }

    // Additional validation for job descriptions
    const sanitized = result.sanitizedValue!;

    // Check if it looks like a job description
    const jobKeywords = [
      'experience', 'skills', 'requirements', 'responsibilities',
      'qualifications', 'position', 'role', 'job', 'candidate',
      'hiring', 'years', 'develop', 'manage', 'work', 'team'
    ];

    const hasJobKeywords = jobKeywords.some(keyword =>
      sanitized.toLowerCase().includes(keyword)
    );

    if (!hasJobKeywords && sanitized.length > 50) {
      return {
        isValid: false,
        error: 'Text does not appear to be a job description. Please provide a detailed job description with requirements and responsibilities.',
      };
    }

    return {
      isValid: true,
      sanitizedValue: sanitized,
    };
  }

  /**
   * Validate user ID (UUID format)
   */
  static validateUserId(userId: string): ValidationResult {
    if (!userId || userId.trim().length === 0) {
      return {
        isValid: false,
        error: 'User ID is required',
      };
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const sanitizedId = DOMPurify.sanitize(userId.trim());

    if (!uuidRegex.test(sanitizedId)) {
      return {
        isValid: false,
        error: 'Invalid user ID format',
      };
    }

    return {
      isValid: true,
      sanitizedValue: sanitizedId,
    };
  }

  /**
   * Check for suspicious content patterns
   */
  private static containsSuspiciousContent(text: string): boolean {
    const suspiciousPatterns = [
      // Script injection
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      
      // SQL injection patterns
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/gi,
      /(\b(UNION|OR|AND)\s+(SELECT|INSERT|UPDATE|DELETE)\b)/gi,
      
      // Path traversal
      /\.\.[\/\\]/gi,
      
      // Command injection
      /[\|;&`$\(\)]/g,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Rate limiting helper
   */
  static createRateLimiter(maxRequests: number, windowMs: number) {
    const requests = new Map<string, number[]>();

    return (identifier: string): boolean => {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get existing requests for this identifier
      const userRequests = requests.get(identifier) || [];
      
      // Filter out old requests
      const recentRequests = userRequests.filter(timestamp => timestamp > windowStart);
      
      // Check if limit exceeded
      if (recentRequests.length >= maxRequests) {
        return false;
      }

      // Add current request
      recentRequests.push(now);
      requests.set(identifier, recentRequests);

      // Cleanup old entries periodically
      if (Math.random() < 0.01) { // 1% chance
        for (const [key, timestamps] of requests.entries()) {
          const filtered = timestamps.filter(t => t > windowStart);
          if (filtered.length === 0) {
            requests.delete(key);
          } else {
            requests.set(key, filtered);
          }
        }
      }

      return true;
    };
  }
}

// Create rate limiters for different operations
export const aiRequestLimiter = InputValidator.createRateLimiter(20, 60000); // 20 requests per minute
export const emailLimiter = InputValidator.createRateLimiter(5, 300000); // 5 emails per 5 minutes
export const uploadLimiter = InputValidator.createRateLimiter(10, 60000); // 10 uploads per minute

/**
 * Sanitize markdown content for safe rendering
 */
export function sanitizeMarkdown(content: string): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'strong', 'em', 'code', 'pre',
      'ul', 'ol', 'li', 'blockquote', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
  });
}
