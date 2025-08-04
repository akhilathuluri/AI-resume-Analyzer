import { useCallback } from 'react';
import { Message } from '../services/chatHistoryService';

export interface ExportOptions {
  format: 'json' | 'txt' | 'markdown' | 'csv' | 'html';
  includeResumes?: boolean;
  includeTimestamps?: boolean;
  includeMetadata?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface ExportData {
  exportDate: string;
  totalMessages: number;
  userMessageCount: number;
  assistantMessageCount: number;
  messages: Message[];
  metadata?: {
    appVersion: string;
    exportFormat: string;
    filters: Partial<ExportOptions>;
  };
}

export const useExport = () => {
  const downloadFile = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const formatTimestamp = useCallback((timestamp?: string) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString();
  }, []);

  const filterMessagesByDate = useCallback((messages: Message[], dateRange?: { start: Date; end: Date }) => {
    if (!dateRange) return messages;
    
    return messages.filter(message => {
      if (!message.created_at) return true;
      const messageDate = new Date(message.created_at);
      return messageDate >= dateRange.start && messageDate <= dateRange.end;
    });
  }, []);

  const exportToJSON = useCallback((messages: Message[], options: ExportOptions) => {
    const filteredMessages = filterMessagesByDate(messages, options.dateRange);
    
    const exportData: ExportData = {
      exportDate: new Date().toISOString(),
      totalMessages: filteredMessages.length,
      userMessageCount: filteredMessages.filter(m => m.role === 'user').length,
      assistantMessageCount: filteredMessages.filter(m => m.role === 'assistant').length,
      messages: filteredMessages.map(message => ({
        ...message,
        resumes: options.includeResumes ? message.resumes : undefined
      })),
    };

    if (options.includeMetadata) {
      exportData.metadata = {
        appVersion: '1.0.0',
        exportFormat: 'json',
        filters: {
          includeResumes: options.includeResumes,
          includeTimestamps: options.includeTimestamps,
          dateRange: options.dateRange
        }
      };
    }

    const content = JSON.stringify(exportData, null, 2);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `chat-export-${timestamp}.json`;
    
    downloadFile(content, filename, 'application/json');
  }, [downloadFile, filterMessagesByDate]);

  const exportToMarkdown = useCallback((messages: Message[], options: ExportOptions) => {
    const filteredMessages = filterMessagesByDate(messages, options.dateRange);
    
    let markdown = `# Chat Export\n\n`;
    markdown += `**Export Date:** ${new Date().toLocaleString()}\n`;
    markdown += `**Total Messages:** ${filteredMessages.length}\n\n`;
    
    if (options.dateRange) {
      markdown += `**Date Range:** ${options.dateRange.start.toLocaleDateString()} - ${options.dateRange.end.toLocaleDateString()}\n\n`;
    }
    
    markdown += `---\n\n`;

    filteredMessages.forEach((message, index) => {
      const role = message.role === 'user' ? '👤 User' : '🤖 Assistant';
      markdown += `## ${role}`;
      
      if (options.includeTimestamps && message.created_at) {
        markdown += ` - ${formatTimestamp(message.created_at)}`;
      }
      
      markdown += `\n\n${message.content}\n\n`;

      if (options.includeResumes && message.resumes && message.resumes.length > 0) {
        markdown += `### 📄 Matching Resumes\n\n`;
        message.resumes.forEach((resume, resumeIndex) => {
          markdown += `${resumeIndex + 1}. **${resume.filename}** (${Math.round(resume.similarity * 100)}% match)\n`;
        });
        markdown += `\n`;
      }

      if (index < filteredMessages.length - 1) {
        markdown += `---\n\n`;
      }
    });

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `chat-export-${timestamp}.md`;
    
    downloadFile(markdown, filename, 'text/markdown');
  }, [downloadFile, filterMessagesByDate, formatTimestamp]);

  const exportToTXT = useCallback((messages: Message[], options: ExportOptions) => {
    const filteredMessages = filterMessagesByDate(messages, options.dateRange);
    
    let text = `CHAT EXPORT\n`;
    text += `Export Date: ${new Date().toLocaleString()}\n`;
    text += `Total Messages: ${filteredMessages.length}\n`;
    
    if (options.dateRange) {
      text += `Date Range: ${options.dateRange.start.toLocaleDateString()} - ${options.dateRange.end.toLocaleDateString()}\n`;
    }
    
    text += `\n${'='.repeat(50)}\n\n`;

    filteredMessages.forEach((message, index) => {
      const role = message.role === 'user' ? 'USER' : 'ASSISTANT';
      text += `[${role}]`;
      
      if (options.includeTimestamps && message.created_at) {
        text += ` - ${formatTimestamp(message.created_at)}`;
      }
      
      text += `\n${message.content}\n`;

      if (options.includeResumes && message.resumes && message.resumes.length > 0) {
        text += `\nMATCHING RESUMES:\n`;
        message.resumes.forEach((resume, resumeIndex) => {
          text += `  ${resumeIndex + 1}. ${resume.filename} (${Math.round(resume.similarity * 100)}% match)\n`;
        });
      }

      if (index < filteredMessages.length - 1) {
        text += `\n${'-'.repeat(30)}\n\n`;
      }
    });

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `chat-export-${timestamp}.txt`;
    
    downloadFile(text, filename, 'text/plain');
  }, [downloadFile, filterMessagesByDate, formatTimestamp]);

  const exportToCSV = useCallback((messages: Message[], options: ExportOptions) => {
    const filteredMessages = filterMessagesByDate(messages, options.dateRange);
    
    let csv = 'Role,Content,Timestamp,Resume Count,Top Resume\n';
    
    filteredMessages.forEach(message => {
      const role = message.role;
      const content = `"${message.content.replace(/"/g, '""')}"`;
      const timestamp = options.includeTimestamps && message.created_at ? 
        `"${formatTimestamp(message.created_at)}"` : '""';
      const resumeCount = message.resumes ? message.resumes.length : 0;
      const topResume = message.resumes && message.resumes[0] ? 
        `"${message.resumes[0].filename}"` : '""';
      
      csv += `${role},${content},${timestamp},${resumeCount},${topResume}\n`;
    });

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `chat-export-${timestamp}.csv`;
    
    downloadFile(csv, filename, 'text/csv');
  }, [downloadFile, filterMessagesByDate, formatTimestamp]);

  const exportToHTML = useCallback((messages: Message[], options: ExportOptions) => {
    const filteredMessages = filterMessagesByDate(messages, options.dateRange);
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat Export</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f8f9fa;
        }
        .chat-container {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .message {
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 10px;
            border-left: 4px solid #007bff;
        }
        .message.user {
            background: #e3f2fd;
            border-left-color: #2196f3;
        }
        .message.assistant {
            background: #f5f5f5;
            border-left-color: #4caf50;
        }
        .message-role {
            font-weight: bold;
            margin-bottom: 5px;
            color: #495057;
        }
        .message-timestamp {
            font-size: 0.8em;
            color: #6c757d;
            margin-left: 10px;
        }
        .resumes {
            margin-top: 15px;
            padding: 10px;
            background: rgba(0,123,255,0.1);
            border-radius: 5px;
        }
        .resume-item {
            margin: 5px 0;
            font-size: 0.9em;
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="header">
            <h1>🤖 Chat Export</h1>
            <p><strong>Export Date:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Total Messages:</strong> ${filteredMessages.length}</p>`;
    
    if (options.dateRange) {
      html += `<p><strong>Date Range:</strong> ${options.dateRange.start.toLocaleDateString()} - ${options.dateRange.end.toLocaleDateString()}</p>`;
    }
    
    html += `</div>`;

    filteredMessages.forEach(message => {
      const roleClass = message.role === 'user' ? 'user' : 'assistant';
      const roleEmoji = message.role === 'user' ? '👤' : '🤖';
      const roleText = message.role === 'user' ? 'User' : 'Assistant';
      
      html += `
        <div class="message ${roleClass}">
            <div class="message-role">
                ${roleEmoji} ${roleText}
                ${options.includeTimestamps && message.created_at ? 
                  `<span class="message-timestamp">${formatTimestamp(message.created_at)}</span>` : 
                  ''}
            </div>
            <pre>${message.content}</pre>`;
      
      if (options.includeResumes && message.resumes && message.resumes.length > 0) {
        html += `
            <div class="resumes">
                <strong>📄 Matching Resumes:</strong>
                ${message.resumes.map((resume, index) => 
                  `<div class="resume-item">${index + 1}. ${resume.filename} (${Math.round(resume.similarity * 100)}% match)</div>`
                ).join('')}
            </div>`;
      }
      
      html += `</div>`;
    });

    html += `
    </div>
</body>
</html>`;

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `chat-export-${timestamp}.html`;
    
    downloadFile(html, filename, 'text/html');
  }, [downloadFile, filterMessagesByDate, formatTimestamp]);

  const exportChat = useCallback((messages: Message[], options: ExportOptions) => {
    switch (options.format) {
      case 'json':
        exportToJSON(messages, options);
        break;
      case 'markdown':
        exportToMarkdown(messages, options);
        break;
      case 'txt':
        exportToTXT(messages, options);
        break;
      case 'csv':
        exportToCSV(messages, options);
        break;
      case 'html':
        exportToHTML(messages, options);
        break;
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }, [exportToJSON, exportToMarkdown, exportToTXT, exportToCSV, exportToHTML]);

  return {
    exportChat,
    exportToJSON,
    exportToMarkdown,
    exportToTXT,
    exportToCSV,
    exportToHTML
  };
};
