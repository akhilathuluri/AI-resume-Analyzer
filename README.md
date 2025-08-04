# 🚀 AI Resume Analyzer - Advanced Resume Management System

[![React](https://img.shields.io/badge/React-18.3.1-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5.3-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-2.39.0-green)](https://supabase.com/)
[![Vite](https://img.shields.io/badge/Vite-5.4.2-purple)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.1-blue)](https://tailwindcss.com/)
[![GitHub Models](https://img.shields.io/badge/GitHub_Models-GPT--4o--mini-orange)](https://github.com/features/models)

A cutting-edge, AI-powered resume management system that revolutionizes recruitment with intelligent candidate analysis, semantic search, and comprehensive communication tracking. Built for modern recruiters and hiring managers who demand efficiency and precision.

## ✨ **Key Highlights**

- 🤖 **Direct GitHub Models Integration** - No backend required, powered by GPT-4o-mini
- 🎯 **Advanced Semantic Search** - AI-powered resume matching with similarity scoring
- 💬 **Intelligent Chatbot Assistant** - Natural language job description analysis
- 📧 **Email Communication Hub** - Integrated candidate outreach with tracking
- 🔍 **Advanced Search & Export** - Powerful search with multiple export formats
- ⌨️ **Keyboard Navigation** - Professional productivity shortcuts
- 📱 **Responsive Design** - Mobile-first UI with modern aesthetics

---

## 🚀 **Core Features**

### 📁 **Advanced Resume Management**
- **Multi-Format Support**: PDF, DOCX, TXT files up to 100MB
- **Cloud Storage**: Secure Supabase Storage with automatic backups
- **Smart Search**: Content-based search across all resumes
- **Bulk Operations**: Mass selection, export, and communication
- **Orphaned File Cleanup**: Intelligent database maintenance
- **Real-time Updates**: Live file synchronization
- **File Validation**: Automatic content extraction and validation

### 🤖 **AI-Powered Intelligence**
- **Semantic Matching**: Advanced embedding-based resume analysis
- **Similarity Scoring**: Precise percentage-based candidate ranking
- **Job Description Analysis**: Natural language processing of requirements
- **Content Extraction**: AI-powered text extraction from multiple formats
- **Resume Parsing**: Intelligent extraction of skills, experience, and contact info
- **GitHub Models Integration**: Direct API access to latest AI models
- **Contextual Understanding**: Conversation history for follow-up questions

### 💬 **Smart Chatbot Assistant**
- **Natural Language Interface**: Conversational job description input
- **Persistent Memory**: Complete chat history across sessions
- **Markdown Formatting**: Rich text responses with proper formatting
- **Resume Insights**: Detailed analysis of candidate matches
- **Follow-up Support**: Answer questions about previous analyses
- **Real-time Processing**: Instant matching and analysis
- **Context Awareness**: References previous conversations and analyses

### 🔍 **Advanced Search & Navigation**
- **Message Search**: Full-text search across chat history
- **Search Highlighting**: Visual indicators for search results
- **Search Options**: Case-sensitive, whole words, regex support
- **Resume Content Search**: Include resume text in searches
- **Keyboard Navigation**: Arrow keys for message navigation
- **Quick Access**: Ctrl+K for search, Ctrl+S for export
- **Result Navigation**: Previous/next result with visual feedback

### 📧 **Communication Hub**
- **Email Integration**: Real email sending via EmailJS
- **Bulk Communication**: Mass email to selected candidates
- **Communication Tracking**: Complete audit trail of interactions
- **Email Templates**: Professional message templates
- **Contact Extraction**: Automatic email detection from resumes
- **Delivery Status**: Track email success/failure
- **Communication History**: Searchable record of all touchpoints

### 📊 **Export & Reporting**
- **Multiple Formats**: Markdown, JSON, HTML, CSV, TXT
- **Chat Export**: Complete conversation history with metadata
- **Resume Export**: Actual file downloads, not just metadata
- **Bulk Export**: Mass export of selected resumes
- **Metadata Inclusion**: Timestamps, similarity scores, analysis data
- **Formatted Output**: Professional formatting for sharing
- **Date Range Filtering**: Export specific time periods

### ⌨️ **Productivity Features**
- **Keyboard Shortcuts**: Professional navigation shortcuts
- **Message Navigation**: Arrow key navigation through chat
- **Focus Management**: Accessible focus indicators
- **Quick Actions**: Keyboard-triggered modals and functions
- **Search Integration**: Seamless search with navigation
- **Accessibility**: WCAG compliant keyboard navigation
- **Performance Optimized**: Efficient DOM manipulation

### 🔐 **Security & Authentication**
- **Supabase Auth**: Enterprise-grade authentication
- **Row Level Security**: Database-level data protection
- **User Isolation**: Complete data separation between users
- **Session Management**: Secure persistent sessions
- **Data Privacy**: No API keys exposed in frontend
- **Secure Storage**: Encrypted file storage with access controls

### 🎨 **Modern UI/UX**
- **Responsive Design**: Mobile-first with perfect tablet/desktop scaling
- **Glass Morphism**: Modern backdrop blur effects
- **Micro-interactions**: Smooth animations and transitions
- **Professional Theme**: Consistent design language
- **Accessibility**: Screen reader support and keyboard navigation
- **Performance**: Optimized rendering with lazy loading
- **Dark Mode Ready**: Future-proof styling system

---

## 🛠 **Technology Stack**

### **Frontend Core**
- **React 18.3.1** - Modern hooks and concurrent features
- **TypeScript 5.5.3** - Full type safety and IntelliSense
- **Vite 5.4.2** - Lightning-fast development and building
- **Tailwind CSS 3.4.1** - Utility-first responsive design

### **UI & Interaction**
- **Lucide React 0.344.0** - Beautiful icon library
- **React Router DOM 6.22.0** - Client-side routing
- **React Markdown** - Rich text rendering with GitHub flavored markdown
- **PDF.js 4.0.379** - Client-side PDF processing
- **Mammoth** - DOCX file processing

### **Backend & Database**
- **Supabase 2.39.0** - Complete backend-as-a-service
- **PostgreSQL** - Robust relational database
- **Real-time Engine** - Live data synchronization
- **Storage API** - Secure file management

### **AI & Intelligence**
- **GitHub Models API** - Direct access to GPT-4o-mini
- **Text Embeddings** - Semantic similarity calculations
- **Natural Language Processing** - Conversational AI interface
- **Content Extraction** - Multi-format text processing

### **Communication**
- **EmailJS** - Real email sending capabilities
- **Email Validation** - Professional email verification
- **Template System** - Customizable message templates

---

## 🚀 **Quick Start Guide**

### **Prerequisites**
- Node.js 18+ and npm/yarn
- Supabase account (free tier available)
- GitHub account with Models access

### **1. Environment Setup**
```bash
# Clone the repository
git clone https://github.com/akhilathuluri/AI-resume-Analyzer.git
cd AI-resume-Analyzer

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### **2. Environment Variables**
```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# AI Integration
VITE_GITHUB_TOKEN=github_pat_your_token_here

# Email Integration (Optional)
VITE_EMAILJS_SERVICE_ID=your_emailjs_service_id
VITE_EMAILJS_TEMPLATE_ID=your_emailjs_template_id
VITE_EMAILJS_PUBLIC_KEY=your_emailjs_public_key
```

### **3. Database Setup**

#### **Core Tables**
```sql
-- Resume storage table
CREATE TABLE resumes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content TEXT,
    embedding JSONB,
    file_size BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat history table
CREATE TABLE chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    resumes JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Communication tracking table
CREATE TABLE communications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    email_sent BOOLEAN DEFAULT FALSE,
    delivery_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User storage tracking
CREATE TABLE user_storage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    total_files INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);
```

#### **Security Policies**
```sql
-- Enable Row Level Security
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_storage ENABLE ROW LEVEL SECURITY;

-- Create access policies
CREATE POLICY "Users access own data" ON resumes 
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users access own messages" ON chat_messages 
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users access own communications" ON communications 
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users access own storage" ON user_storage 
    FOR ALL USING (auth.uid() = user_id);
```

### **4. Storage Configuration**
1. Create a `resumes` bucket in Supabase Storage
2. Set bucket to public with RLS policies
3. Configure upload restrictions (file types, size limits)

### **5. Development**
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 📖 **User Guide**

### **Getting Started**
1. **Sign Up**: Create account with email/password
2. **Upload Resumes**: Drag & drop or select files (PDF/DOCX/TXT)
3. **Start Chatting**: Navigate to Chatbot and describe job positions
4. **Review Matches**: Analyze AI-powered candidate recommendations
5. **Communicate**: Send emails and track communications

### **Advanced Features**

#### **Smart Search**
- **Basic Search**: Type keywords in search bar
- **Advanced Options**: Use case-sensitive, whole words, or regex
- **Resume Content**: Include resume text in search results
- **Navigation**: Use arrow keys to navigate results

#### **Keyboard Shortcuts**
- `Ctrl + K` - Open message search
- `Ctrl + S` - Open export dialog
- `Escape` - Close modals/search
- `Arrow Keys` - Navigate messages/results
- `Enter` - Start message navigation mode

#### **Export Options**
- **Markdown**: Best for documentation and sharing
- **JSON**: Complete data with metadata for backup
- **HTML**: Web-ready format with styling
- **CSV**: Spreadsheet analysis format
- **TXT**: Simple, universal text format

#### **Bulk Operations**
1. Select multiple resumes using checkboxes
2. Choose bulk action (export, communicate, delete)
3. Configure action parameters
4. Execute with progress tracking

---

## 🏗 **Project Architecture**

```
src/
├── components/              # Reusable UI components
│   ├── AIDiagnostics.tsx    # AI service testing
│   ├── AuthForm.tsx         # Authentication form
│   ├── DatabaseDebugger.tsx # Development debugging
│   ├── ErrorBoundary.tsx    # Error handling
│   ├── Layout.tsx           # Main layout wrapper
│   └── ResumeMatchingTester.tsx # Resume matching test tool
├── contexts/                # React contexts
│   └── AuthContext.tsx      # Authentication state
├── hooks/                   # Custom React hooks
│   ├── useChatbot.ts        # Chatbot state management
│   ├── useExport.ts         # Export functionality
│   ├── useKeyboardNavigation.ts # Keyboard shortcuts
│   ├── useLoadingStates.ts  # Loading state management
│   └── useMessageSearch.ts  # Message search functionality
├── lib/                     # Utility libraries
│   ├── emailServiceBrowser.ts # Email integration
│   └── supabase.ts          # Supabase client
├── pages/                   # Main application pages
│   ├── ChatbotPage.tsx      # AI chatbot interface
│   ├── FilesPage.tsx        # File management
│   ├── HomePage.tsx         # Landing page
│   └── SettingsPage.tsx     # User settings
├── services/                # Business logic services
│   ├── aiService.ts         # AI API integration
│   ├── cacheService.ts      # Caching layer
│   ├── chatCompletionService.ts # Chat AI logic
│   ├── chatHistoryService.ts # Chat persistence
│   ├── emailService.ts      # Email sending
│   └── resumeMatchingService.ts # Resume matching logic
├── utils/                   # Utility functions
│   ├── retryUtils.ts        # Retry mechanisms
│   └── validation.ts        # Input validation
├── config/                  # Configuration files
│   └── appConfig.ts         # Application constants
├── App.tsx                  # Root component
├── main.tsx                 # Application entry
└── index.css               # Global styles with animations
```

### **Key Design Patterns**
- **Service Layer**: Separation of business logic from UI
- **Custom Hooks**: Reusable stateful logic
- **Error Boundaries**: Graceful error handling
- **Context Providers**: Global state management
- **Type Safety**: Comprehensive TypeScript coverage

---

## 🚀 **Deployment Guide**

### **Vercel Deployment**
```bash
# Build the project
npm run build

# Deploy to Vercel
npm install -g vercel
vercel --prod
```

**Environment Variables in Vercel:**
- Set all `VITE_*` variables in Vercel dashboard
- Configure build command: `npm run build`
- Set output directory: `dist`

### **Netlify Deployment**
```bash
# Build command
npm run build

# Publish directory
dist
```

**Deploy Settings:**
- Build command: `npm run build`
- Publish directory: `dist`
- Node version: 18.x

### **Self-Hosted Deployment**
```bash
# Build for production
npm run build

# Serve static files
npm install -g serve
serve -s dist -l 3000
```

---

## 🧪 **Testing & Development**

### **Development Tools**
```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Development server with HMR
npm run dev
```

### **AI Service Testing**
- Use AIDiagnostics component for AI service health checks
- Test resume matching with ResumeMatchingTester
- Monitor console for embedding generation status
- Verify GitHub token configuration

### **Database Debugging**
- DatabaseDebugger component for data inspection
- Test resume matching algorithms
- Verify embedding generation and storage
- Monitor Supabase real-time connections

---

## 🔧 **Configuration**

### **AI Service Configuration**
The app uses GitHub Models API for AI functionality:
```typescript
// Always uses direct GitHub API integration
export const aiService = new FallbackAIService();
```

### **Customization Options**
- **Theme**: Modify Tailwind configuration
- **AI Models**: Update model names in aiService
- **File Limits**: Adjust upload size limits
- **Search Options**: Configure search algorithms
- **Export Formats**: Add new export types

---

## 🐛 **Troubleshooting**

### **Common Issues**

#### **AI Service Errors**
```
Error: GitHub token authentication failed
```
**Solution**: Check VITE_GITHUB_TOKEN format and permissions

#### **File Upload Issues**
```
Error: File upload failed
```
**Solution**: Verify Supabase storage bucket configuration and RLS policies

#### **Search Not Working**
```
Search results not appearing
```
**Solution**: Check message indexing and search query formatting

#### **Email Sending Failures**
```
EmailJS configuration error
```
**Solution**: Verify EmailJS service ID, template ID, and public key

### **Performance Optimization**
- Enable lazy loading for large file lists
- Implement virtual scrolling for chat history
- Use React.memo for expensive components
- Optimize embedding calculations with caching

---

## 🤝 **Contributing**

### **Development Setup**
1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Install dependencies: `npm install`
4. Set up environment variables
5. Start development server: `npm run dev`

### **Code Standards**
- Follow TypeScript strict mode
- Use ESLint and Prettier configurations
- Write descriptive commit messages
- Add JSDoc comments for complex functions
- Maintain test coverage for critical features

### **Pull Request Process**
1. Update documentation for new features
2. Add tests for bug fixes
3. Ensure all linting passes
4. Update version numbers appropriately
5. Request review from maintainers

---

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 **Acknowledgments**

- **Supabase Team** - For the incredible backend platform
- **GitHub** - For Models API access and hosting
- **OpenAI** - For the foundational AI models
- **Vercel** - For seamless deployment experience
- **Tailwind Labs** - For the beautiful CSS framework
- **React Team** - For the amazing frontend library

---

**🚀 AI Resume Analyzer - Transforming recruitment with artificial intelligence**

*Built with ❤️ for modern recruiters and hiring teams*
