import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { chatHistoryService, Message } from '../services/chatHistoryService';
import { resumeMatchingService } from '../services/resumeMatchingService';
import { chatCompletionService } from '../services/chatCompletionService';
import { emailService } from '../services/emailService';
import { retryManager, RETRY_CONFIGS } from '../utils/retryUtils';
import { InputValidator } from '../utils/validation';
import { CONFIG } from '../config/appConfig';

export interface ChatbotHookState {
  // Chat state
  messages: Message[];
  inputMessage: string;
  setInputMessage: (message: string) => void;
  
  // Loading states
  loading: boolean;
  loadingHistory: boolean;
  emailSending: boolean;
  
  // Email modal state
  showEmailModal: boolean;
  setShowEmailModal: (show: boolean) => void;
  emailTitle: string;
  setEmailTitle: (title: string) => void;
  emailMessage: string;
  setEmailMessage: (message: string) => void;
  sendRealEmails: boolean;
  setSendRealEmails: (send: boolean) => void;
  selectedResume: any;
  setSelectedResume: (resume: any) => void;
  
  // Actions
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  clearChatHistory: () => Promise<void>;
  sendEmail: () => Promise<void>;
  openEmailModal: (resume: any) => void;
  viewResume: (filePath: string, content?: string, filename?: string) => Promise<void>;
  scrollToBottom: () => void;
  
  // Refs
  chatEndRef: React.RefObject<HTMLDivElement>;
}

export function useChatbot(): ChatbotHookState {
  const { user } = useAuth();
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  
  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTitle, setEmailTitle] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendRealEmails, setSendRealEmails] = useState(false);
  const [selectedResume, setSelectedResume] = useState<any>(null);
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  
  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load chat history from database
  const loadChatHistory = useCallback(async () => {
    if (!user) return;

    setLoadingHistory(true);
    
    try {
      const loadedMessages = await retryManager.executeWithRetry(
        () => chatHistoryService.loadChatHistory(user),
        'loadChatHistory',
        RETRY_CONFIGS.database
      );
      
      setMessages(loadedMessages);
    } catch (error) {
      console.error('Error loading chat history:', error);
      // Show welcome message on error
      const welcomeMessage: Message = {
        id: 'welcome-' + Date.now(),
        role: 'assistant',
        content: 'Hello! I\'m your AI recruiting assistant. I\'m here to help you with all aspects of hiring and talent management:\n\n• **Resume Analysis**: Upload job descriptions and I\'ll find the best candidates from your talent pool using keyword matching\n• **Hiring Guidance**: Best practices for interviewing, screening, and making job offers\n• **Market Intelligence**: Salary ranges, skill trends, and recruiting strategies\n• **General Questions**: Ask me anything about recruitment, HR processes, or candidate evaluation\n• **Follow-up Discussions**: I remember our conversation and can clarify or expand on previous responses\n\n*Note: Currently using enhanced keyword matching for resume analysis. Full AI embeddings will be restored soon.*\n\nWhat would you like to discuss today?',
      };
      setMessages([welcomeMessage]);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  // Save a single message to database
  const saveChatMessage = useCallback(async (message: Message) => {
    if (!user) return;

    try {
      await retryManager.executeWithRetry(
        () => chatHistoryService.saveChatMessage(user, message),
        'saveChatMessage',
        RETRY_CONFIGS.database
      );
    } catch (error) {
      console.error('Error saving message:', error);
    }
  }, [user]);

  // Clear chat history
  const clearChatHistory = useCallback(async () => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to clear all chat history? This action cannot be undone.')) {
      return;
    }

    try {
      await retryManager.executeWithRetry(
        () => chatHistoryService.clearChatHistory(user),
        'clearChatHistory',
        RETRY_CONFIGS.database
      );

      // Reset to welcome message
      const welcomeMessage: Message = {
        id: 'welcome-' + Date.now(),
        role: 'assistant',
        content: 'Hello! I\'m your AI recruiting assistant. I\'m here to help you with all aspects of hiring and talent management:\n\n• **Resume Analysis**: Upload job descriptions and I\'ll find the best candidates from your talent pool\n• **Hiring Guidance**: Best practices for interviewing, screening, and making job offers\n• **Market Intelligence**: Salary ranges, skill trends, and recruiting strategies\n• **General Questions**: Ask me anything about recruitment, HR processes, or candidate evaluation\n• **Follow-up Discussions**: I remember our conversation and can clarify or expand on previous responses\n\nWhat would you like to discuss today?',
      };
      setMessages([welcomeMessage]);
      await saveChatMessage(welcomeMessage);
    } catch (error) {
      console.error('Error clearing chat history:', error);
      alert('Error clearing chat history. Please try again.');
    }
  }, [user, saveChatMessage]);

  // Handle chat submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || loading || !inputMessage.trim()) return;

    // Validate input
    const validation = InputValidator.validateText(inputMessage, {
      maxLength: CONFIG.AI.MAX_INPUT_LENGTH,
      minLength: CONFIG.CHAT.MIN_MESSAGE_LENGTH,
      required: true,
      allowHtml: false,
    });

    if (!validation.isValid) {
      alert(validation.error || 'Please enter a valid message');
      return;
    }

    const sanitizedInput = validation.sanitizedValue!;
    
    setLoading(true);
    
    const userMessage: Message = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: sanitizedInput,
    };

    // Add user message to chat
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');

    try {
      // Save user message
      await saveChatMessage(userMessage);

      // Find matching resumes with retry logic
      const matchingResumes = await retryManager.executeWithRetry(
        () => resumeMatchingService.findSimilarResumes(user, sanitizedInput),
        'findSimilarResumes',
        RETRY_CONFIGS.embedding
      );

      // Generate AI response with retry logic
      const aiResponse = await retryManager.executeWithRetry(
        () => chatCompletionService.generateChatResponse(sanitizedInput, matchingResumes, messages),
        'generateChatResponse',
        RETRY_CONFIGS.chatCompletion
      );

      // Only include resumes in UI if it's a resume matching request
      const shouldShowResumes = chatCompletionService.shouldShowResumeMatches(sanitizedInput);

      const assistantMessage: Message = {
        id: 'assistant-' + Date.now(),
        role: 'assistant',
        content: aiResponse,
        resumes: shouldShowResumes && matchingResumes.length > 0 ? matchingResumes : undefined,
      };

      // Add assistant message to chat
      setMessages(prev => [...prev, assistantMessage]);

      // Save assistant message
      await saveChatMessage(assistantMessage);

    } catch (error) {
      console.error('Error processing message:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'I apologize, but I encountered an error processing your request. Please try again.';
      
      const assistantMessage: Message = {
        id: 'assistant-error-' + Date.now(),
        role: 'assistant',
        content: `**Error**: ${errorMessage}\n\nPlease try again or rephrase your question.`,
      };

      setMessages(prev => [...prev, assistantMessage]);
      await saveChatMessage(assistantMessage);
    } finally {
      setLoading(false);
    }
  }, [user, loading, inputMessage, messages, saveChatMessage]);

  // Send email
  const sendEmail = useCallback(async () => {
    if (!user || !selectedResume) return;

    setEmailSending(true);
    
    try {
      await retryManager.executeWithRetry(
        () => emailService.sendResumeEmail(user, selectedResume, emailTitle, emailMessage, sendRealEmails),
        'sendEmail',
        RETRY_CONFIGS.email
      );

      // Reset modal
      setEmailTitle('');
      setEmailMessage('');
      setShowEmailModal(false);
      setSendRealEmails(false);
      setSelectedResume(null);
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Error sending email. Please try again.');
    } finally {
      setEmailSending(false);
    }
  }, [user, selectedResume, emailTitle, emailMessage, sendRealEmails]);

  // Open email modal for specific resume
  const openEmailModal = useCallback((resume: any) => {
    setSelectedResume(resume);
    setEmailTitle(`Follow-up regarding your application`);
    setEmailMessage(`Dear Candidate,

Thank you for your interest in our position. We have reviewed your resume and would like to discuss next steps.

Best regards,
ResumeAI Team`);
    setShowEmailModal(true);
  }, []);

  // View resume
  const viewResume = useCallback(async (filePath: string, content?: string, filename?: string) => {
    try {
      // Handle text-only content case (when file wasn't stored)
      if (content && !filePath.includes('resumes/')) {
        if (content.trim()) {
          const newWindow = window.open('', '_blank');
          if (newWindow) {
            newWindow.document.write(`
              <html>
                <head>
                  <title>${filename || 'Resume Content'}</title>
                  <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
                    .content { white-space: pre-wrap; }
                  </style>
                </head>
                <body>
                  <h1>${filename || 'Resume Content'}</h1>
                  <p><em>Note: This is text-only content. The original file was not stored.</em></p>
                  <div class="content">${content}</div>
                </body>
              </html>
            `);
            newWindow.document.close();
          }
        } else {
          alert('No content available to display');
        }
        return;
      }

      // Normal file viewing for stored files
      const { data } = await supabase.storage
        .from('resumes')
        .createSignedUrl(filePath, 3600);

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing resume:', error);
      alert('Error viewing resume. Please try again.');
    }
  }, []);

  // Load chat history on component mount
  useEffect(() => {
    loadChatHistory();
  }, [loadChatHistory]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return {
    // Chat state
    messages,
    inputMessage,
    setInputMessage,
    
    // Loading states
    loading,
    loadingHistory,
    emailSending,
    
    // Email modal state
    showEmailModal,
    setShowEmailModal,
    emailTitle,
    setEmailTitle,
    emailMessage,
    setEmailMessage,
    sendRealEmails,
    setSendRealEmails,
    selectedResume,
    setSelectedResume,
    
    // Actions
    handleSubmit,
    clearChatHistory,
    sendEmail,
    openEmailModal,
    viewResume,
    scrollToBottom,
    
    // Refs
    chatEndRef,
  };
}
