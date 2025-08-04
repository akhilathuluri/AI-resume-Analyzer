import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Settings, RefreshCw, Zap } from 'lucide-react';
import { aiService } from '../services/aiService';

interface DiagnosticResult {
  success: boolean;
  message: string;
  details?: any;
}

interface ServiceInfo {
  configured: boolean;
  endpoint: string;
  model: string;
  status: string;
}

export function AIDiagnostics() {
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [serviceInfo, setServiceInfo] = useState<ServiceInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Get service info on component mount
    if ('getServiceInfo' in aiService) {
      const info = (aiService as any).getServiceInfo();
      setServiceInfo(info);
    }
  }, []);

  const runDiagnostic = async () => {
    setTesting(true);
    setDiagnosticResult(null);

    try {
      if ('testService' in aiService) {
        const result = await (aiService as any).testService();
        setDiagnosticResult(result);
      } else {
        setDiagnosticResult({
          success: false,
          message: 'Diagnostic not available for production AI service'
        });
      }
    } catch (error) {
      setDiagnosticResult({
        success: false,
        message: `Diagnostic failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setTesting(false);
    }
  };

  const getTokenStatus = () => {
    const token = import.meta.env.VITE_GITHUB_TOKEN;
    if (!token) return { status: 'missing', message: 'No GitHub token configured' };
    if (!token.startsWith('github_pat_')) return { status: 'invalid', message: 'Invalid token format' };
    if (token.length < 20) return { status: 'invalid', message: 'Token too short' };
    return { status: 'valid', message: `Token configured (${token.substring(0, 12)}...)` };
  };

  const tokenStatus = getTokenStatus();

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-lg p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
          <Settings className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">AI Service Diagnostics</h3>
          <p className="text-sm text-slate-600">Test and verify AI embedding service status</p>
        </div>
      </div>

      {/* Configuration Status */}
      <div className="space-y-4 mb-6">
        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/60">
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center">
            <span className="mr-2">⚙️</span>
            Configuration Status
          </h4>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>GitHub Token:</span>
              <div className="flex items-center space-x-2">
                {tokenStatus.status === 'valid' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span className={tokenStatus.status === 'valid' ? 'text-green-700' : 'text-red-700'}>
                  {tokenStatus.message}
                </span>
              </div>
            </div>
            
            {serviceInfo && (
              <>
                <div className="flex items-center justify-between">
                  <span>Endpoint:</span>
                  <span className="text-slate-600 font-mono text-xs">{serviceInfo.endpoint}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Model:</span>
                  <span className="text-slate-600">{serviceInfo.model}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Service Status:</span>
                  <div className="flex items-center space-x-2">
                    {serviceInfo.status === 'healthy' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className={serviceInfo.status === 'healthy' ? 'text-green-700' : 'text-yellow-700'}>
                      {serviceInfo.status}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Test Button */}
        <div className="text-center">
          <button
            onClick={runDiagnostic}
            disabled={testing || tokenStatus.status !== 'valid'}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {testing ? (
              <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Zap className="h-5 w-5 mr-2" />
            )}
            {testing ? 'Testing AI Service...' : 'Test AI Service'}
          </button>
        </div>

        {/* Diagnostic Results */}
        {diagnosticResult && (
          <div className={`p-4 rounded-xl border ${
            diagnosticResult.success 
              ? 'bg-green-50/80 border-green-200/60' 
              : 'bg-red-50/80 border-red-200/60'
          }`}>
            <div className="flex items-start space-x-3">
              {diagnosticResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`font-medium ${
                  diagnosticResult.success ? 'text-green-900' : 'text-red-900'
                }`}>
                  {diagnosticResult.message}
                </p>
                
                {diagnosticResult.details && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="text-sm text-slate-600 hover:text-slate-800 underline"
                    >
                      {showDetails ? 'Hide' : 'Show'} Details
                    </button>
                    
                    {showDetails && (
                      <pre className="mt-2 p-3 bg-slate-100 rounded-lg text-xs overflow-auto">
                        {JSON.stringify(diagnosticResult.details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200/60">
          <h4 className="font-semibold text-blue-900 mb-2">💡 Setup Instructions</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <p>1. Get a GitHub token with Models access from: <strong>GitHub Settings → Developer Settings → Personal Access Tokens</strong></p>
            <p>2. Ensure the token has <strong>Models</strong> scope enabled</p>
            <p>3. Add the token to your <code>.env</code> file as: <code>VITE_GITHUB_TOKEN=your_token_here</code></p>
            <p>4. Restart the development server after updating the token</p>
          </div>
        </div>
      </div>
    </div>
  );
}
