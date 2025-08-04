import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error Boundary component to catch and handle React errors gracefully
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Log to monitoring service in production
    if (import.meta.env.PROD) {
      // TODO: Send to error monitoring service (e.g., Sentry, Azure Monitor)
      this.logToMonitoringService(error, errorInfo);
    }
  }

  private logToMonitoringService(error: Error, errorInfo: ErrorInfo) {
    // In production, implement error reporting to monitoring service
    console.error('Sending error to monitoring service:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white/80 backdrop-blur-sm border border-red-200/60 rounded-2xl shadow-xl shadow-red-500/10 p-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <AlertTriangle className="h-8 w-8 text-white" />
            </div>
            
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              Oops! Something went wrong
            </h2>
            
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              We encountered an unexpected error. Don't worry, this has been logged and we'll look into it.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details className="text-left bg-red-50/80 border border-red-200/60 rounded-xl p-4 mb-6">
                <summary className="text-sm font-semibold text-red-700 cursor-pointer">
                  Error Details (Development)
                </summary>
                <div className="mt-3 text-xs text-red-600 font-mono">
                  <div className="font-semibold mb-2">{this.state.error.message}</div>
                  <pre className="whitespace-pre-wrap overflow-auto max-h-32">
                    {this.state.error.stack}
                  </pre>
                </div>
              </details>
            )}
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="group inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-500/30 transition-all duration-300"
              >
                <RefreshCw className="h-4 w-4 mr-2 group-hover:rotate-180 transition-transform duration-300" />
                Try Again
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center px-6 py-3 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook for error handling in functional components
 */
export const useErrorHandler = () => {
  const handleError = React.useCallback((error: Error, context: string = 'Unknown') => {
    console.error(`Error in ${context}:`, error);
    
    // In production, send to monitoring service
    if (import.meta.env.PROD) {
      // TODO: Send to monitoring service
      console.error('Sending error to monitoring service:', {
        error: error.message,
        context,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      });
    }
  }, []);

  return { handleError };
};
