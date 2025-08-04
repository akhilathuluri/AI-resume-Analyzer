import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { CONFIG } from '../config/appConfig';
import { InputValidator } from '../utils/validation';
import { aiService } from '../services/aiService';

export interface ResumeMatch {
  id: string;
  filename: string;
  content: string;
  file_path: string;
  similarity: number;
}

export interface ResumeMatchingService {
  generateEmbedding: (text: string) => Promise<number[]>;
  findSimilarResumes: (user: User, jobDescription: string, limit?: number) => Promise<ResumeMatch[]>;
  extractRequestedCount: (text: string) => number;
}

// Cache for embeddings to avoid regeneration
const embeddingCache = new Map<string, number[]>();

class ResumeMatchingServiceImpl implements ResumeMatchingService {
  extractRequestedCount(text: string): number {
    // Look for patterns like "top 10", "best 15", "show me 20", etc.
    const patterns = [
      /(?:top|best|show|find|get|give)\s+(?:me\s+)?(\d+)/i,
      /(\d+)\s+(?:top|best|matching|candidates|resumes)/i,
      /(?:first|top)\s+(\d+)/i,
      /show\s+(\d+)/i,
      /(\d+)\s+resumes?/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const count = parseInt(match[1], 10);
        // Reasonable limits: minimum 1, maximum 50
        if (count >= 1 && count <= 50) {
          return count;
        }
      }
    }

    // Default to 5 if no specific number requested
    return 5;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Validate input
    const validation = InputValidator.validateText(text, {
      maxLength: CONFIG.AI.MAX_INPUT_LENGTH,
      minLength: CONFIG.CHAT.MIN_MESSAGE_LENGTH,
      required: true,
      allowHtml: false,
    });

    if (!validation.isValid) {
      console.error(`Invalid input for embedding: ${validation.error}`);
      return [];
    }

    try {
      const response = await aiService.generateEmbedding({
        text: validation.sanitizedValue!,
        model: CONFIG.AI.EMBEDDING_MODEL
      });

      if (response.error) {
        // Check if it's a rate limiting error
        if (response.error.includes('429') || response.error.toLowerCase().includes('rate limit')) {
          console.warn('Rate limiting detected, implementing exponential backoff');
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        throw new Error(response.error);
      }

      if (!response.embedding || response.embedding.length === 0) {
        throw new Error('Empty embedding received from AI service');
      }

      return response.embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return [];
    }
  }

  private calculateSimilarity(jobEmbedding: number[], resumeEmbedding: number[]): number {
    // Check dimension compatibility
    if (jobEmbedding.length !== resumeEmbedding.length) {
      console.warn(`Dimension mismatch: job ${jobEmbedding.length} vs resume ${resumeEmbedding.length}`);
      return 0;
    }
    
    // Calculate enhanced cosine similarity
    const dotProduct = jobEmbedding.reduce((sum, a, i) => sum + a * resumeEmbedding[i], 0);
    const normA = Math.sqrt(jobEmbedding.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(resumeEmbedding.reduce((sum: number, b: number) => sum + b * b, 0));
    
    if (normA === 0 || normB === 0) {
      console.warn('Zero magnitude vector detected');
      return 0;
    }
    
    const cosineSim = dotProduct / (normA * normB);
    
    // Normalize cosine similarity to [0, 1] range
    return Math.max(0, (cosineSim + 1) / 2);
  }

  private calculateKeywordScore(jobDescription: string, resumeContent: string): number {
    // Clean and normalize text
    const cleanText = (text: string) => 
      text.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

    const jobText = cleanText(jobDescription);
    const resumeText = cleanText(resumeContent);

    // Extract meaningful keywords (filter out common words)
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 
      'below', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 
      'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 
      'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
      'work', 'experience', 'job', 'position', 'role', 'company', 'team', 'years', 'year'
    ]);

    const extractKeywords = (text: string) => 
      text.split(/\s+/)
        .filter(word => word.length > 2 && !commonWords.has(word))
        .filter(word => !/^\d+$/.test(word)); // Remove pure numbers

    const jobKeywords = extractKeywords(jobText);
    const resumeKeywords = extractKeywords(resumeText);

    if (jobKeywords.length === 0 || resumeKeywords.length === 0) {
      return 0;
    }

    // Create keyword frequency maps
    const jobKeywordFreq = new Map<string, number>();
    const resumeKeywordFreq = new Map<string, number>();

    jobKeywords.forEach(keyword => {
      jobKeywordFreq.set(keyword, (jobKeywordFreq.get(keyword) || 0) + 1);
    });

    resumeKeywords.forEach(keyword => {
      resumeKeywordFreq.set(keyword, (resumeKeywordFreq.get(keyword) || 0) + 1);
    });

    // Calculate weighted intersection score
    let totalScore = 0;
    let totalWeight = 0;

    jobKeywordFreq.forEach((jobFreq, keyword) => {
      const resumeFreq = resumeKeywordFreq.get(keyword) || 0;
      if (resumeFreq > 0) {
        // Weight by frequency and keyword importance
        const weight = Math.log(jobFreq + 1) * Math.log(resumeFreq + 1);
        totalScore += weight;
      }
      totalWeight += Math.log(jobFreq + 1);
    });

    // Normalize score
    const baseScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    
    // Apply coverage penalty if too few keywords match
    const uniqueMatches = new Set([...jobKeywordFreq.keys()].filter(k => resumeKeywordFreq.has(k))).size;
    const coverageRatio = uniqueMatches / Math.min(jobKeywordFreq.size, 10); // Cap at 10 keywords for coverage
    
    // Final score combines base score with coverage
    const finalScore = baseScore * (0.7 + 0.3 * coverageRatio);
    
    return Math.min(1.0, finalScore);
  }

  async findSimilarResumes(user: User, jobDescription: string, limit?: number): Promise<ResumeMatch[]> {
    const requestedLimit = limit ?? this.extractRequestedCount(jobDescription);
    
    console.log(`Finding top ${requestedLimit} similar resumes for user: ${user.id}`);
    
    try {
      // Generate embedding for job description with caching
      const cacheKey = `job_${jobDescription.substring(0, 100)}`;
      let jobEmbedding = embeddingCache.get(cacheKey);
      
      if (!jobEmbedding) {
        jobEmbedding = await this.generateEmbedding(jobDescription);
        if (jobEmbedding.length > 0) {
          embeddingCache.set(cacheKey, jobEmbedding);
        }
      }
      
      if (jobEmbedding.length === 0) {
        console.warn('Failed to generate job description embedding, falling back to keyword matching');
        // Fallback to keyword-only matching when embeddings fail
        return this.fallbackKeywordMatching(user, jobDescription, requestedLimit);
      }

      // Get all resumes with embeddings
      const { data: resumes, error } = await supabase
        .from('resumes')
        .select('id, filename, content, embedding, file_path')
        .eq('user_id', user.id)
        .not('embedding', 'is', null);

      if (error) throw error;

      if (!resumes || resumes.length === 0) {
        console.log('No resumes with embeddings found');
        return [];
      }

      // Calculate similarity scores
      const resumesWithSimilarity = resumes
        .map(resume => {
          if (!resume.embedding) return null;
          
          // Parse embedding if it's a string
          let embeddingArray: number[];
          if (typeof resume.embedding === 'string') {
            try {
              embeddingArray = JSON.parse(resume.embedding);
            } catch (parseError) {
              console.error('Error parsing embedding:', parseError);
              return null;
            }
          } else if (Array.isArray(resume.embedding)) {
            embeddingArray = resume.embedding;
          } else {
            console.error('Embedding is neither string nor array:', typeof resume.embedding);
            return null;
          }

          // Ensure embeddingArray is actually an array
          if (!Array.isArray(embeddingArray)) {
            console.error('Parsed embedding is not an array:', embeddingArray);
            return null;
          }
          
          const normalizedSimilarity = this.calculateSimilarity(jobEmbedding, embeddingArray);
          
          // Add keyword matching for better accuracy
          const keywordScore = this.calculateKeywordScore(jobDescription, resume.content || '');
          
          // Combined score (70% cosine + 30% keyword matching)
          const finalSimilarity = (normalizedSimilarity * 0.7) + (keywordScore * 0.3);
          
          console.log(`Resume: ${resume.filename}, Cosine: ${normalizedSimilarity.toFixed(3)}, Keyword: ${keywordScore.toFixed(3)}, Final: ${finalSimilarity.toFixed(3)}`);
          
          return {
            id: resume.id,
            filename: resume.filename,
            content: resume.content,
            file_path: resume.file_path,
            similarity: finalSimilarity
          };
        })
        .filter((resume): resume is ResumeMatch => resume !== null)
        .sort((a, b) => b.similarity - a.similarity);

      // Return top N matches based on user request or default
      console.log(`Returning top ${requestedLimit} matches from ${resumesWithSimilarity.length} total matches`);
      return resumesWithSimilarity.slice(0, requestedLimit);

    } catch (error) {
      console.error('Error finding similar resumes:', error);
      // If everything fails, try fallback keyword matching
      try {
        console.log('Attempting fallback keyword matching...');
        return await this.fallbackKeywordMatching(user, jobDescription, requestedLimit);
      } catch (fallbackError) {
        console.error('Fallback matching also failed:', fallbackError);
        throw new Error('Unable to process job description at the moment. This might be due to high demand on our AI services. Please try again in a few moments.');
      }
    }
  }

  /**
   * Fallback keyword matching when embeddings are not available
   */
  private async fallbackKeywordMatching(user: User, jobDescription: string, limit: number): Promise<ResumeMatch[]> {
    console.log('Using fallback keyword matching');
    
    // Get all resumes with content
    const { data: resumes, error } = await supabase
      .from('resumes')
      .select('id, filename, content, file_path')
      .eq('user_id', user.id)
      .not('content', 'is', null)
      .neq('content', '');

    if (error) throw error;

    if (!resumes || resumes.length === 0) {
      console.log('No resumes with content found for keyword matching');
      return [];
    }

    // Calculate keyword-based scores
    const resumesWithSimilarity = resumes
      .map(resume => {
        const keywordScore = this.calculateKeywordScore(jobDescription, resume.content || '');
        
        // Use keyword matching with better scoring distribution
        const finalSimilarity = keywordScore;
        
        console.log(`Resume: ${resume.filename}, Keyword Score: ${keywordScore.toFixed(4)}, Final: ${finalSimilarity.toFixed(4)}`);
        
        return {
          id: resume.id,
          filename: resume.filename,
          content: resume.content,
          file_path: resume.file_path,
          similarity: finalSimilarity
        };
      })
      .filter(resume => resume.similarity > 0.01) // Include resumes with minimal relevance
      .sort((a, b) => b.similarity - a.similarity);

    console.log(`Fallback matching: returning top ${limit} matches from ${resumesWithSimilarity.length} keyword matches`);
    return resumesWithSimilarity.slice(0, limit);
  }
}

export const resumeMatchingService = new ResumeMatchingServiceImpl();
