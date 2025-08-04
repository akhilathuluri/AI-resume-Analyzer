import { aiService } from '../services/aiService';
import { ResumeMatch } from './resumeMatchingService';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  resumes?: any[];
}

export interface ChatCompletionService {
  generateChatResponse: (
    jobDescription: string, 
    matchingResumes: ResumeMatch[], 
    conversationHistory: Message[]
  ) => Promise<string>;
  shouldShowResumeMatches: (text: string) => boolean;
}

class ChatCompletionServiceImpl implements ChatCompletionService {
  private isGreeting(text: string): boolean {
    return /^(hi|hello|hey|good morning|good afternoon|good evening|greetings|sup|what's up|whats up)$/i.test(text.trim());
  }

  private isSimpleQuestion(text: string): boolean {
    return text.trim().length < 15 && !/\b(job|position|role|hiring|recruit)\b/i.test(text.toLowerCase());
  }

  private isResumeMatchingRequest(text: string): boolean {
    const isGreeting = this.isGreeting(text);
    const isSimpleQuestion = this.isSimpleQuestion(text);
    
    // Check for specific questions about resumes (not analysis requests)
    const isSpecificResumeQuestion = /\b(mail|email|contact|phone|address|details for|info for|information about)\b.*\.(docx?|pdf|txt)/i.test(text) ||
                                   /\b(give me|show me|find|get|what is|whats)\b.*\b(mail|email|contact|phone)\b/i.test(text) ||
                                   /\b(email|mail)\s+(id|address)?\s+(for|of)\b/i.test(text);
    
    // Check for job description/matching requests
    const hasJobKeywords = /\b(job description|position|role|candidate|hire|hiring|recruit|looking for|seeking|need|require|want)\b/i.test(text.toLowerCase());
    const hasJobContext = /\b(years of experience|skills|requirements|qualifications|responsibilities|developer|engineer|manager|analyst|designer|consultant|senior|junior)\b/i.test(text.toLowerCase());
    const isJobDescription = text.length > 50 && (hasJobKeywords || hasJobContext) && !isSpecificResumeQuestion;
    
    return !isGreeting && !isSimpleQuestion && !isSpecificResumeQuestion && isJobDescription;
  }

  // Public method to check if query should show resume matches in UI
  public shouldShowResumeMatches(text: string): boolean {
    return this.isResumeMatchingRequest(text);
  }

  private async generateResumeAnalysisResponse(
    jobDescription: string, 
    matchingResumes: ResumeMatch[]
  ): Promise<string> {
    // Prepare detailed resume information for analysis
    const resumeDetails = matchingResumes.map((resume, index) => {
      const content = resume.content || 'Content not available - this may affect analysis accuracy';
      return `**Resume ${index + 1}: ${resume.filename}** (${Math.round(resume.similarity * 100)}% match)\n` +
        `Content: ${content.substring(0, 1500)}${content.length > 1500 ? '...' : ''}\n\n`;
    }).join('');

    try {
      const chatResponse = await aiService.generateChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert resume analyzer and career consultant. Your job is to provide detailed, specific analysis of how well resumes match job descriptions.

CRITICAL INSTRUCTIONS:
- Always analyze the ACTUAL content of each resume against the SPECIFIC job requirements
- For each resume, provide concrete examples of what MATCHES and what DOESN'T MATCH
- Quote specific skills, experiences, and keywords from both the job description and resumes
- Explain WHY the similarity percentage is what it is based on the content
- Be specific and factual - avoid generic responses
- ALWAYS use proper markdown formatting with headers, bullet points, and numbered lists
- If match percentages seem low, explain exactly what's missing
- Analyze ALL ${matchingResumes.length} resumes provided, regardless of the number

MANDATORY FORMATTING RULES:
- Use ## for main sections
- Use ### for subsections  
- Use #### for resume analysis headers
- Use **bold** for emphasis
- Use bullet points (-) for lists
- Use numbered lists (1.) when appropriate
- Separate sections with proper spacing

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

## Resume Analysis for Job Position

### Job Requirements Summary:
- Requirement 1 with specific details
- Requirement 2 with years of experience needed
- Requirement 3 with technical skills
- Requirement 4 with qualifications

### Detailed Resume Analysis:

#### Resume 1: [filename] - [X]% Match

**What Matches:**
- Specific skill from resume that matches job requirement
- Years of experience that align with needs
- Technology/tool expertise that fits

**What Doesn't Match:**
- Missing requirement with explanation
- Gap in experience or skills
- Lacking certification or qualification

**Why [X]% Match:**
Clear explanation of scoring based on requirements met vs missing.

[Continue this pattern for ALL ${matchingResumes.length} resumes]

### Hiring Recommendations:
1. Specific recommendation for top candidate(s)
2. Suggestions for interview focus areas
3. Additional screening recommendations

IMPORTANT: Analyze every single resume provided, even if there are ${matchingResumes.length} of them. The user specifically requested this many results.`,
          },
          {
            role: 'user',
            content: `Please analyze these resumes against this job description and explain the match percentages.

**JOB DESCRIPTION:**
${jobDescription}

**RESUMES TO ANALYZE:**
${resumeDetails}

For each resume, I need you to:
1. Identify specific skills/experience that MATCH the job requirements
2. Identify what's MISSING or doesn't match
3. Explain why the match percentage is what it is
4. Use actual content from the resumes and job description in your analysis`,
          },
        ],
        maxTokens: 1500,
        temperature: 0.3,
      });

      if (chatResponse.error) {
        if (chatResponse.error.includes('429') || chatResponse.error.toLowerCase().includes('rate limit')) {
          throw new Error('Our AI service is experiencing high demand. Please wait a moment and try again.');
        }
        throw new Error(chatResponse.error);
      }

      return chatResponse.content || 'I found matching resumes for your job description.';
    } catch (error) {
      console.error('Error in chat completion:', error);
      
      // Provide fallback response
      return `I found ${matchingResumes.length} matching resumes for your job description:\n\n` +
        matchingResumes.map((resume, index) => 
          `**${index + 1}. ${resume.filename}** - ${Math.round(resume.similarity * 100)}% match`
        ).join('\n') +
        '\n\nOur detailed analysis service is temporarily unavailable. Please try again in a moment for a comprehensive breakdown.';
    }
  }

  private async generateGeneralChatResponse(
    jobDescription: string, 
    conversationHistory: Message[]
  ): Promise<string> {
    console.log('Processing follow-up/general question:', jobDescription);
    console.log('Conversation history length:', conversationHistory.length);
    
    // Prepare conversation history for context, including resume data from previous analyses
    const recentMessages = conversationHistory.slice(-6).map(msg => {
      let content = msg.content;
      
      // If this message has resume matches, include them in the context with more detail
      if (msg.resumes && msg.resumes.length > 0) {
        const resumeContext = msg.resumes.map((resume: any) => {
          // Limit content to avoid token limits
          const contentPreview = resume.content ? resume.content.substring(0, 500) + '...' : 'Content not available';
          return `${resume.filename} (${Math.round(resume.similarity * 100)}% match) - Resume content: ${contentPreview}`;
        }).join('\n\n');
        
        content += '\n\n[Previous resume analysis context:\n' + resumeContext + ']';
      }
      
      return {
        role: msg.role,
        content: content
      };
    });

    console.log('Recent messages for context:', recentMessages.length);

    try {
      const chatResponse = await aiService.generateChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a helpful AI assistant specializing in career guidance, HR, recruitment, and resume analysis. You can:

1. **Answer general questions** about careers, job searching, interviewing, resume writing, workplace advice, etc.
2. **Clarify previous responses** - explain your analysis in more detail, answer follow-up questions about SPECIFIC resumes and analyses you just provided
3. **Provide career guidance** - salary expectations, career paths, skill development, etc.
4. **Help with job descriptions** - explain requirements, suggest improvements, etc.
5. **Answer specific resume questions** - extract contact information, skills, experience details from uploaded resumes
6. **Resume matching** - when users provide job descriptions, you analyze their uploaded resumes

CRITICAL INSTRUCTIONS FOR DIFFERENT QUESTION TYPES:

**For Specific Resume Questions (like "give me mail id for filename.docx"):**
- Look through the conversation history for resume content that matches the requested filename
- Extract the specific information requested (email, phone, address, skills, etc.)
- If you find the information, provide it directly and concisely
- If you don't find the specific resume or the information isn't available, say so clearly
- DO NOT generate fake contact information
- Format your response clearly with the requested information

**For Follow-up Questions about Previous Analysis:**
- When users ask about "that resume" or "the first resume" or "why did X get Y%", they are referring to resumes from your IMMEDIATELY PREVIOUS analysis
- The conversation history includes [Previous resume analysis context] sections with actual resume content and match percentages
- USE THE ACTUAL RESUME CONTENT PROVIDED in the context to explain your previous analysis
- NEVER create new fake resume analyses - only reference and explain what you actually analyzed before using the provided resume content
- If asked to clarify match percentages, explain based on the SPECIFIC resume content and job requirements from the conversation history
- If you don't have enough context from previous messages, ask the user to clarify which specific analysis they're referring to
- Maintain consistency with your previous analysis - don't contradict yourself

MANDATORY FORMATTING RULES:
- ALWAYS use proper markdown formatting
- Use ## for main sections
- Use ### for subsections
- Use **bold** for emphasis and important points
- Use bullet points (-) for lists
- Use numbered lists (1.) when providing step-by-step advice
- Use > for important quotes or highlights
- Separate sections with proper spacing

EXAMPLES:
- "give me mail id for John_Resume.docx" → Look for John_Resume.docx in conversation history and extract email address
- "Why did that first resume only get 51%?" → Look at previous analysis context and explain based on actual resume content
- "What skills does Sarah have?" → Extract skills from Sarah's resume content in conversation history

RESPONSE STRUCTURE:
- Be specific and factual when referencing previous analyses or resume content
- Provide actionable advice when possible
- Be encouraging and professional
- Use clear headers and bullet points for readability
- Answer the user's exact question directly

If the user asks about resume matching specifically, tell them to provide a job description and you'll analyze their uploaded resumes against it.`,
          },
          ...recentMessages.map((msg: any) => ({
            role: msg.role,
            content: msg.content
          })),
          {
            role: 'user',
            content: jobDescription
          }
        ],
        maxTokens: 800,
        temperature: 0.5,
      });

      if (chatResponse.error) {
        if (chatResponse.error.includes('429') || chatResponse.error.toLowerCase().includes('rate limit')) {
          throw new Error('Our AI service is experiencing high demand. Please wait a moment and try again.');
        }
        throw new Error(chatResponse.error);
      }

      return chatResponse.content || 'I\'m here to help with your questions!';
    } catch (error) {
      console.error('Error in general chat completion:', error);
      
      // Provide fallback response
      return 'I\'m experiencing some temporary issues with my AI service. Please try asking your question again in a moment.';
    }
  }

  async generateChatResponse(
    jobDescription: string, 
    matchingResumes: ResumeMatch[], 
    conversationHistory: Message[]
  ): Promise<string> {
    try {
      const isResumeMatchingRequest = this.isResumeMatchingRequest(jobDescription);

      // If it's a resume matching request and we have resumes
      if (isResumeMatchingRequest && matchingResumes.length > 0) {
        return await this.generateResumeAnalysisResponse(jobDescription, matchingResumes);
      } 
      // If it's a resume matching request but no resumes found
      else if (isResumeMatchingRequest && matchingResumes.length === 0) {
        return "I couldn't find any resumes in your collection that match this job description. Please make sure you have uploaded some resumes first, or the job requirements might be very specific and don't match your current resume collection.";
      }
      // Handle specific resume questions, general conversation, or non-resume topics
      else {
        return await this.generateGeneralChatResponse(jobDescription, conversationHistory);
      }
    } catch (error) {
      console.error('Error generating chat response:', error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('API request failed')) {
          return 'I\'m having trouble connecting to the AI service. Please check your internet connection and try again.';
        } else if (error.message.includes('token')) {
          return 'Your question was too complex for me to process. Please try asking a simpler or shorter question.';
        }
      }
      
      return 'I\'m sorry, I\'m experiencing some technical difficulties. Please try again in a moment.';
    }
  }
}

export const chatCompletionService = new ChatCompletionServiceImpl();
