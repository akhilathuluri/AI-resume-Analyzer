import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  resumes?: any[];
  created_at?: string;
}

export interface ChatHistoryService {
  loadChatHistory: (user: User) => Promise<Message[]>;
  saveChatMessage: (user: User, message: Message) => Promise<void>;
  clearChatHistory: (user: User) => Promise<void>;
}

class ChatHistoryServiceImpl implements ChatHistoryService {
  private createWelcomeMessage(): Message {
    return {
      id: 'welcome-' + Date.now(),
      role: 'assistant',
      content: 'Hello! I\'m your AI recruiting assistant. I\'m here to help you with all aspects of hiring and talent management:\n\n• **Resume Analysis**: Upload job descriptions and I\'ll find the best candidates from your talent pool\n• **Hiring Guidance**: Best practices for interviewing, screening, and making job offers\n• **Market Intelligence**: Salary ranges, skill trends, and recruiting strategies\n• **General Questions**: Ask me anything about recruitment, HR processes, or candidate evaluation\n• **Follow-up Discussions**: I remember our conversation and can clarify or expand on previous responses\n\nWhat would you like to discuss today?',
    };
  }

  async loadChatHistory(user: User): Promise<Message[]> {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const loadedMessages: Message[] = data.map(msg => ({
          id: msg.message_id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          resumes: msg.resumes || undefined,
          created_at: msg.created_at
        }));
        return loadedMessages;
      } else {
        // If no history, return welcome message
        const welcomeMessage = this.createWelcomeMessage();
        await this.saveChatMessage(user, welcomeMessage);
        return [welcomeMessage];
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      // Return welcome message on error
      const welcomeMessage = this.createWelcomeMessage();
      return [welcomeMessage];
    }
  }

  async saveChatMessage(user: User, message: Message): Promise<void> {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert([
          {
            user_id: user.id,
            message_id: message.id,
            role: message.role,
            content: message.content,
            resumes: message.resumes || null
          }
        ]);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving message:', error);
      throw error;
    }
  }

  async clearChatHistory(user: User): Promise<void> {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error clearing chat history:', error);
      throw error;
    }
  }
}

export const chatHistoryService = new ChatHistoryServiceImpl();
