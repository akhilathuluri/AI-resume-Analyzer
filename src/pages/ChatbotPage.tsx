import { Send, Bot, User, FileText, ExternalLink, Trash2, Mail, Search, Download, ArrowUp, ArrowDown, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ErrorBoundary, useErrorHandler } from '../components/ErrorBoundary'
import { useChatbot } from '../hooks/useChatbot'
import { useLoadingStates } from '../hooks/useLoadingStates'
import { useKeyboardNavigation, useMessageNavigation } from '../hooks/useKeyboardNavigation'
import { useMessageSearch } from '../hooks/useMessageSearch'
import { useExport, ExportOptions } from '../hooks/useExport'
import { useState } from 'react'

// FormattedMessage component for rendering messages with markdown
const FormattedMessage = ({ content, role, searchQuery }: { content: string; role: 'user' | 'assistant'; searchQuery?: string }) => {
  // Apply search highlighting if search query exists
  const processedContent = searchQuery ? content.replace(
    new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
    '<mark>$1</mark>'
  ) : content;

  return (
    <div className={`prose prose-sm max-w-none ${role === 'assistant' ? 'prose-slate' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className={`mb-3 last:mb-0 leading-relaxed ${role === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</p>,
          ul: ({ children }) => <ul className={`mb-4 last:mb-0 ml-6 space-y-1 ${role === 'user' ? 'text-white' : 'text-slate-900'}`} style={{ listStyleType: 'disc', listStylePosition: 'outside' }}>{children}</ul>,
          ol: ({ children }) => <ol className={`mb-4 last:mb-0 ml-6 space-y-1 ${role === 'user' ? 'text-white' : 'text-slate-900'}`} style={{ listStyleType: 'decimal', listStylePosition: 'outside' }}>{children}</ol>,
          li: ({ children }) => <li className={`mb-1 leading-relaxed ${role === 'user' ? 'text-white' : 'text-slate-900'}`} style={{ display: 'list-item' }}>{children}</li>,
          strong: ({ children }) => <strong className={`font-semibold ${role === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</strong>,
          em: ({ children }) => <em className={`italic ${role === 'user' ? 'text-white/90' : 'text-slate-700'}`}>{children}</em>,
          code: ({ children }) => (
            <code className={`px-1.5 py-0.5 rounded text-xs font-mono ${
              role === 'user' 
                ? 'bg-white/20 text-white' 
                : 'bg-slate-100 text-slate-800'
            }`}>
              {children}
            </code>
          ),
          h1: ({ children }) => <h1 className={`text-xl font-bold mb-4 mt-6 first:mt-0 ${role === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</h1>,
          h2: ({ children }) => <h2 className={`text-lg font-bold mb-3 mt-5 first:mt-0 ${role === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</h2>,
          h3: ({ children }) => <h3 className={`text-base font-bold mb-2 mt-4 first:mt-0 ${role === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</h3>,
          h4: ({ children }) => <h4 className={`text-sm font-bold mb-2 mt-3 first:mt-0 ${role === 'user' ? 'text-white' : 'text-slate-900'}`}>{children}</h4>,
          blockquote: ({ children }) => (
            <blockquote className={`border-l-4 pl-4 my-4 italic ${
              role === 'user' 
                ? 'border-white/30 text-white/90' 
                : 'border-slate-300 text-slate-700'
            }`}>
              {children}
            </blockquote>
          ),
          hr: () => <hr className={`my-6 border-t ${role === 'user' ? 'border-white/30' : 'border-slate-200'}`} />,
        }}
      >
        {searchQuery ? processedContent : content}
      </ReactMarkdown>
    </div>
  )
}

export function ChatbotPage() {
  const { handleError } = useErrorHandler()
  const loadingStates = useLoadingStates()
  
  // Use the new modular chatbot hook
  const {
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
    
    // Actions
    handleSubmit,
    clearChatHistory,
    sendEmail,
    openEmailModal,
    viewResume,
    
    // Refs
    chatEndRef,
  } = useChatbot()

  // New feature hooks
  const [showExportModal, setShowExportModal] = useState(false)
  const messageNavigation = useMessageNavigation(messages.length)
  const messageSearch = useMessageSearch(messages)
  const exportHook = useExport()

  // Keyboard navigation setup
  useKeyboardNavigation({
    onEscape: () => {
      if (messageSearch.isSearchVisible) {
        messageSearch.clearSearch()
      } else if (showEmailModal) {
        setShowEmailModal(false)
      } else if (showExportModal) {
        setShowExportModal(false)
      }
    },
    onCtrlK: () => {
      messageSearch.toggleSearch()
    },
    onCtrlS: () => {
      setShowExportModal(true)
    },
    onArrowUp: () => {
      if (messageNavigation.isNavigatingMessages) {
        messageNavigation.navigateUp()
      } else if (messageSearch.searchResults.length > 0) {
        messageSearch.previousResult()
      }
    },
    onArrowDown: () => {
      if (messageNavigation.isNavigatingMessages) {
        messageNavigation.navigateDown()
      } else if (messageSearch.searchResults.length > 0) {
        messageSearch.nextResult()
      }
    },
    onEnter: () => {
      if (!messageNavigation.isNavigatingMessages) {
        messageNavigation.startNavigation()
      }
    },
    disabled: loading || loadingHistory
  })

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        handleError(error, 'ChatbotPage');
        console.error('ChatbotPage Error:', error, errorInfo);
      }}
    >
      <div className="min-h-[calc(100vh-5rem)] flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
        {/* Header */}
        <div className="relative overflow-hidden bg-white/80 backdrop-blur-sm border-b border-slate-200/60 mb-4 sm:mb-6">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-indigo-600/5"></div>
          <div className="relative px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                    AI Recruiting Assistant
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed mt-1 hidden sm:block">
                    Your intelligent recruiting companion for candidate analysis and hiring insights
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={messageSearch.toggleSearch}
                  className="group inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/60 hover:border-blue-300/80 rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                  title="Search messages (Ctrl+K)"
                >
                  <Search className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform duration-200" />
                  <span className="hidden sm:inline">Search</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowExportModal(true)}
                  className="group inline-flex items-center px-3 py-2 text-sm font-medium text-green-600 bg-green-50/80 hover:bg-green-100/80 border border-green-200/60 hover:border-green-300/80 rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                  title="Export chat (Ctrl+S)"
                >
                  <Download className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform duration-200" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                
                <button
                  type="button"
                  onClick={clearChatHistory}
                  disabled={loading || loadingHistory}
                  className="group inline-flex items-center px-3 py-2 text-sm font-medium text-red-600 bg-red-50/80 hover:bg-red-100/80 border border-red-200/60 hover:border-red-300/80 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Clear all chat history"
                >
                  <Trash2 className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform duration-200" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        {messageSearch.isSearchVisible && (
          <div className="px-4 sm:px-6 lg:px-8 mb-4">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-lg p-4">
              <div className="flex items-center space-x-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={messageSearch.searchQuery}
                    onChange={(e) => messageSearch.setSearchQuery(e.target.value)}
                    placeholder="Search messages..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    data-search-input
                    autoFocus
                  />
                </div>
                
                {messageSearch.searchResults.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-slate-600">
                      {messageSearch.currentResultIndex + 1} of {messageSearch.searchResults.length}
                    </span>
                    <button
                      onClick={messageSearch.previousResult}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                      title="Previous result"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={messageSearch.nextResult}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                      title="Next result"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
                
                <button
                  onClick={messageSearch.clearSearch}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition-colors"
                  title="Close search"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              {/* Search Options */}
              <div className="flex items-center space-x-4 mt-3 pt-3 border-t border-slate-200">
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={messageSearch.searchOptions.caseSensitive}
                    onChange={(e) => messageSearch.setSearchOptions(prev => ({ ...prev, caseSensitive: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Case sensitive</span>
                </label>
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={messageSearch.searchOptions.wholeWords}
                    onChange={(e) => messageSearch.setSearchOptions(prev => ({ ...prev, wholeWords: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Whole words</span>
                </label>
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={messageSearch.searchOptions.includeResumes}
                    onChange={(e) => messageSearch.setSearchOptions(prev => ({ ...prev, includeResumes: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Include resumes</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Chat Container */}
        <div className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6">
          <div className="flex-1 bg-white/70 backdrop-blur-sm rounded-2xl sm:rounded-3xl border border-slate-200/60 shadow-xl shadow-blue-500/5 flex flex-col overflow-hidden">
            
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {loadingHistory ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                      <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-sm text-slate-600 font-medium">Loading conversation...</p>
                      {loadingStates.loadingStates.chatHistory.retryCount > 0 && (
                        <p className="text-xs text-slate-500 mt-1">
                          Retry attempt {loadingStates.loadingStates.chatHistory.retryCount}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message, index) => (
                      <div
                        key={message.id}
                        data-message-id={message.id}
                        className={`flex animate-fade-in-scale ${message.role === 'user' ? 'justify-end' : 'justify-start'} ${
                          messageNavigation.focusedMessageIndex === index ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
                        }`}
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <div
                          className={`flex max-w-full sm:max-w-4xl ${
                            message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                          }`}
                        >
                          {/* Avatar */}
                          <div
                            className={`flex-shrink-0 ${
                              message.role === 'user' ? 'ml-3 sm:ml-4' : 'mr-3 sm:mr-4'
                            }`}
                          >
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shadow-lg ${
                                message.role === 'user'
                                  ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
                                  : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600'
                              }`}
                            >
                              {message.role === 'user' ? (
                                <User className="w-4 h-4 sm:w-5 sm:h-5" />
                              ) : (
                                <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                              )}
                            </div>
                          </div>
                          
                          {/* Message Content */}
                          <div
                            className={`group rounded-2xl sm:rounded-3xl px-4 sm:px-6 py-3 sm:py-4 shadow-sm hover:shadow-md transition-all duration-300 ${
                              message.role === 'user'
                                ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
                                : 'bg-gradient-to-br from-white to-slate-50/50 text-slate-900 border border-slate-200/60'
                            }`}
                          >
                            <FormattedMessage 
                              content={message.content} 
                              role={message.role}
                              searchQuery={messageSearch.searchQuery}
                            />
                            
                            {/* Resume Matches */}
                            {message.resumes && message.resumes.length > 0 && (
                              <div className="mt-6 space-y-4">
                                <div className="flex items-center space-x-2 pb-3 border-b border-slate-200/60">
                                  <FileText className="h-4 w-4 text-blue-500" />
                                  <p className="text-sm font-semibold text-slate-700">
                                    Top {message.resumes.length} Matching Candidates
                                  </p>
                                </div>
                                <div className="grid gap-3">
                                  {message.resumes.map((resume, resumeIndex) => (
                                    <div
                                      key={resume.id}
                                      className="group/resume flex items-center justify-between p-3 sm:p-4 bg-white/80 hover:bg-white/90 rounded-xl border border-slate-200/60 hover:border-slate-300/80 shadow-sm hover:shadow-md transition-all duration-300"
                                    >
                                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                                        <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                                          {resumeIndex + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-slate-900 truncate">
                                            {resume.filename}
                                          </p>
                                          <div className="flex items-center space-x-2 mt-1">
                                            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                              <div
                                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-1000"
                                                style={{ width: `${Math.round(resume.similarity * 100)}%` }}
                                              ></div>
                                            </div>
                                            <span className="text-xs font-semibold text-slate-600">
                                              {Math.round(resume.similarity * 100)}%
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <button
                                          onClick={() => openEmailModal({
                                            id: resume.id,
                                            filename: resume.filename,
                                            content: resume.content,
                                            file_path: resume.file_path
                                          })}
                                          className="flex-shrink-0 p-2 text-green-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200 group-hover/resume:scale-110"
                                          title="Send email"
                                        >
                                          <Mail className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => viewResume(resume.file_path, resume.content, resume.filename)}
                                          className="flex-shrink-0 p-2 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 group-hover/resume:scale-110"
                                          title="View resume"
                                        >
                                          <ExternalLink className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Loading Animation with Enhanced States */}
                    {loading && (
                      <div className="flex justify-start animate-fade-in-scale">
                        <div className="flex">
                          <div className="mr-3 sm:mr-4">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 flex items-center justify-center shadow-lg">
                              <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                          </div>
                          <div className="bg-gradient-to-br from-white to-slate-50/50 border border-slate-200/60 rounded-2xl sm:rounded-3xl px-4 sm:px-6 py-3 sm:py-4 shadow-sm">
                            <div className="flex items-center space-x-3">
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                              </div>
                              <div className="text-sm text-slate-600">
                                {loadingStates.loadingStates.resumeMatching.isLoading && (
                                  <span className="font-medium">Finding matching resumes...</span>
                                )}
                                {loadingStates.loadingStates.chatCompletion.isLoading && (
                                  <span className="font-medium">AI is analyzing...</span>
                                )}
                                {loadingStates.loadingStates.messageSubmit.isLoading && !loadingStates.loadingStates.resumeMatching.isLoading && !loadingStates.loadingStates.chatCompletion.isLoading && (
                                  <span className="font-medium">Processing your message...</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="border-t border-slate-200/60 bg-white/50 backdrop-blur-sm">
              <div className="p-4 sm:p-6">
                <form onSubmit={handleSubmit} className="flex space-x-3 sm:space-x-4">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Ask me anything about careers, or describe a job position for resume matching..."
                      className="w-full bg-white/80 border border-slate-200/60 hover:border-slate-300/80 focus:border-blue-500/60 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 placeholder-slate-500 shadow-sm hover:shadow-md"
                      disabled={loading}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !inputMessage.trim()}
                    className="group flex-shrink-0 bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-2xl px-4 sm:px-6 py-3 sm:py-4 shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 disabled:hover:shadow-lg"
                  >
                    <Send className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform duration-200" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Export Modal */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
            <div className="relative top-8 mx-auto p-5 w-11/12 md:w-3/4 lg:w-1/2 max-w-2xl">
              <div className="relative overflow-hidden bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-2xl shadow-blue-500/20">
                <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
                
                <div className="relative p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <Download className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                          Export Chat
                        </h3>
                        <p className="text-sm text-slate-600 font-medium">
                          Export {messages.length} messages
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowExportModal(false)}
                      className="w-10 h-10 bg-slate-100/80 hover:bg-slate-200/80 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-800 transition-all duration-200"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        Export Format
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[
                          { format: 'markdown', label: 'Markdown', icon: '📝' },
                          { format: 'json', label: 'JSON', icon: '📋' },
                          { format: 'html', label: 'HTML', icon: '🌐' },
                          { format: 'txt', label: 'Text', icon: '📄' },
                          { format: 'csv', label: 'CSV', icon: '📊' },
                        ].map(({ format, label, icon }) => (
                          <button
                            key={format}
                            onClick={() => {
                              const options: ExportOptions = {
                                format: format as any,
                                includeResumes: true,
                                includeTimestamps: true,
                                includeMetadata: true
                              };
                              exportHook.exportChat(messages, options);
                              setShowExportModal(false);
                            }}
                            className="flex flex-col items-center p-4 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 group"
                          >
                            <span className="text-2xl mb-2 group-hover:scale-110 transition-transform duration-200">
                              {icon}
                            </span>
                            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                              {label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200/60">
                      <h4 className="text-sm font-semibold text-blue-900 mb-2">💡 Export Tips</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Markdown: Best for documentation and sharing</li>
                        <li>• JSON: Includes all data for backup/import</li>
                        <li>• HTML: Web-ready format with styling</li>
                        <li>• CSV: For spreadsheet analysis</li>
                        <li>• Text: Simple, universal format</li>
                      </ul>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-slate-500">
                        All exports include timestamps, resume matches, and full conversation history
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Email Modal */}
        {showEmailModal && selectedResume && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
            <div className="relative top-8 mx-auto p-5 w-11/12 md:w-3/4 lg:w-1/2 max-w-2xl">
              <div className="relative overflow-hidden bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-2xl shadow-blue-500/20">
                <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
                
                <div className="relative p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <Mail className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                          Send Email
                        </h3>
                        <p className="text-sm text-slate-600 font-medium">
                          Contact {selectedResume.filename}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowEmailModal(false)}
                      className="w-10 h-10 bg-slate-100/80 hover:bg-slate-200/80 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-800 transition-all duration-200"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        Email Subject
                      </label>
                      <input
                        type="text"
                        value={emailTitle}
                        onChange={(e) => setEmailTitle(e.target.value)}
                        placeholder="e.g., Follow-up regarding your application..."
                        className="w-full px-4 py-3 bg-white/80 border border-slate-200/60 hover:border-slate-300/80 focus:border-green-500/60 rounded-2xl shadow-sm hover:shadow-md focus:shadow-lg focus:outline-none focus:ring-4 focus:ring-green-500/20 transition-all duration-300 placeholder-slate-500 text-slate-900 font-medium"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        Message Content
                      </label>
                      <textarea
                        value={emailMessage}
                        onChange={(e) => setEmailMessage(e.target.value)}
                        placeholder="Enter your message for the candidate..."
                        rows={6}
                        className="w-full px-4 py-3 bg-white/80 border border-slate-200/60 hover:border-slate-300/80 focus:border-green-500/60 rounded-2xl shadow-sm hover:shadow-md focus:shadow-lg focus:outline-none focus:ring-4 focus:ring-green-500/20 transition-all duration-300 placeholder-slate-500 text-slate-900 font-medium resize-none"
                      />
                    </div>

                    {/* Email Configuration */}
                    <div className="relative overflow-hidden bg-slate-50/80 border border-slate-200/60 rounded-2xl p-6">
                      <div className="flex items-center space-x-3 mb-4">
                        <input
                          type="checkbox"
                          id="sendRealEmailsSingle"
                          checked={sendRealEmails}
                          onChange={(e) => setSendRealEmails(e.target.checked)}
                          className="rounded border-slate-300 text-green-600 focus:ring-green-500/30"
                        />
                        <label htmlFor="sendRealEmailsSingle" className="text-sm font-semibold text-slate-700">
                          📧 Send real email to candidate
                        </label>
                      </div>
                      
                      {sendRealEmails && (
                        <div className={`p-4 rounded-xl border ${
                          import.meta.env.VITE_EMAILJS_SERVICE_ID 
                            ? 'bg-green-50/80 border-green-200/60' 
                            : 'bg-yellow-50/80 border-yellow-200/60'
                        }`}>
                          <p className="text-sm text-slate-600">
                            {import.meta.env.VITE_EMAILJS_SERVICE_ID
                              ? '✅ Email service configured and ready'
                              : '⚠️ Email service not configured - will record communication only'
                            }
                          </p>
                        </div>
                      )}
                      
                      {!sendRealEmails && (
                        <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200/60">
                          <p className="text-sm text-slate-600">
                            📝 Communication will be recorded for tracking purposes only
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-slate-200/60">
                    <button
                      onClick={() => setShowEmailModal(false)}
                      className="px-6 py-3 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-2xl shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={sendEmail}
                      disabled={!emailTitle.trim() || !emailMessage.trim() || emailSending}
                      className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center space-x-2"
                    >
                      {emailSending && (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      )}
                      <span>
                        {emailSending ? 'Sending...' : sendRealEmails ? 'Send Email' : 'Create Record'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
