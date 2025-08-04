import { useState, useCallback, useMemo } from 'react';
import { Message } from '../services/chatHistoryService';

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWords?: boolean;
  regex?: boolean;
  includeResumes?: boolean;
}

export interface SearchResult {
  messageId: string;
  messageIndex: number;
  matchText: string;
  context: string;
  role: 'user' | 'assistant';
  resumeMatch?: {
    resumeId: string;
    resumeFilename: string;
  };
}

export const useMessageSearch = (messages: Message[]) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWords: false,
    regex: false,
    includeResumes: true
  });
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const results: SearchResult[] = [];

    try {
      let searchRegex: RegExp;
      
      if (searchOptions.regex) {
        searchRegex = new RegExp(searchQuery, searchOptions.caseSensitive ? 'g' : 'gi');
      } else if (searchOptions.wholeWords) {
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(`\\b${escapedQuery}\\b`, searchOptions.caseSensitive ? 'g' : 'gi');
      } else {
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(escapedQuery, searchOptions.caseSensitive ? 'g' : 'gi');
      }

      messages.forEach((message, index) => {
        // Search in message content
        const matches = Array.from(message.content.matchAll(searchRegex));
        matches.forEach(match => {
          const matchIndex = match.index || 0;
          const start = Math.max(0, matchIndex - 50);
          const end = Math.min(message.content.length, matchIndex + match[0].length + 50);
          const context = message.content.substring(start, end);
          
          results.push({
            messageId: message.id,
            messageIndex: index,
            matchText: match[0],
            context: context,
            role: message.role
          });
        });

        // Search in resumes if enabled
        if (searchOptions.includeResumes && message.resumes) {
          message.resumes.forEach(resume => {
            const resumeText = resume.content || resume.filename;
            const resumeMatches = resumeText.matchAll(searchRegex);
            
            for (const match of resumeMatches) {
              const matchIndex = match.index || 0;
              const start = Math.max(0, matchIndex - 50);
              const end = Math.min(resumeText.length, matchIndex + match[0].length + 50);
              const context = resumeText.substring(start, end);
              
              results.push({
                messageId: message.id,
                messageIndex: index,
                matchText: match[0],
                context: context,
                role: message.role,
                resumeMatch: {
                  resumeId: resume.id,
                  resumeFilename: resume.filename
                }
              });
            }
          });
        }
      });

      return results;
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }, [messages, searchQuery, searchOptions]);

  const navigateToResult = useCallback((index: number) => {
    if (index >= 0 && index < searchResults.length) {
      setCurrentResultIndex(index);
      const result = searchResults[index];
      
      // Find the message element and scroll to it
      const messageElement = document.querySelector(`[data-message-id="${result.messageId}"]`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight the message temporarily
        messageElement.classList.add('search-highlight');
        setTimeout(() => {
          messageElement.classList.remove('search-highlight');
        }, 2000);
      }
    }
  }, [searchResults]);

  const nextResult = useCallback(() => {
    if (searchResults.length > 0) {
      const nextIndex = (currentResultIndex + 1) % searchResults.length;
      navigateToResult(nextIndex);
    }
  }, [currentResultIndex, searchResults.length, navigateToResult]);

  const previousResult = useCallback(() => {
    if (searchResults.length > 0) {
      const prevIndex = currentResultIndex === 0 ? searchResults.length - 1 : currentResultIndex - 1;
      navigateToResult(prevIndex);
    }
  }, [currentResultIndex, searchResults.length, navigateToResult]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setCurrentResultIndex(0);
    setIsSearchVisible(false);
  }, []);

  const toggleSearch = useCallback(() => {
    setIsSearchVisible(prev => !prev);
    if (!isSearchVisible) {
      // Focus search input when opening
      setTimeout(() => {
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }, 100);
    }
  }, [isSearchVisible]);

  const highlightText = useCallback((text: string, query: string): string => {
    if (!query.trim()) return text;
    
    try {
      let searchRegex: RegExp;
      
      if (searchOptions.regex) {
        searchRegex = new RegExp(`(${query})`, searchOptions.caseSensitive ? 'g' : 'gi');
      } else if (searchOptions.wholeWords) {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(`(\\b${escapedQuery}\\b)`, searchOptions.caseSensitive ? 'g' : 'gi');
      } else {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(`(${escapedQuery})`, searchOptions.caseSensitive ? 'g' : 'gi');
      }

      return text.replace(searchRegex, '<mark class="bg-yellow-200 dark:bg-yellow-900">$1</mark>');
    } catch (error) {
      return text;
    }
  }, [searchOptions]);

  return {
    searchQuery,
    setSearchQuery,
    searchOptions,
    setSearchOptions,
    searchResults,
    currentResultIndex,
    isSearchVisible,
    navigateToResult,
    nextResult,
    previousResult,
    clearSearch,
    toggleSearch,
    highlightText
  };
};
