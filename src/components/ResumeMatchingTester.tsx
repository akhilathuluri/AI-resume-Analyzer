import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { resumeMatchingService } from '../services/resumeMatchingService';

export const ResumeMatchingTester: React.FC = () => {
  const { user } = useAuth();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [testInput, setTestInput] = useState('Software engineer with React and JavaScript experience');

  const testMatching = async () => {
    if (!user) return;

    setLoading(true);
    try {
      console.log('🧪 Testing resume matching with input:', testInput);
      
      const matches = await resumeMatchingService.findSimilarResumes(user, testInput, 10);
      
      console.log('📊 Raw matching results:', matches);
      
      // Log each match in detail
      matches.forEach((match, index) => {
        console.log(`Match ${index + 1}:`, {
          id: match.id,
          filename: match.filename,
          similarity: match.similarity,
          file_path: match.file_path,
          content_preview: match.content?.substring(0, 100) + '...'
        });
      });
      
      setResults(matches);
    } catch (error) {
      console.error('❌ Resume matching test failed:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Resume Matching Tester</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Test Job Description:
          </label>
          <textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            className="w-full h-24 p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter a job description to test matching..."
          />
        </div>
        
        <button
          onClick={testMatching}
          disabled={loading || !user}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Testing...' : 'Test Resume Matching'}
        </button>
        
        {results.length > 0 && (
          <div className="mt-6">
            <h4 className="font-medium text-gray-900 mb-3">Matching Results:</h4>
            <div className="space-y-3">
              {results.map((match, index) => (
                <div key={match.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900">
                        #{index + 1}: 
                        <code className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">
                          {match.filename}
                        </code>
                      </h5>
                      <p className="text-sm text-gray-600 mt-1">
                        ID: <code className="bg-gray-100 px-1 rounded">{match.id}</code>
                      </p>
                      <p className="text-sm text-gray-600">
                        Path: <code className="bg-gray-100 px-1 rounded">{match.file_path}</code>
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-600">
                        {Math.round(match.similarity * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">
                        Raw: {match.similarity.toFixed(4)}
                      </div>
                    </div>
                  </div>
                  
                  {match.content && (
                    <div className="mt-3 p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-600 mb-1">Content Preview:</p>
                      <p className="text-sm text-gray-800 line-clamp-3">
                        {match.content.substring(0, 200)}...
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
