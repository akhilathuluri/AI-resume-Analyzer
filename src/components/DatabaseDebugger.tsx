import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ResumeDebugInfo {
  id: string;
  filename: string;
  content_preview: string;
  file_path: string;
  embedding_status: string;
  embedding_dimensions: number;
  created_at: string;
}

export const DatabaseDebugger: React.FC = () => {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<ResumeDebugInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debugDatabase = async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get all resumes for the user
      const { data, error: dbError } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (dbError) throw dbError;

      const debugInfo: ResumeDebugInfo[] = (data || []).map(resume => {
        let embeddingStatus = 'No embedding';
        let embeddingDimensions = 0;

        if (resume.embedding) {
          try {
            const embeddingArray = typeof resume.embedding === 'string' 
              ? JSON.parse(resume.embedding) 
              : resume.embedding;
            
            if (Array.isArray(embeddingArray)) {
              embeddingStatus = 'Valid embedding';
              embeddingDimensions = embeddingArray.length;
            } else {
              embeddingStatus = 'Invalid embedding format';
            }
          } catch (e) {
            embeddingStatus = 'Corrupted embedding data';
          }
        }

        return {
          id: resume.id,
          filename: resume.filename || 'NO FILENAME',
          content_preview: (resume.content || '').substring(0, 100) + '...',
          file_path: resume.file_path || 'NO FILE PATH',
          embedding_status: embeddingStatus,
          embedding_dimensions: embeddingDimensions,
          created_at: resume.created_at
        };
      });

      setResumes(debugInfo);
      console.log('Database Debug Results:', debugInfo);
    } catch (err) {
      console.error('Database debug error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fixCorruptedFilenames = async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    const confirmFix = confirm(
      '🔧 Fix Corrupted Filenames\n\n' +
      'This will attempt to restore proper filenames for your uploaded files.\n\n' +
      'Files with corrupted names (like "0.28416589324250796.txt") will be renamed to "Resume_[timestamp].ext"\n\n' +
      'This operation cannot be undone. Continue?'
    );

    if (!confirmFix) return;

    setLoading(true);
    setError(null);

    try {
      // Get all resumes with corrupted filenames (filenames that start with decimal numbers)
      const { data: corruptedResumes, error: fetchError } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', user.id);

      if (fetchError) throw fetchError;

      const toFix = (corruptedResumes || []).filter(resume => {
        const filename = resume.filename || '';
        // Check if filename starts with a decimal number (corrupted)
        return /^0\.\d+/.test(filename);
      });

      if (toFix.length === 0) {
        alert('No corrupted filenames found to fix!');
        return;
      }

      console.log(`Found ${toFix.length} corrupted filenames to fix`);

      let fixedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < toFix.length; i++) {
        const resume = toFix[i];
        try {
          // Extract extension from current filename
          const ext = resume.filename.split('.').pop() || 'txt';
          
          // Create a proper filename based on content or timestamp
          let newFilename = '';
          
          if (resume.content) {
            // Try to extract a name from content
            const contentLines = resume.content.split('\n').slice(0, 10);
            const nameMatch = contentLines.join(' ').match(/(?:name|Name|NAME)[\s:]*([A-Z][a-z]+ [A-Z][a-z]+)/);
            
            if (nameMatch && nameMatch[1]) {
              const extractedName = nameMatch[1].replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
              newFilename = `${extractedName}_Resume_${i + 1}.${ext}`;
            }
          }
          
          // Fallback to timestamp-based name if no name found
          if (!newFilename) {
            const baseTimestamp = new Date(resume.created_at).getTime();
            // Add index to make each filename unique
            const uniqueTimestamp = baseTimestamp + i;
            newFilename = `Resume_${uniqueTimestamp}.${ext}`;
          }

          // Update the filename in database
          const { error: updateError } = await supabase
            .from('resumes')
            .update({ filename: newFilename })
            .eq('id', resume.id);

          if (updateError) {
            console.error(`Failed to fix ${resume.filename}:`, updateError);
            failedCount++;
          } else {
            console.log(`Fixed: ${resume.filename} → ${newFilename}`);
            fixedCount++;
          }
        } catch (err) {
          console.error(`Error fixing ${resume.filename}:`, err);
          failedCount++;
        }
      }

      alert(`Filename Fix Complete!\n\n✅ Fixed: ${fixedCount}\n❌ Failed: ${failedCount}`);
      
      // Refresh the data
      debugDatabase();
      
    } catch (err) {
      console.error('Error fixing filenames:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const testResumeMatching = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Import the service dynamically
      const { resumeMatchingService } = await import('../services/resumeMatchingService');
      
      const testJobDescription = "Software engineer with React and JavaScript experience";
      const matches = await resumeMatchingService.findSimilarResumes(user, testJobDescription, 5);
      
      console.log('Test Resume Matching Results:', matches);
      alert(`Found ${matches.length} matches. Check console for details.`);
      
    } catch (err) {
      console.error('Resume matching test error:', err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      debugDatabase();
    }
  }, [user]);

  if (!user) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <p className="text-gray-600">Please sign in to debug database</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">Database Debugger</h3>
        
        <div className="flex space-x-4 mb-4">
          <button
            onClick={debugDatabase}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh Database Info'}
          </button>
          
          <button
            onClick={fixCorruptedFilenames}
            disabled={loading}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
          >
            🔧 Fix Corrupted Filenames
          </button>
          
          <button
            onClick={testResumeMatching}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            Test Resume Matching
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
            <p className="text-sm text-gray-600">
              Total resumes: {resumes.length}<br/>
              With embeddings: {resumes.filter(r => r.embedding_status === 'Valid embedding').length}<br/>
              Without embeddings: {resumes.filter(r => r.embedding_status === 'No embedding').length}
            </p>
          </div>

          {resumes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Filename</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">File Path</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Content Preview</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Embedding Status</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Dimensions</th>
                    <th className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {resumes.map((resume, index) => (
                    <tr key={resume.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 px-3 py-2 text-sm">
                        <code className="bg-yellow-100 px-1 py-0.5 rounded text-xs">
                          {resume.filename}
                        </code>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">
                        <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">
                          {resume.file_path}
                        </code>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm max-w-xs truncate">
                        {resume.content_preview}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                          resume.embedding_status === 'Valid embedding' 
                            ? 'bg-green-100 text-green-800' 
                            : resume.embedding_status === 'No embedding'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {resume.embedding_status}
                        </span>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">
                        {resume.embedding_dimensions > 0 ? resume.embedding_dimensions : '-'}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">
                        {new Date(resume.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No resumes found in database
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
