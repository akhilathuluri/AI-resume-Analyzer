import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Upload, File, Trash2, Eye, Search, RefreshCw, Mail, MessageSquare, FileDown, Users, Zap, Folder, FolderPlus, ChevronRight, Home } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sendBulkEmail, extractEmailFromContent, validateEmail, type EmailResult } from '../lib/emailServiceBrowser'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

// Set up PDF.js worker with reliable CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

interface Resume {
  id: string
  filename: string
  file_size: number
  file_type: string
  created_at: string
  updated_at: string
  user_id: string
  file_path: string
  content?: string
  embedding?: number[] | null
  has_content?: boolean // Flag to indicate if content exists without loading it
  folder_id?: string | null
}

interface Folder {
  id: string
  name: string
  path: string
  parent_folder_id: string | null
  user_id: string
  created_at: string
  updated_at: string
}

export function FilesPage() {
  const { user } = useAuth()
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null)
  
  // Folder-related state
  const [folders, setFolders] = useState<Folder[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [currentFolderPath, setCurrentFolderPath] = useState<string[]>(['Home'])
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(12) // Default 12 items per page
  const [totalPages, setTotalPages] = useState(0)
  
  // Upload progress tracking
  const [uploadProgress, setUploadProgress] = useState<{
    total: number
    completed: number
    failed: number
    current: string
  }>({ total: 0, completed: 0, failed: 0, current: '' })
  
  // New state for bulk operations
  const [selectedResumes, setSelectedResumes] = useState<string[]>([])
  const [showBulkCommunication, setShowBulkCommunication] = useState(false)
  const [showCommunicationHistory, setShowCommunicationHistory] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')
  const [bulkTitle, setBulkTitle] = useState('')
  const [communications, setCommunications] = useState<any[]>([])
  
  // State for processing existing files
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)
  const [processingProgress, setProcessingProgress] = useState<{
    processed: number
    total: number
    currentFile: string
  }>({ processed: 0, total: 0, currentFile: '' })
  const [loadingCommunications, setLoadingCommunications] = useState(false)
  const [sendRealEmails, setSendRealEmails] = useState(false)
  const [emailSending, setEmailSending] = useState(false)

  // Show notification
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  // Folder operations
  const fetchFolders = useCallback(async () => {
    if (!user) return

    try {
      let query = supabase
        .from('folders')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true })

      // Handle null parent_folder_id correctly
      if (currentFolderId === null) {
        query = query.is('parent_folder_id', null)
      } else {
        query = query.eq('parent_folder_id', currentFolderId)
      }

      const { data, error } = await query

      if (error) throw error
      setFolders(data || [])
    } catch (error) {
      console.error('Error fetching folders:', error)
      showNotification('Error loading folders', 'error')
    }
  }, [user, currentFolderId])

  // Create new folder
  const createFolder = async () => {
    if (!user || !newFolderName.trim()) return

    setCreatingFolder(true)
    try {
      const folderPath = currentFolderPath.length > 1 
        ? `${currentFolderPath.slice(1).join('/')}/${newFolderName.trim()}`
        : newFolderName.trim()

      const { error } = await supabase
        .from('folders')
        .insert([{
          name: newFolderName.trim(),
          path: folderPath,
          parent_folder_id: currentFolderId,
          user_id: user.id
        }])

      if (error) throw error

      await fetchFolders()
      setNewFolderName('')
      setShowCreateFolder(false)
      showNotification('Folder created successfully', 'success')
    } catch (error) {
      console.error('Error creating folder:', error)
      showNotification('Error creating folder', 'error')
    } finally {
      setCreatingFolder(false)
    }
  }

  // Navigate into folder
  const navigateToFolder = (folder: Folder) => {
    setCurrentFolderId(folder.id)
    setCurrentFolderPath(prev => [...prev, folder.name])
    setCurrentPage(1) // Reset to first page when navigating
  }

  // Navigate to parent folder or home
  const navigateBack = () => {
    if (currentFolderPath.length <= 1) {
      setCurrentFolderId(null)
      setCurrentFolderPath(['Home'])
    } else {
      setCurrentFolderId(null) // Will be set correctly by finding parent
      setCurrentFolderPath(prev => prev.slice(0, -1))
      
      // If not at root, find the parent folder
      if (currentFolderPath.length > 2) {
        const parentPath = currentFolderPath.slice(1, -1).join('/')
        const parentFolder = folders.find(f => f.path === parentPath)
        if (parentFolder) {
          setCurrentFolderId(parentFolder.id)
        }
      }
    }
    setCurrentPage(1) // Reset to first page when navigating
  }

  // Navigate to specific breadcrumb level
  const navigateToBreadcrumb = (index: number) => {
    if (index === 0) {
      setCurrentFolderId(null)
      setCurrentFolderPath(['Home'])
    } else {
      // For now, we'll implement a simpler version that just goes back step by step
      const newPath = currentFolderPath.slice(0, index + 1)
      setCurrentFolderPath(newPath)
      
      if (newPath.length > 1) {
        // This would require a more complex lookup - for now keeping it simple
        setCurrentFolderId(null) // Will be properly handled when we implement folder lookup
      } else {
        setCurrentFolderId(null)
      }
    }
    setCurrentPage(1) // Reset to first page when navigating
  }

  // Delete folder (only if empty)
  const deleteFolder = async (folderId: string, folderName: string) => {
    if (!confirm(`Are you sure you want to delete the folder "${folderName}"? This will only work if the folder is empty.`)) {
      return
    }

    try {
      // Check if folder has any resumes
      const { data: resumesInFolder, error: resumeCheckError } = await supabase
        .from('resumes')
        .select('id')
        .eq('folder_id', folderId)
        .limit(1)

      if (resumeCheckError) throw resumeCheckError

      if (resumesInFolder && resumesInFolder.length > 0) {
        showNotification('Cannot delete folder that contains resumes. Move or delete the resumes first.', 'error')
        return
      }

      // Check if folder has subfolders
      const { data: subfolders, error: subfolderCheckError } = await supabase
        .from('folders')
        .select('id')
        .eq('parent_folder_id', folderId)
        .limit(1)

      if (subfolderCheckError) throw subfolderCheckError

      if (subfolders && subfolders.length > 0) {
        showNotification('Cannot delete folder that contains subfolders. Delete the subfolders first.', 'error')
        return
      }

      // Delete the folder
      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId)

      if (error) throw error

      await fetchFolders()
      showNotification('Folder deleted successfully', 'success')
    } catch (error) {
      console.error('Error deleting folder:', error)
      showNotification('Error deleting folder', 'error')
    }
  }

  // Add caching and prevent unnecessary refetches
  const lastFetchTime = useRef<number>(0)
  const currentFolderRef = useRef<string | null>(currentFolderId)
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes cache
  
  // PERFORMANCE OPTIMIZATION: Only fetch essential fields to prevent timeout errors
  // Content and embeddings are loaded on-demand when needed
  const fetchResumes = useCallback(async (forceRefresh: boolean = false) => {
    if (!user) return

    const now = Date.now()
    const timeSinceLastFetch = now - lastFetchTime.current

    console.log(`[fetchResumes] Called with forceRefresh=${forceRefresh}, folder=${currentFolderId}, timeSinceLastFetch=${timeSinceLastFetch}ms`)

    // Skip fetch if data is fresh and not forced
    if (!forceRefresh && timeSinceLastFetch < CACHE_DURATION && resumes.length > 0) {
      console.log('[fetchResumes] Using cached resume data')
      return
    }

    // Only show loading spinner if this is not a background refresh
    if (resumes.length === 0 || forceRefresh) {
      setLoading(true)
    }
    
    try {
      // Fetch essential fields first, including embedding status and folder_id
      let query = supabase
        .from('resumes')
        .select(`
          id,
          filename,
          file_path,
          file_size,
          file_type,
          created_at,
          updated_at,
          user_id,
          embedding,
          folder_id
        `)
        .eq('user_id', user.id)

      // Filter by current folder
      if (currentFolderId) {
        query = query.eq('folder_id', currentFolderId)
      } else {
        query = query.is('folder_id', null)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error
      
      // Process the data and preserve embedding status
      const resumesWithStatus = (data || []).map((resume: any) => ({
        id: resume.id,
        filename: resume.filename,
        file_path: resume.file_path,
        file_size: resume.file_size,
        file_type: resume.file_type,
        created_at: resume.created_at,
        updated_at: resume.updated_at,
        user_id: resume.user_id,
        content: '', // Will be loaded on-demand for UI
        embedding: resume.embedding,
        folder_id: resume.folder_id
      }))
      
      setResumes(resumesWithStatus)
      lastFetchTime.current = now
      setInitialLoading(false)
    } catch (error) {
      console.error('Error fetching resumes:', error)
      // Only clear on actual error, not on navigation
      if (!resumes.length) {
        setResumes([])
      }
      setInitialLoading(false)
    } finally {
      setLoading(false)
    }
  }, [user, currentFolderId]) // Removed resumes.length to prevent infinite loop

  // Batch load content for multiple resumes (useful for bulk operations)
  const loadMultipleResumeContent = useCallback(async (resumeIds: string[]) => {
    if (!user || resumeIds.length === 0) return []

    try {
      const { data, error } = await supabase
        .from('resumes')
        .select('id, filename, content, embedding')
        .eq('user_id', user.id)
        .in('id', resumeIds)

      if (error) throw error
      
      // Update all the resumes in state with content and embedding
      setResumes(prevResumes => 
        prevResumes.map(resume => {
          const updatedData = data?.find(d => d.id === resume.id)
          return updatedData 
            ? { ...resume, content: updatedData.content, embedding: updatedData.embedding }
            : resume
        })
      )
      
      return data || []
    } catch (error) {
      console.error('Error loading multiple resume content:', error)
      return []
    }
  }, [user])

  // Clean up duplicate records
  const cleanupDuplicates = async () => {
    if (!user) return;

    try {
      showNotification('Checking for duplicate records...', 'info');

      // Find duplicates based on filename and user_id
      const { data: allResumes, error: fetchError } = await supabase
        .from('resumes')
        .select('id, filename, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }); // Older records first

      if (fetchError) throw fetchError;

      if (!allResumes || allResumes.length === 0) {
        showNotification('No resumes found', 'info');
        return;
      }

      // Group by filename to find duplicates
      const filenameGroups = new Map<string, typeof allResumes>();
      
      allResumes.forEach(resume => {
        const filename = resume.filename;
        if (!filenameGroups.has(filename)) {
          filenameGroups.set(filename, []);
        }
        filenameGroups.get(filename)!.push(resume);
      });

      // Find duplicates (groups with more than 1 resume)
      const duplicateGroups = Array.from(filenameGroups.entries())
        .filter(([_, group]) => group.length > 1);

      if (duplicateGroups.length === 0) {
        showNotification('No duplicate records found', 'info');
        return;
      }

      const totalDuplicates = duplicateGroups.reduce((sum, [_, group]) => sum + group.length - 1, 0);

      if (!confirm(
        `Found ${duplicateGroups.length} files with duplicates (${totalDuplicates} duplicate records total).\n\n` +
        `This will keep the oldest record for each filename and delete the duplicates.\n\n` +
        `Continue with cleanup?`
      )) {
        return;
      }

      let deletedCount = 0;

      // For each duplicate group, keep the oldest (first) record and delete the rest
      for (const [filename, group] of duplicateGroups) {
        if (group.length > 1) {
          // Keep the first (oldest) record, delete the rest
          const recordsToDelete = group.slice(1);
          const idsToDelete = recordsToDelete.map(r => r.id);

          console.log(`Deleting ${idsToDelete.length} duplicate records for ${filename}`);

          const { error: deleteError } = await supabase
            .from('resumes')
            .delete()
            .in('id', idsToDelete);

          if (deleteError) {
            console.error(`Error deleting duplicates for ${filename}:`, deleteError);
          } else {
            deletedCount += idsToDelete.length;
          }
        }
      }

      showNotification(`✅ Cleanup complete! Deleted ${deletedCount} duplicate records.`, 'success');
      
      // Refresh the list
      await fetchResumes(true);
      await updateStorageStats();

    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      showNotification('Error during duplicate cleanup', 'error');
    }
  };

  // Manual refresh function
  const handleRefresh = async () => {
    await cleanupOrphanedRecords()
    await fetchResumes(true) // Force refresh
    await updateStorageStats()
  }

  // Clean up orphaned database records (files deleted directly from storage)
  const cleanupOrphanedRecords = async () => {
    if (!user) return

    // Prevent multiple simultaneous executions
    if (isProcessingFiles) {
      return // Silent return to avoid notification spam
    }

    try {
      showNotification('Checking for orphaned records and new files...', 'info')
      
      // Step 1: Get all database records
      const { data: resumes, error } = await supabase
        .from('resumes')
        .select('id, file_path, filename')
        .eq('user_id', user.id)

      if (error) throw error

      // Step 2: Get all files in storage for this user
      const { data: storageFiles, error: storageError } = await supabase.storage
        .from('resumes')
        .list(user.id, {
          limit: 10000, // High limit to get all files
          sortBy: { column: 'name', order: 'asc' }
        })

      if (storageError) throw storageError

      const orphanedIds: string[] = []
      const newFiles: Array<{name: string, size: number, updated_at: string}> = []

      // Step 3: Check for orphaned database records (files that don't exist in storage)
      if (resumes && resumes.length > 0) {
        const storageFileNames = new Set(storageFiles?.map(f => f.name) || [])
        
        for (const resume of resumes) {
          // Use the actual storage filename from file_path, not the display filename
          const storageFileName = resume.file_path.split('/').pop() || resume.filename
          if (!storageFileNames.has(storageFileName)) {
            console.log(`Found orphaned record: ${resume.filename} (storage: ${storageFileName})`)
            orphanedIds.push(resume.id)
          }
        }
      }

      // Step 4: Check for new files in storage that don't have database records
      if (storageFiles && storageFiles.length > 0) {
        // Create a set of actual storage filenames from file_paths in database
        const existingStorageFileNames = new Set(resumes?.map(r => r.file_path.split('/').pop() || r.filename) || [])
        
        for (const storageFile of storageFiles) {
          if (!existingStorageFileNames.has(storageFile.name)) {
            console.log(`Found new storage file: ${storageFile.name}`)
            newFiles.push({
              name: storageFile.name,
              size: storageFile.metadata?.size || 0,
              updated_at: storageFile.updated_at || new Date().toISOString()
            })
          }
        }
      }

      let cleanupCount = 0
      let addedCount = 0

      // Step 5: Delete orphaned records
      if (orphanedIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('resumes')
          .delete()
          .in('id', orphanedIds)

        if (deleteError) throw deleteError
        cleanupCount = orphanedIds.length
      }

      // Step 6: Add new files found in storage (with duplicate prevention)
      if (newFiles.length > 0) {
        console.log(`Found ${newFiles.length} potential new files to add`);
        
        // Get ALL existing records for this user to do comprehensive duplicate checking
        const { data: allExistingRecords, error: checkError } = await supabase
          .from('resumes')
          .select('filename, file_path')
          .eq('user_id', user.id);

        if (checkError) {
          console.error('Error checking for existing records:', checkError);
          // Continue without duplicate prevention rather than failing
        }

        const existingFilenames = new Set(allExistingRecords?.map(r => r.filename) || []);
        const existingFilePaths = new Set(allExistingRecords?.map(r => r.file_path) || []);

        console.log(`Existing filenames: ${Array.from(existingFilenames).join(', ')}`);
        console.log(`Existing file paths: ${Array.from(existingFilePaths).join(', ')}`);

        // Filter out files that already exist
        const filesToAdd = newFiles.filter(file => {
          const filePath = `${user.id}/${file.name}`;
          const existsByFilename = existingFilenames.has(file.name);
          const existsByPath = existingFilePaths.has(filePath);
          
          if (existsByFilename || existsByPath) {
            console.log(`Skipping duplicate: ${file.name} (filename exists: ${existsByFilename}, path exists: ${existsByPath})`);
            return false;
          }
          
          console.log(`Will add new file: ${file.name} (path: ${filePath})`);
          return true;
        });

        console.log(`After duplicate filtering: ${filesToAdd.length} files to add`);

        if (filesToAdd.length > 0) {
          const newRecords = filesToAdd.map(file => ({
            user_id: user.id,
            filename: file.name,
            file_path: `${user.id}/${file.name}`,
            file_size: file.size,
            file_type: file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 
                      file.name.toLowerCase().endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                      file.name.toLowerCase().endsWith('.doc') ? 'application/msword' :
                      'text/plain',
            content: '', // Empty string to satisfy NOT NULL constraint - will be populated by "Process Files"
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }))

          console.log(`Inserting ${newRecords.length} new records:`, newRecords.map(r => r.filename));

          const { error: insertError } = await supabase
            .from('resumes')
            .insert(newRecords)

          if (insertError) {
            console.error('Error inserting new records:', insertError);
            
            // If it's a unique constraint violation, it means duplicates were caught at DB level
            if (insertError.message?.includes('duplicate key') || 
                insertError.message?.includes('unique constraint') ||
                insertError.message?.includes('already exists')) {
              console.log('Database prevented duplicate insertion - this is expected behavior');
              addedCount = 0;
            } else {
              // For other errors, log but don't fail the entire operation
              console.error('Unexpected database error during insertion:', insertError);
              addedCount = 0;
            }
          } else {
            addedCount = filesToAdd.length;
            console.log(`Successfully inserted ${addedCount} new records`);
          }
        } else {
          console.log('No new files to add (all already exist in database)');
          addedCount = 0;
        }
      }

      // Show results
      if (cleanupCount > 0 && addedCount > 0) {
        showNotification(`Cleaned up ${cleanupCount} orphaned records and added ${addedCount} new files from storage`, 'success')
      } else if (cleanupCount > 0) {
        showNotification(`Cleaned up ${cleanupCount} orphaned records`, 'success')
      } else if (addedCount > 0) {
        showNotification(`Added ${addedCount} new files from storage`, 'success')
      } else {
        showNotification('No changes needed - database and storage are in sync', 'info')
      }
      
      // Final safety check: Run duplicate cleanup if any records were added
      if (addedCount > 0) {
        console.log('Running final duplicate cleanup check after adding new records...');
        // Small delay to ensure database consistency
        await new Promise(resolve => setTimeout(resolve, 500));
        await cleanupDuplicates();
      }
      
      // Refresh the list and storage stats
      if (cleanupCount > 0 || addedCount > 0) {
        await fetchResumes(true) // Force refresh after changes
        await updateStorageStats()
      }

    } catch (error) {
      console.error('Error during cleanup and sync:', error)
      showNotification('Error during cleanup and sync', 'error')
    }
  }

  useEffect(() => {
    const initializeData = async () => {
      const folderChanged = currentFolderRef.current !== currentFolderId
      currentFolderRef.current = currentFolderId
      
      // Only cleanup and fetch if we don't have recent data
      if (resumes.length === 0 || Date.now() - lastFetchTime.current > CACHE_DURATION) {
        await cleanupOrphanedRecords()
        await fetchResumes(false) // Use cache if available
      } else if (folderChanged) {
        // If folder changed but we have fresh data, force refresh for new folder
        await fetchResumes(true) // Force refresh only when folder changes
      }
      // Always fetch folders for current directory  
      await fetchFolders()
    }
    initializeData()
  }, [fetchResumes, fetchFolders, user, currentFolderId])

  // Check for data consistency when component becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        // Only fetch if data is stale (older than cache duration)
        const timeSinceLastFetch = Date.now() - lastFetchTime.current
        if (timeSinceLastFetch > CACHE_DURATION) {
          fetchResumes(false) // Use cache-aware fetch
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchResumes, user])

  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      
      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer,
        useSystemFonts: true,
        disableAutoFetch: true
      })
      
      const pdf = await loadingTask.promise
      let fullText = ''

      // Extract text from each page
      for (let i = 1; i <= pdf.numPages; i++) {
        try {
          const page = await pdf.getPage(i)
          const textContent = await page.getTextContent()
          const pageText = textContent.items
            .map((item: any) => item.str || '')
            .join(' ')
          fullText += pageText + '\n'
        } catch (pageError) {
          console.warn(`Error extracting text from page ${i}:`, pageError)
          // Continue with other pages even if one fails
        }
      }

      return fullText.trim() || 'No text content could be extracted from this PDF'
    } catch (error) {
      console.error('Error extracting text from PDF:', error)
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('worker')) {
          throw new Error('PDF processing failed. Please try again or check your internet connection.')
        } else if (error.message.includes('Invalid PDF')) {
          throw new Error('This PDF file appears to be corrupted or invalid.')
        } else if (error.message.includes('password')) {
          throw new Error('This PDF is password protected and cannot be processed.')
        }
      }
      
      throw new Error('Failed to extract text from PDF. The file may be corrupted or contain only images.')
    }
  }

  const extractTextFromDOCX = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      
      // Extract text using mammoth
      const result = await mammoth.extractRawText({ arrayBuffer })
      
      // Only log warnings if they're significant
      if (result.messages && result.messages.length > 0) {
        const significantWarnings = result.messages.filter(msg => 
          msg.type === 'error' || (msg.type === 'warning' && !msg.message.includes('style'))
        )
        if (significantWarnings.length > 0) {
          console.warn('DOCX processing issues:', significantWarnings)
        }
      }
      
      const text = result.value.trim()
      return text || 'No text content could be extracted from this DOCX document'
    } catch (error) {
      console.error('Error extracting text from DOCX:', error)
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('zip')) {
          throw new Error('This DOCX file appears to be corrupted or invalid.')
        } else if (error.message.includes('password') || error.message.includes('encrypted')) {
          throw new Error('This DOCX file is password protected and cannot be processed.')
        }
      }
      
      throw new Error('Failed to extract text from DOCX. The file may be corrupted or in an unsupported format.')
    }
  }

  const extractTextFromFile = async (file: File): Promise<string> => {
    let rawText = ''
    
    if (file.type === 'application/pdf') {
      rawText = await extractTextFromPDF(file)
    } else if (file.type === 'text/plain') {
      rawText = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          const text = event.target?.result as string
          resolve(text)
        }
        reader.onerror = reject
        reader.readAsText(file)
      })
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      rawText = await extractTextFromDOCX(file)
    } else {
      throw new Error('Unsupported file type. Please upload PDF, TXT, or DOCX files.')
    }
    
    // Return both raw text and preprocessed text
    // Store raw text for display, use preprocessed for embeddings
    return rawText
  }

  // Enhanced embedding cache for performance
  const embeddingCache = useRef(new Map<string, number[]>())

  // Clear cache on component mount and update for current embedding dimensions
  useEffect(() => {
    // Clear any cached embeddings and update cache key for current setup
    embeddingCache.current.clear()
    console.log('Cleared embedding cache - ready for current embedding dimensions')
  }, [])

  // Enhanced cosine similarity with hybrid scoring
  // const calculateEnhancedSimilarity = useCallback((
  //   embedding1: number[], 
  //   embedding2: number[], 
  //   text1: string, 
  //   text2: string
  // ): number => {
  //   if (!embedding1?.length || !embedding2?.length) {
  //     console.warn('Missing embeddings for similarity calculation')
  //     return 0
  //   }
    
  //   // Check dimension compatibility
  //   if (embedding1.length !== embedding2.length) {
  //     console.warn(`Dimension mismatch: ${embedding1.length} vs ${embedding2.length}`)
  //     return 0
  //   }
    
  //   // Calculate cosine similarity (primary score - 70% weight)
  //   const dotProduct = embedding1.reduce((sum, a, i) => sum + a * embedding2[i], 0)
  //   const magnitude1 = Math.sqrt(embedding1.reduce((sum, a) => sum + a * a, 0))
  //   const magnitude2 = Math.sqrt(embedding2.reduce((sum, a) => sum + a * a, 0))
    
  //   if (magnitude1 === 0 || magnitude2 === 0) {
  //     console.warn('Zero magnitude vector detected')
  //     return 0
  //   }
    
  //   const cosineSim = dotProduct / (magnitude1 * magnitude2)
    
  //   // Ensure cosine similarity is in valid range [-1, 1] and convert to [0, 1]
  //   const normalizedCosineSim = Math.max(0, (cosineSim + 1) / 2)
    
  //   console.log(`Cosine similarity: ${cosineSim.toFixed(4)} (normalized: ${normalizedCosineSim.toFixed(4)})`)
    
  //   // Keyword overlap score (20% weight)
  //   const keywords1 = text1.toLowerCase().split(/\s+/).filter(word => word.length > 3)
  //   const keywords2 = text2.toLowerCase().split(/\s+/).filter(word => word.length > 3)
  //   const intersection = keywords1.filter(k => keywords2.includes(k))
  //   const keywordScore = intersection.length / Math.max(keywords1.length, keywords2.length, 1)
    
  //   // Section structure similarity (10% weight)
  //   const sections1 = (text1.match(/\b(education|experience|skills|projects|achievements|work|employment)\b/gi) || []).length
  //   const sections2 = (text2.match(/\b(education|experience|skills|projects|achievements|work|employment)\b/gi) || []).length
  //   const sectionScore = Math.min(sections1, sections2) / Math.max(sections1, sections2, 1)
    
  //   // Combined score - use normalized cosine similarity
  //   const finalScore = (normalizedCosineSim * 0.7) + (keywordScore * 0.2) + (sectionScore * 0.1)
    
  //   console.log(`Final similarity score: ${finalScore.toFixed(4)} (${(finalScore * 100).toFixed(1)}%)`)
    
  //   return finalScore
  // }, [])

  // Enhanced text preprocessing for better embedding quality
  const preprocessTextForEmbedding = useCallback((text: string): string => {
    // Extract key sections and important keywords
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    
    const importantSections = []
    const skillKeywords = [
      'javascript', 'typescript', 'python', 'react', 'node', 'sql', 'aws', 'azure', 'docker',
      'kubernetes', 'git', 'agile', 'scrum', 'machine learning', 'ai', 'api', 'database',
      'frontend', 'backend', 'fullstack', 'mobile', 'web', 'cloud', 'devops', 'ci/cd'
    ]
    
    const experienceKeywords = [
      'years', 'experience', 'senior', 'lead', 'manager', 'director', 'architect',
      'developed', 'implemented', 'managed', 'designed', 'built', 'created', 'led'
    ]
    
    // Extract contact information
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g
    
    const emails = text.match(emailRegex) || []
    const phones = text.match(phoneRegex) || []
    
    if (emails.length > 0) importantSections.push(`Email: ${emails[0]}`)
    if (phones.length > 0) importantSections.push(`Phone: ${phones[0]}`)
    
    // Extract education section
    const educationLines = lines.filter(line => {
      const lower = line.toLowerCase()
      return lower.includes('education') || lower.includes('university') || 
             lower.includes('college') || lower.includes('degree') || 
             lower.includes('bachelor') || lower.includes('master') || lower.includes('phd')
    })
    
    if (educationLines.length > 0) {
      importantSections.push('EDUCATION:')
      importantSections.push(...educationLines.slice(0, 3))
    }
    
    // Extract skills section
    const skillLines = lines.filter(line => {
      const lower = line.toLowerCase()
      return lower.includes('skill') || lower.includes('technolog') || 
             lower.includes('programming') || lower.includes('language') ||
             skillKeywords.some(skill => lower.includes(skill))
    })
    
    if (skillLines.length > 0) {
      importantSections.push('SKILLS:')
      importantSections.push(...skillLines.slice(0, 5))
    }
    
    // Extract experience section
    const experienceLines = lines.filter(line => {
      const lower = line.toLowerCase()
      return lower.includes('experience') || lower.includes('work') || 
             lower.includes('employment') || lower.includes('position') ||
             experienceKeywords.some(exp => lower.includes(exp))
    })
    
    if (experienceLines.length > 0) {
      importantSections.push('EXPERIENCE:')
      importantSections.push(...experienceLines.slice(0, 8))
    }
    
    // Add key achievements and projects
    const achievementLines = lines.filter(line => {
      const lower = line.toLowerCase()
      return lower.includes('project') || lower.includes('achievement') || 
             lower.includes('accomplishment') || lower.includes('award') ||
             lower.includes('certification')
    })
    
    if (achievementLines.length > 0) {
      importantSections.push('PROJECTS & ACHIEVEMENTS:')
      importantSections.push(...achievementLines.slice(0, 5))
    }
    
    // Join and ensure we stay within 8k character limit for text-embedding-3-large
    let processedText = importantSections.join('\n')
    
    // If still too long, prioritize the most important sections
    if (processedText.length > 7500) {
      const priority = [
        ...skillLines.slice(0, 3),
        ...experienceLines.slice(0, 5),
        ...educationLines.slice(0, 2),
        ...achievementLines.slice(0, 3)
      ]
      processedText = priority.join('\n').substring(0, 7500)
    }
    
    return processedText || text.substring(0, 7500)
  }, [])

  // Optimized generate embedding with caching
  const generateEmbedding = async (text: string, retries: number = 3): Promise<number[]> => {
    try {
      // Validate input text
      if (!text || text.trim().length === 0) {
        console.warn('Empty text provided for embedding generation')
        return []
      }

      // Create a Unicode-safe hash for caching (including dimensions in hash)
      // Use a simple hash function that works with all Unicode characters
      const createHash = (str: string): string => {
        let hash = 0
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i)
          hash = ((hash << 5) - hash) + char
          hash = hash & hash // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36)
      }
      
      const textHash = createHash(text.substring(0, 200) + '_3072d').substring(0, 20)
      
      // Check cache first
      if (embeddingCache.current.has(textHash)) {
        console.log('Using cached embedding')
        return embeddingCache.current.get(textHash)!
      }

      // Preprocess text for better embedding quality
      const processedText = preprocessTextForEmbedding(text)
      
      // Ensure we're within the 8k limit for text-embedding-3-large
      const finalText = processedText.length > 7500 ? processedText.substring(0, 7500) : processedText

      const response = await fetch('https://models.inference.ai.azure.com/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-large',
          input: finalText,
          // Using full 3072 dimensions for better accuracy (requires database schema update)
        }),
      })

      if (response.status === 429) {
        // Rate limited - wait and retry
        if (retries > 0) {
          const waitTime = Math.pow(2, 4 - retries) * 1000 // Exponential backoff: 2s, 4s, 8s
          console.log(`Rate limited. Waiting ${waitTime}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          return generateEmbedding(text, retries - 1)
        } else {
          throw new Error('Rate limit exceeded after retries')
        }
      }

      if (!response.ok) {
        throw new Error(`Failed to generate embedding: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const embedding = data.data?.[0]?.embedding

      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        console.warn('Invalid embedding received from API')
        return []
      }

      // Validate embedding dimensions (should be 3072 for text-embedding-3-large)
      if (embedding.length !== 3072) {
        console.warn(`Unexpected embedding dimensions: got ${embedding.length}, expected 3072`)
        // Don't return empty array, still use the embedding but log the issue
      }

      console.log(`Generated embedding with ${embedding.length} dimensions`)

      // Cache the result
      embeddingCache.current.set(textHash, embedding)
      
      // Limit cache size to prevent memory issues
      if (embeddingCache.current.size > 100) {
        const firstKey = embeddingCache.current.keys().next().value
        if (firstKey) {
          embeddingCache.current.delete(firstKey)
        }
      }

      return embedding
    } catch (error) {
      console.error('Error generating embedding:', error)
      return []
    }
  }

  const uploadFile = async (file: File) => {
    if (!user) return

    // Set upload progress for single file
    setUploading(true)
    setUploadProgress({ total: 1, completed: 0, failed: 0, current: file.name })

    try {
      // Check individual file size limit (100MB)
      const maxFileSize = 100 * 1024 * 1024 // 100MB in bytes
      if (file.size > maxFileSize) {
        throw new Error('File size exceeds the 100MB limit per file.')
      }

      // Check total storage limit (500MB)
      const { data: existingResumes } = await supabase
        .from('resumes')
        .select('file_size')
        .eq('user_id', user.id)

      const currentStorageUsed = existingResumes?.reduce((sum, resume) => sum + resume.file_size, 0) || 0
      const maxTotalStorage = 500 * 1024 * 1024 // 500MB in bytes
      
      if (currentStorageUsed + file.size > maxTotalStorage) {
        const remainingSpace = maxTotalStorage - currentStorageUsed
        throw new Error(
          `Upload would exceed your 500MB storage limit. ` +
          `You have ${formatFileSize(remainingSpace)} remaining. ` +
          `This file is ${formatFileSize(file.size)}.`
        )
      }

      // Show extraction progress for non-text files
      if (file.type !== 'text/plain') {
        showNotification(`Extracting text from ${file.name}...`, 'info')
      }
      
      // Extract text content first
      const content = await extractTextFromFile(file)
      
      // Validate content before generating embedding
      if (!content || content.trim().length === 0) {
        throw new Error(`No text content could be extracted from ${file.name}`)
      }

      // Generate embedding with retry logic
      showNotification(`Generating AI embedding for ${file.name}...`, 'info')
      const embedding = await generateEmbedding(content)

      // Check if embedding is valid (non-empty)
      if (!embedding || embedding.length === 0) {
        console.warn(`Failed to generate embedding for ${file.name}, saving without embedding`)
        // Continue without embedding rather than failing completely
      }

      // Upload file to Supabase storage
      // Create a unique filename while preserving the original name
      const timestamp = Date.now()
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/_{2,}/g, '_')
      const fileName = `${timestamp}_${sanitizedName}`
      const filePath = `${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Upload error:', uploadError)
        
        // If DOCX MIME type is not supported, offer text-only storage
        if (uploadError.message?.includes('mime type') && uploadError.message?.includes('not supported') && file.type.includes('wordprocessingml')) {
          const proceed = confirm(
            `🔄 DOCX Storage Configuration Needed\n\n` +
            `Your Supabase storage bucket isn't configured for DOCX files yet.\n\n` +
            `✅ Good news: I successfully extracted the text content!\n\n` +
            `Options:\n` +
            `• Click "OK" to save text content only (works for AI matching)\n` +
            `• Click "Cancel" to configure DOCX support first (see README)\n\n` +
            `Save text content now?`
          )
          
          if (proceed) {
            // Save only the text content to database without file storage
            const { error: dbError } = await supabase
              .from('resumes')
              .insert([
                {
                  user_id: user.id,
                  filename: `${file.name} (text-only)`,
                  file_path: '', // No file stored
                  file_size: file.size,
                  file_type: 'text/plain', // Store as text type
                  content,
                  embedding: embedding.length > 0 ? embedding : null, // Only set embedding if valid
                  folder_id: currentFolderId, // Associate with current folder
                },
              ])

            if (dbError) throw dbError

            await updateStorageStats()
            fetchResumes(true) // Force refresh after upload
            showNotification(`Successfully saved text content from ${file.name} (file not stored)`, 'success')
            return
          } else {
            showNotification('Upload cancelled. Please configure DOCX support in Supabase Storage.', 'info')
            return
          }
        }
        
        // Provide specific error messages for other errors
        if (uploadError.message?.includes('size')) {
          throw new Error('File size exceeds the allowed limit.')
        } else if (uploadError.message?.includes('duplicate')) {
          throw new Error('A file with this name already exists.')
        }
        
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      // Save to database with file storage
      const { error: dbError } = await supabase
        .from('resumes')
        .insert([
          {
            user_id: user.id,
            filename: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type,
            content,
            embedding: embedding.length > 0 ? embedding : null, // Only set embedding if valid
            folder_id: currentFolderId, // Associate with current folder
          },
        ])

      if (dbError) {
        // Check for dimension mismatch errors
        if (dbError.message?.includes('expected 3072 dimensions') || dbError.message?.includes('expected 1536 dimensions')) {
          console.error(`Embedding dimension mismatch: ${dbError.message}`)
          showNotification(
            `Database schema mismatch detected. Please run the database migration to update embedding dimensions.`,
            'error'
          )
          throw new Error('Embedding dimension mismatch - database migration required')
        }
        
        // If it's a vector dimension error and we have an empty embedding, try without embedding
        if (dbError.message?.includes('vector must have at least 1 dimension') && embedding.length === 0) {
          console.warn(`Retrying ${file.name} without embedding due to dimension error`)
          const { error: retryError } = await supabase
            .from('resumes')
            .insert([
              {
                user_id: user.id,
                filename: file.name,
                file_path: filePath,
                file_size: file.size,
                file_type: file.type,
                content,
                embedding: null, // Explicitly set to null
                folder_id: currentFolderId, // Associate with current folder
              },
            ])
          
          if (retryError) throw retryError
          showNotification(`Successfully uploaded ${file.name} (without AI embedding)`, 'info')
        } else {
          throw dbError
        }
      } else {
        showNotification(`Successfully uploaded ${file.name}`, 'success')
      }

      // Update storage stats
      await updateStorageStats()
      
      // Refresh the list
      fetchResumes(true) // Force refresh after upload
      
    } catch (error) {
      console.error('Error uploading file:', error)
      
      if (error instanceof Error) {
        showNotification(`Upload failed for ${file.name}: ${error.message}`, 'error')
      } else {
        showNotification(`Error uploading ${file.name}. Please try again.`, 'error')
      }
      throw error // Re-throw to be handled by batch upload
    } finally {
      // Reset upload state for single file
      setUploading(false)
      setUploadProgress({ total: 0, completed: 0, failed: 0, current: '' })
    }
  }

  // Batch upload function with rate limiting
  const uploadFilesBatch = async (files: File[]) => {
    if (!user || files.length === 0) return

    setUploading(true)
    setUploadProgress({ total: files.length, completed: 0, failed: 0, current: '' })

    let successCount = 0
    let failureCount = 0

    showNotification(`Starting batch upload of ${files.length} files...`, 'info')

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      try {
        setUploadProgress(prev => ({ 
          ...prev, 
          current: file.name,
          completed: i,
        }))

        await uploadFile(file)
        successCount++
        
        // Add delay between uploads to prevent rate limiting
        // Longer delay for more files to be more conservative
        const delay = files.length > 20 ? 2000 : files.length > 10 ? 1500 : 1000
        if (i < files.length - 1) { // Don't delay after the last file
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        
      } catch (error) {
        failureCount++
        console.error(`Failed to upload ${file.name}:`, error)
        
        setUploadProgress(prev => ({ 
          ...prev, 
          failed: prev.failed + 1,
        }))
      }
    }

    setUploading(false)
    setUploadProgress({ total: 0, completed: 0, failed: 0, current: '' })

    // Show final result
    if (failureCount === 0) {
      showNotification(`✅ Successfully uploaded all ${successCount} files!`, 'success')
    } else if (successCount > 0) {
      showNotification(
        `⚠️ Batch upload completed: ${successCount} successful, ${failureCount} failed. Check individual file errors above.`, 
        'info'
      )
    } else {
      showNotification(`❌ All ${failureCount} files failed to upload. Please check the errors and try again.`, 'error')
    }
  }

  // Regenerate embedding for a specific resume
  const regenerateEmbedding = async (resumeId: string, filename: string) => {
    if (!user) return

    try {
      showNotification(`Generating AI embedding for ${filename}...`, 'info')

      // Get the resume content
      const { data: resume, error: fetchError } = await supabase
        .from('resumes')
        .select('content')
        .eq('id', resumeId)
        .single()

      if (fetchError) throw fetchError
      if (!resume?.content) {
        showNotification(`No content found for ${filename}`, 'error')
        return
      }

      // Generate embedding
      const embedding = await generateEmbedding(resume.content)

      if (!embedding || embedding.length === 0) {
        showNotification(`Failed to generate embedding for ${filename}`, 'error')
        return
      }

      // Update the resume with the new embedding
      const { error: updateError } = await supabase
        .from('resumes')
        .update({ embedding })
        .eq('id', resumeId)

      if (updateError) throw updateError

      showNotification(`✅ Successfully generated embedding for ${filename}`, 'success')
      
      // Refresh the resumes list to show updated status
      fetchResumes(true) // Force refresh after embedding generation

    } catch (error) {
      console.error('Error regenerating embedding:', error)
      showNotification(`Failed to regenerate embedding for ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    }
  }

  // Bulk regenerate embeddings for better performance with text-embedding-3-large
  const regenerateAllEmbeddings = async () => {
    if (!user) return

    const resumesWithoutEmbeddings = resumes.filter(r => !r.embedding || r.embedding.length === 0)
    
    if (resumesWithoutEmbeddings.length === 0) {
      showNotification('All resumes already have embeddings', 'info')
      return
    }

    if (!confirm(
      `Regenerate embeddings for ${resumesWithoutEmbeddings.length} resumes using the enhanced text-embedding-3-large model?\n\n` +
      `This will improve matching accuracy but may take a few minutes.`
    )) {
      return
    }

    setLoading(true)
    let successCount = 0
    let failCount = 0

    try {
      showNotification(`Starting bulk embedding regeneration for ${resumesWithoutEmbeddings.length} resumes...`, 'info')

      // Batch load content for all resumes that need embeddings
      const resumeIds = resumesWithoutEmbeddings.map(r => r.id)
      showNotification('Loading resume content...', 'info')
      await loadMultipleResumeContent(resumeIds)

      for (let i = 0; i < resumesWithoutEmbeddings.length; i++) {
        const resume = resumesWithoutEmbeddings[i]
        
        try {
          showNotification(`Processing ${i + 1}/${resumesWithoutEmbeddings.length}: ${resume.filename}`, 'info')
          
          // Get the updated resume with content from state
          const updatedResume = resumes.find(r => r.id === resume.id)
          const content = updatedResume?.content || resume.content
          
          if (content) {
            const embedding = await generateEmbedding(content)
            
            if (embedding && embedding.length > 0) {
              const { error: updateError } = await supabase
                .from('resumes')
                .update({ embedding })
                .eq('id', resume.id)
              
              if (updateError) throw updateError
              successCount++
            } else {
              throw new Error('Failed to generate embedding')
            }
          } else {
            throw new Error('No content available')
          }

          // Rate limiting - wait between requests
          if (i < resumesWithoutEmbeddings.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500))
          }

        } catch (error) {
          console.error(`Failed to regenerate embedding for ${resume.filename}:`, error)
          failCount++
        }
      }

      if (successCount > 0) {
        await fetchResumes(true) // Force refresh after bulk regeneration
      }

      if (failCount === 0) {
        showNotification(`✅ Successfully regenerated all ${successCount} embeddings!`, 'success')
      } else {
        showNotification(
          `⚠️ Regeneration completed: ${successCount} successful, ${failCount} failed`,
          successCount > 0 ? 'info' : 'error'
        )
      }

    } catch (error) {
      console.error('Error in bulk regeneration:', error)
      showNotification('Error during bulk regeneration. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Process existing files in storage that need text extraction
  const processExistingFiles = async () => {
    if (!user) return

    // Prevent multiple simultaneous executions
    if (isProcessingFiles) {
      showNotification('Processing is already in progress. Please wait.', 'info')
      return
    }

    // First cleanup orphaned records and get updated list
    await cleanupOrphanedRecords()
    await fetchResumes(true)

    // Get fresh data from database to check actual content status
    const { data: resumesWithContent, error: contentError } = await supabase
      .from('resumes')
      .select('id, filename, content, embedding')
      .eq('user_id', user.id);

    if (contentError) {
      console.error('Error fetching resume content status:', contentError);
      showNotification('Error checking file status. Please try again.', 'error');
      return;
    }

    // Find resumes that need content extraction or embedding generation
    const resumesNeedingProcessing = (resumesWithContent || []).filter(r => {
      const needsContent = !r.content || r.content.trim() === '';
      const needsEmbedding = !r.embedding || (Array.isArray(r.embedding) && r.embedding.length === 0);
      return needsContent || needsEmbedding;
    });
    
    if (resumesNeedingProcessing.length === 0) {
      showNotification('All resumes already have extracted text and embeddings!', 'info')
      return
    }

    const contentMissingCount = resumesNeedingProcessing.filter(r => !r.content || r.content.trim() === '').length;
    const embeddingMissingCount = resumesNeedingProcessing.filter(r => !r.embedding || (Array.isArray(r.embedding) && r.embedding.length === 0)).length;

    if (!confirm(
      `Process ${resumesNeedingProcessing.length} files:\n\n` +
      `• ${contentMissingCount} need text extraction\n` +
      `• ${embeddingMissingCount} need embedding generation\n\n` +
      `This will only update missing data without overwriting existing content. Continue?`
    )) {
      return
    }

    setIsProcessingFiles(true)
    setProcessingProgress({ processed: 0, total: resumesNeedingProcessing.length, currentFile: '' })
    let successCount = 0
    let failCount = 0

    try {
      showNotification(`Starting processing for ${resumesNeedingProcessing.length} files...`, 'info')

      for (let i = 0; i < resumesNeedingProcessing.length; i++) {
        const resumeToProcess = resumesNeedingProcessing[i]
        
        // Find the corresponding resume in the main resumes array for file_path
        const resumeWithPath = resumes.find(r => r.id === resumeToProcess.id);
        if (!resumeWithPath) {
          console.error(`Could not find resume with ID ${resumeToProcess.id} in main resumes array`);
          failCount++;
          continue;
        }
        
        setProcessingProgress(prev => ({ 
          ...prev, 
          processed: i, 
          currentFile: resumeToProcess.filename 
        }))

        try {
          showNotification(`Processing ${i + 1}/${resumesNeedingProcessing.length}: ${resumeToProcess.filename}`, 'info')
          
          const needsContent = !resumeToProcess.content || resumeToProcess.content.trim() === '';
          const needsEmbedding = !resumeToProcess.embedding || (Array.isArray(resumeToProcess.embedding) && resumeToProcess.embedding.length === 0);
          
          let extractedText = resumeToProcess.content; // Use existing content if available
          let embedding = resumeToProcess.embedding; // Use existing embedding if available
          
          // Only extract text if content is missing
          if (needsContent) {
            // Download file from storage
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('resumes')
              .download(resumeWithPath.file_path)
            
            if (downloadError) {
              console.error(`Error downloading ${resumeToProcess.filename}:`, downloadError)
              throw downloadError
            }
            
            // Create a custom File-like object from the Blob
            const fileWithName = Object.assign(fileData, { 
              name: resumeToProcess.filename,
              lastModified: Date.now(),
              webkitRelativePath: ''
            }) as File
            extractedText = await extractTextFromFile(fileWithName)
            
            if (!extractedText || extractedText.trim() === '') {
              throw new Error('No text could be extracted from file')
            }
          }
          
          // Only generate embedding if missing or if we just extracted new content
          if (needsEmbedding || needsContent) {
            if (extractedText && extractedText.trim()) {
              embedding = await generateEmbedding(extractedText)
            }
          }
          
          // Prepare update object with only the fields that need updating
          const updateFields: any = {
            updated_at: new Date().toISOString()
          };
          
          if (needsContent && extractedText) {
            updateFields.content = extractedText;
          }
          
          if ((needsEmbedding || needsContent) && embedding && embedding.length > 0) {
            updateFields.embedding = embedding;
          }
          
          // Only update if we have something to update
          if (Object.keys(updateFields).length > 1) { // More than just updated_at
            const { error: updateError } = await supabase
              .from('resumes')
              .update(updateFields)
              .eq('id', resumeToProcess.id)
            
            if (updateError) throw updateError
          }
          
          successCount++
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1500))
          
        } catch (error) {
          console.error(`Error processing ${resumeToProcess.filename}:`, error)
          failCount++
        }
      }

      setProcessingProgress(prev => ({ ...prev, processed: resumesNeedingProcessing.length }))
      
      if (successCount > 0) {
        await fetchResumes(true) // Force refresh after processing
      }

      if (failCount === 0) {
        showNotification(`✅ Successfully processed all ${successCount} files!`, 'success')
      } else {
        showNotification(
          `⚠️ Processing completed: ${successCount} successful, ${failCount} failed`,
          successCount > 0 ? 'info' : 'error'
        )
      }

    } catch (error) {
      console.error('Error processing existing files:', error)
      showNotification('Error during file processing. Please try again.', 'error')
    } finally {
      setIsProcessingFiles(false)
      setProcessingProgress({ processed: 0, total: 0, currentFile: '' })
    }
  }

  // Enhanced resume matching function using the new similarity calculation
  // const findSimilarResumes = useCallback((targetResume: any, count: number = 5) => {
  //   if (!targetResume?.embedding || !targetResume?.content) return []

  //   const similarities = resumes
  //     .filter(r => r.id !== targetResume.id && r.embedding && r.content)
  //     .map(resume => ({
  //       ...resume,
  //       similarity: calculateEnhancedSimilarity(
  //         targetResume.embedding,
  //         resume.embedding as number[],
  //         targetResume.content,
  //         resume.content as string
  //       )
  //     }))
  //     .sort((a, b) => b.similarity - a.similarity)
  //     .slice(0, count)

  //   return similarities
  // }, [resumes, calculateEnhancedSimilarity])

  const updateStorageStats = async () => {
    if (!user) return

    try {
      const { data: resumes } = await supabase
        .from('resumes')
        .select('file_size')
        .eq('user_id', user.id)

      const totalSize = resumes?.reduce((sum, resume) => sum + resume.file_size, 0) || 0
      const totalFiles = resumes?.length || 0

      const { error } = await supabase
        .from('user_storage')
        .upsert(
          {
            user_id: user.id,
            total_storage_used: totalSize,
            total_files: totalFiles,
          },
          {
            onConflict: 'user_id'
          }
        )

      if (error) {
        console.error('Error updating storage stats:', error)
      }
    } catch (error) {
      console.error('Error updating storage stats:', error)
    }
  }

  const deleteResume = async (id: string, filePath: string) => {
    if (!confirm('Are you sure you want to delete this resume?')) return

    try {
      // Delete from storage only if file exists
      if (filePath && filePath !== '') {
        await supabase.storage.from('resumes').remove([filePath])
      }

      // Delete from database
      const { error } = await supabase
        .from('resumes')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Update storage stats
      await updateStorageStats()
      
      // Refresh the list
      fetchResumes(true) // Force refresh after deletion
      
      showNotification('Resume deleted successfully', 'success')
    } catch (error) {
      console.error('Error deleting resume:', error)
      showNotification('Error deleting resume. Please try again.', 'error')
    }
  }

  const viewResume = async (filePath: string, content?: string, filename?: string) => {
    try {
      // If no file path (text-only entry), show content in a new window
      if (!filePath || filePath === '') {
        if (content) {
          const newWindow = window.open('', '_blank')
          if (newWindow) {
            newWindow.document.write(`
              <html>
                <head>
                  <title>${filename || 'Resume Content'}</title>
                  <style>
                    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                    h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
                    .content { white-space: pre-wrap; background: #f5f5f5; padding: 20px; border-radius: 8px; }
                  </style>
                </head>
                <body>
                  <h1>${filename || 'Resume Content'}</h1>
                  <p><em>Note: This is text-only content. The original file was not stored.</em></p>
                  <div class="content">${content}</div>
                </body>
              </html>
            `)
            newWindow.document.close()
          }
        } else {
          showNotification('No content available to display', 'error')
        }
        return
      }

      // Normal file viewing for stored files
      const { data } = await supabase.storage
        .from('resumes')
        .createSignedUrl(filePath, 3600)

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      }
    } catch (error) {
      console.error('Error viewing resume:', error)
      showNotification('Error viewing resume. Please try again.', 'error')
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    const validFiles = files.filter(file => {
      const allowedTypes = [
        'application/pdf',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
      
      if (!allowedTypes.includes(file.type)) {
        showNotification(`Skipped ${file.name}: Only PDF, DOCX, and TXT files are allowed`, 'error')
        return false
      }
      
      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        showNotification(`Skipped ${file.name}: File size exceeds 100MB limit`, 'error')
        return false
      }
      
      return true
    })

    if (validFiles.length === 0) return

    if (validFiles.length === 1) {
      // Single file upload
      uploadFile(validFiles[0])
    } else {
      // Multiple files - use batch upload
      uploadFilesBatch(validFiles)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter(file => {
      const allowedTypes = [
        'application/pdf',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
      
      if (!allowedTypes.includes(file.type)) {
        showNotification(`Skipped ${file.name}: Only PDF, DOCX, and TXT files are allowed`, 'error')
        return false
      }
      
      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        showNotification(`Skipped ${file.name}: File size exceeds 100MB limit`, 'error')
        return false
      }
      
      return true
    })

    // Reset the input value so the same files can be selected again
    e.target.value = ''

    if (validFiles.length === 0) return

    if (validFiles.length === 1) {
      // Single file upload
      uploadFile(validFiles[0])
    } else {
      // Multiple files - use batch upload
      uploadFilesBatch(validFiles)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Bulk operations functions
  const toggleResumeSelection = (resumeId: string) => {
    setSelectedResumes(prev => 
      prev.includes(resumeId) 
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    )
  }

  const selectAllResumes = () => {
    setSelectedResumes(filteredResumes.map(r => r.id))
  }

  const clearSelection = () => {
    setSelectedResumes([])
  }

  // Mass export function - Download as PDF files
  const handleMassExport = async () => {
    if (!user || selectedResumes.length === 0) return

    try {
      showNotification(`Preparing to download ${selectedResumes.length} resume files...`, 'info')

      const selectedResumeData = resumes.filter(r => selectedResumes.includes(r.id))
      let downloadedCount = 0
      let errorCount = 0

      for (const resume of selectedResumeData) {
        try {
          if (resume.file_path && resume.file_path !== '') {
            // Download original file from Supabase storage
            const { data, error } = await supabase.storage
              .from('resumes')
              .download(resume.file_path)

            if (error) throw error

            // Create download link for the original file
            const url = URL.createObjectURL(data)
            const a = document.createElement('a')
            a.href = url
            a.download = resume.filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            
            downloadedCount++
          } else if (resume.content) {
            // For text-only entries, convert content to PDF
            await downloadContentAsPDF(resume.content, resume.filename)
            downloadedCount++
          } else {
            console.warn(`No file or content available for resume: ${resume.filename}`)
            errorCount++
          }

          // Small delay between downloads to avoid overwhelming the browser
          if (selectedResumeData.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        } catch (error) {
          console.error(`Error downloading ${resume.filename}:`, error)
          errorCount++
        }
      }

      // Log the activity
      await supabase
        .from('user_activities')
        .insert([{
          user_id: user.id,
          activity_type: 'mass_export',
          description: `Downloaded ${downloadedCount} resumes as files${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
          items_count: downloadedCount,
          metadata: {
            resumeIds: selectedResumes,
            exportFormat: 'files',
            downloadedCount,
            errorCount,
            exportedAt: new Date().toISOString()
          }
        }])

      if (errorCount === 0) {
        showNotification(`Successfully downloaded ${downloadedCount} resume files`, 'success')
      } else {
        showNotification(
          `Downloaded ${downloadedCount} files successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`, 
          downloadedCount > 0 ? 'info' : 'error'
        )
      }
      
      clearSelection()
    } catch (error) {
      console.error('Error exporting resumes:', error)
      showNotification('Error downloading resumes. Please try again.', 'error')
    }
  }

  // Helper function to convert text content to PDF
  const downloadContentAsPDF = async (content: string, filename: string) => {
    try {
      // For text-only content, we'll create a simple HTML document and convert to PDF
      // This is a basic implementation - you could enhance this with better formatting
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${filename}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.6; 
              margin: 40px; 
              color: #333;
            }
            .header { 
              border-bottom: 2px solid #333; 
              padding-bottom: 10px; 
              margin-bottom: 20px; 
            }
            .content { 
              white-space: pre-wrap; 
              font-size: 12px;
            }
            .footer {
              margin-top: 30px;
              padding-top: 10px;
              border-top: 1px solid #ccc;
              font-size: 10px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${filename.replace(/\.(txt|docx)$/i, '')}</h1>
          </div>
          <div class="content">${content.replace(/\n/g, '<br>')}</div>
          <div class="footer">
            <p>Exported from ResumeAI on ${new Date().toLocaleDateString()}</p>
          </div>
        </body>
        </html>
      `

      // Create a blob with HTML content
      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      
      // Open in new window for printing/saving as PDF
      const newWindow = window.open(url, '_blank')
      if (newWindow) {
        // Wait for content to load, then trigger print dialog
        newWindow.onload = () => {
          setTimeout(() => {
            newWindow.print()
          }, 500)
        }
      }
      
      // Clean up the URL after a delay
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)

      // Also offer direct download of HTML file as fallback
      const downloadFilename = filename.replace(/\.(txt|docx)$/i, '.html')
      const a = document.createElement('a')
      a.href = url
      a.download = downloadFilename
      
      // Don't auto-click for HTML download, just make it available
      // User can right-click the link if they want the HTML file
      
    } catch (error) {
      console.error('Error creating PDF from content:', error)
      
      // Fallback: download as text file
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename.replace(/\.(pdf|docx)$/i, '.txt')
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  // Bulk communication function
  const handleBulkCommunication = async () => {
    console.log('handleBulkCommunication called with:', {
      user: !!user,
      selectedResumes: selectedResumes.length,
      bulkTitle: bulkTitle.trim(),
      bulkMessage: bulkMessage.trim(),
      sendRealEmails
    });

    if (!user || selectedResumes.length === 0 || !bulkTitle.trim() || !bulkMessage.trim()) {
      showNotification('Please fill in title, message, and select candidates', 'error')
      return
    }

    setEmailSending(true)
    let emailResults: EmailResult[] = []
    let successful_deliveries = 0
    let failed_deliveries = 0

    try {
      // If sending real emails, extract email addresses and send emails
      if (sendRealEmails) {
        showNotification('Extracting email addresses and sending emails...', 'info')
        
        // First, load content for selected resumes if not already loaded
        console.log('Loading content for selected resumes...');
        const loadedResumeData = await loadMultipleResumeContent(selectedResumes);
        console.log('Loaded resume data from database:', loadedResumeData.map(r => ({ 
          id: r.id, 
          filename: r.filename, 
          hasContent: !!r.content,
          contentLength: r.content?.length || 0
        })));
        
        // If content loading failed, try to get from current state
        const selectedResumeData = loadedResumeData.length > 0 
          ? loadedResumeData.map(loaded => {
              const resume = resumes.find(r => r.id === loaded.id);
              return resume ? { ...resume, content: loaded.content, embedding: loaded.embedding } : loaded;
            })
          : resumes.filter(r => selectedResumes.includes(r.id));
          
        console.log('Final selected resume data for email extraction:', selectedResumeData.map(r => ({ 
          id: r.id, 
          filename: r.filename, 
          hasContent: !!r.content,
          contentLength: r.content?.length || 0
        })));
        
        const emailAddresses: string[] = []

        // Extract email addresses from resume content
        for (const resume of selectedResumeData) {
          if (resume.content) {
            try {
              const email = extractEmailFromContent(resume.content)
              console.log(`Email extracted from ${resume.filename}:`, email);
              if (email && validateEmail(email)) {
                emailAddresses.push(email)
              }
            } catch (error) {
              console.error(`Error extracting email from ${resume.filename}:`, error);
            }
          } else {
            console.warn(`No content found for resume: ${resume.filename}`);
          }
        }

        console.log('Valid email addresses found:', emailAddresses);

        if (emailAddresses.length === 0) {
          showNotification('No valid email addresses found in selected resumes. Please ensure resumes have been processed and contain email addresses.', 'error')
          setEmailSending(false)
          return
        }

        // Send bulk emails
        showNotification(`Sending emails to ${emailAddresses.length} recipients...`, 'info')
        try {
          emailResults = await sendBulkEmail({
            to: emailAddresses,
            subject: bulkTitle.trim(),
            message: bulkMessage.trim(),
            senderName: 'ResumeAI Team', // You can make this configurable
          })
          console.log('Email results:', emailResults);
        } catch (emailError) {
          console.error('Error sending bulk emails:', emailError);
          showNotification(`Email sending failed: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`, 'error');
          setEmailSending(false);
          return;
        }

        // Count successful and failed deliveries
        successful_deliveries = emailResults.filter(r => r.success).length
        failed_deliveries = emailResults.filter(r => !r.success).length

        console.log('Email delivery stats:', { successful_deliveries, failed_deliveries });

        if (successful_deliveries === 0) {
          showNotification('Failed to send any emails. Please check your email configuration and try again.', 'error')
          setEmailSending(false)
          return
        }
      } else {
        // Mock successful delivery for tracking only
        successful_deliveries = selectedResumes.length
        failed_deliveries = 0
      }

      // Create communication record
      const { data: communication, error: commError } = await supabase
        .from('communications')
        .insert([{
          user_id: user.id,
          title: bulkTitle.trim(),
          message: bulkMessage.trim(),
          communication_type: sendRealEmails ? 'email' : 'bulk_update',
          status: failed_deliveries === 0 ? 'sent' : (successful_deliveries > 0 ? 'sent' : 'failed'),
          total_recipients: selectedResumes.length,
          successful_deliveries,
          failed_deliveries
        }])
        .select()
        .single()

      if (commError) throw commError

      // Create recipient records with actual delivery status
      const recipients = selectedResumes.map((resumeId, index) => {
        const emailResult = emailResults[index]
        return {
          communication_id: communication.id,
          resume_id: resumeId,
          user_id: user.id,
          delivery_status: sendRealEmails 
            ? (emailResult?.success ? 'delivered' : 'failed') 
            : 'delivered',
          delivered_at: sendRealEmails && emailResult?.success 
            ? new Date().toISOString() 
            : (sendRealEmails ? null : new Date().toISOString()),
          error_message: sendRealEmails && !emailResult?.success 
            ? emailResult?.error 
            : null
        }
      })

      const { error: recipientError } = await supabase
        .from('communication_recipients')
        .insert(recipients)

      if (recipientError) throw recipientError

      // Show appropriate success message
      if (sendRealEmails) {
        if (failed_deliveries === 0) {
          showNotification(`Successfully sent emails to all ${successful_deliveries} candidates`, 'success')
        } else {
          showNotification(
            `Sent ${successful_deliveries} emails successfully, ${failed_deliveries} failed`, 
            successful_deliveries > 0 ? 'info' : 'error'
          )
        }
      } else {
        showNotification(`Bulk update recorded for ${selectedResumes.length} candidates`, 'success')
      }

      setBulkTitle('')
      setBulkMessage('')
      setShowBulkCommunication(false)
      setSendRealEmails(false)
      clearSelection()
      await fetchCommunications() // Refresh communications list
    } catch (error) {
      console.error('Error sending bulk communication:', error)
      showNotification('Error sending bulk communication. Please try again.', 'error')
    } finally {
      setEmailSending(false)
    }
  }

  // Fetch communications history
  const fetchCommunications = async () => {
    if (!user) return

    setLoadingCommunications(true)
    try {
      const { data, error } = await supabase
        .from('communications')
        .select(`
          *,
          communication_recipients (
            resume_id,
            delivery_status,
            delivered_at,
            resumes (
              filename
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCommunications(data || [])
    } catch (error) {
      console.error('Error fetching communications:', error)
      showNotification('Error loading communication history', 'error')
    } finally {
      setLoadingCommunications(false)
    }
  }

  // Load communications when component mounts
  useEffect(() => {
    if (user) {
      fetchCommunications()
    }
  }, [user])

  // Debounce search term to prevent excessive filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
      setCurrentPage(1) // Reset to first page when search changes
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm])

  // Memoize filtered resumes to prevent unnecessary re-renders
  const filteredResumes = useMemo(() => {
    const filtered = resumes.filter(resume =>
      resume.filename.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    )
    
    // Update total pages when filtered data changes (folders + resumes)
    const totalItems = folders.length + filtered.length
    const newTotalPages = Math.ceil(totalItems / itemsPerPage)
    setTotalPages(newTotalPages)
    
    // Reset to page 1 if current page is beyond available pages
    if (currentPage > newTotalPages && newTotalPages > 0) {
      setCurrentPage(1)
    }
    
    return filtered
  }, [resumes, folders.length, debouncedSearchTerm, itemsPerPage, currentPage])

  // Get paginated items (folders + resumes) for current page
  const paginatedItems = useMemo(() => {
    // Combine folders and resumes, with folders first
    const allItems = [...folders, ...filteredResumes]
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return allItems.slice(startIndex, endIndex)
  }, [folders, filteredResumes, currentPage, itemsPerPage])

  // Separate folders and resumes from paginated items
  const paginatedFolders = useMemo(() => {
    return paginatedItems.filter(item => 'path' in item) as Folder[]
  }, [paginatedItems])

  const paginatedResumes = useMemo(() => {
    return paginatedItems.filter(item => 'filename' in item) as Resume[]
  }, [paginatedItems])

  // Pagination handlers
  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      // Scroll to top of resume grid
      document.querySelector('.resume-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [totalPages])

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1)
    }
  }, [currentPage, totalPages, goToPage])

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1)
    }
  }, [currentPage, goToPage])

  // Items per page handler
  const changeItemsPerPage = useCallback((newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1) // Reset to first page
  }, [])

  // Memoize folder and resume cards to prevent blinking during scroll
  const folderCards = useMemo(() => {
    return paginatedFolders.map((folder, index) => (
      <div
        key={`folder-${folder.id}-${folder.name}`}
        className="folder-card group relative overflow-hidden bg-gradient-to-br from-amber-50/80 to-orange-50/80 backdrop-blur-sm border border-amber-200/60 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 hover:scale-[1.02] animate-fade-in-scale cursor-pointer"
        style={{ 
          animationDelay: `${Math.min(index * 50, 1000)}ms`,
          transform: 'translateZ(0)'
        }}
        onClick={() => navigateToFolder(folder)}
      >
        <div className="relative p-6">
          {/* Header with Folder Icon */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <Folder className="h-5 w-5 text-white" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                  {folder.name}
                </h3>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs text-slate-500 font-medium">
                    📁 Folder
                  </span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span className="text-xs text-slate-500 font-medium">
                    {new Date(folder.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Delete button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                deleteFolder(folder.id, folder.name)
              }}
              className="opacity-0 group-hover:opacity-100 w-8 h-8 bg-red-100/80 hover:bg-red-200/80 rounded-lg flex items-center justify-center text-red-600 hover:text-red-800 transition-all duration-200"
              title="Delete folder"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Folder Badge */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-flex items-center px-2.5 py-1 bg-amber-100/80 text-amber-700 text-xs font-medium rounded-lg">
              📂 Folder
            </span>
          </div>

          {/* Hover Indicator */}
          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300">
            <div className="flex items-center text-xs text-amber-600 font-medium">
              <span>Open</span>
              <ChevronRight className="h-3 w-3 ml-1" />
            </div>
          </div>
        </div>
        
        {/* Hover Effect Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 to-orange-500/0 group-hover:from-amber-500/5 group-hover:to-orange-500/5 rounded-2xl transition-all duration-300 pointer-events-none"></div>
      </div>
    ))
  }, [paginatedFolders, navigateToFolder, deleteFolder])

  // Memoize resume cards to prevent blinking during scroll
  const resumeCards = useMemo(() => {
    return paginatedResumes.map((resume, index) => {
      const adjustedIndex = index + paginatedFolders.length // Adjust animation delay after folders
      return (
        <div
          key={`resume-${resume.id}-${resume.filename}`} // Stable key to prevent re-mounting
          className={`resume-card group relative overflow-hidden bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 hover:scale-[1.02] animate-fade-in-scale ${
            selectedResumes.includes(resume.id) 
              ? 'ring-2 ring-blue-500/60 bg-blue-50/50' 
              : ''
          }`}
          style={{ 
            animationDelay: `${Math.min(adjustedIndex * 50, 1000)}ms`, // Cap animation delay
            transform: 'translateZ(0)' // Force hardware acceleration
          }}
        >
        {/* Selection Overlay */}
        {selectedResumes.includes(resume.id) && (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 rounded-2xl"></div>
        )}
        
        <div className="relative p-6">
          {/* Header with Checkbox */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <input
                type="checkbox"
                checked={selectedResumes.includes(resume.id)}
                onChange={() => toggleResumeSelection(resume.id)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 transition-all duration-200"
              />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    resume.file_path 
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                      : 'bg-gradient-to-br from-orange-500 to-red-600'
                  } shadow-lg`}>
                    <File className="h-5 w-5 text-white" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                      {resume.filename}
                    </h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-slate-500 font-medium">
                        {formatFileSize(resume.file_size)}
                      </span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                      <span className="text-xs text-slate-500 font-medium">
                        {new Date(resume.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            {!resume.file_path && (
              <span className="inline-flex items-center px-2.5 py-1 bg-orange-100/80 text-orange-700 text-xs font-medium rounded-lg">
                📝 Text Only
              </span>
            )}
            
            {resume.embedding && resume.embedding.length > 0 ? (
              <span className="inline-flex items-center px-2.5 py-1 bg-green-100/80 text-green-700 text-xs font-medium rounded-lg">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                AI Ready
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 bg-slate-100/80 text-slate-600 text-xs font-medium rounded-lg">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full mr-1.5"></span>
                No AI Embedding
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200/60">
            <div className="flex space-x-2">
              {(!resume.embedding || resume.embedding.length === 0) && (
                <button
                  onClick={() => regenerateEmbedding(resume.id, resume.filename)}
                  className="group/btn inline-flex items-center px-3 py-2 bg-purple-100/80 hover:bg-purple-200/80 text-purple-700 hover:text-purple-800 text-xs font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                  title="Generate AI embedding"
                >
                  <Zap className="h-3.5 w-3.5 mr-1.5 group-hover/btn:scale-110 transition-transform" />
                  Generate AI
                </button>
              )}
              
              <button
                onClick={() => viewResume(resume.file_path, resume.content, resume.filename)}
                className="group/btn inline-flex items-center px-3 py-2 bg-blue-100/80 hover:bg-blue-200/80 text-blue-700 hover:text-blue-800 text-xs font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                title={resume.file_path ? 'View file' : 'View text content'}
              >
                <Eye className="h-3.5 w-3.5 mr-1.5 group-hover/btn:scale-110 transition-transform" />
                View
              </button>
            </div>
            
            <button
              onClick={() => deleteResume(resume.id, resume.file_path)}
              className="group/btn inline-flex items-center px-3 py-2 bg-red-100/80 hover:bg-red-200/80 text-red-700 hover:text-red-800 text-xs font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
              title="Delete resume"
            >
              <Trash2 className="h-3.5 w-3.5 group-hover/btn:scale-110 transition-transform" />
            </button>
          </div>
        </div>
        
        {/* Hover Effect Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-indigo-500/0 group-hover:from-blue-500/5 group-hover:to-indigo-500/5 rounded-2xl transition-all duration-300 pointer-events-none"></div>
      </div>
    )
    })
  }, [paginatedResumes, paginatedFolders.length, selectedResumes, toggleResumeSelection, regenerateEmbedding, viewResume, deleteResume, formatFileSize])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/10">
      <style>{`
        /* Prevent layout shift and optimize animations */
        .resume-grid {
          contain: layout style paint;
        }
        
        .resume-card {
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        
        /* Optimize CSS transforms for better performance */
        .animate-fade-in-scale {
          animation: fadeInScale 0.4s ease-out forwards;
          opacity: 0;
          transform: translateZ(0) scale(0.95);
        }
        
        @keyframes fadeInScale {
          to {
            opacity: 1;
            transform: translateZ(0) scale(1);
          }
        }
        
        /* Prevent reflow during scroll */
        .progress-gradient {
          contain: strict;
        }

        /* Pagination optimizations */
        .pagination-controls {
          contain: layout style;
        }
        
        .page-button {
          transition: all 0.2s ease;
          will-change: background-color, transform;
        }
        
        .page-button:hover {
          transform: translateY(-1px);
        }
        
        .page-button:active {
          transform: translateY(0);
        }
      `}</style>
      
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-gradient-to-br from-blue-400/8 to-indigo-400/8 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-purple-400/5 to-pink-400/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Enhanced Notification */}
        {notification && (
          <div className={`fixed top-4 right-4 z-50 animate-fade-in-scale ${
            notification.type === 'success' ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200/60' :
            notification.type === 'error' ? 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200/60' :
            'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200/60'
          } border backdrop-blur-md rounded-2xl p-4 shadow-2xl shadow-blue-500/10 max-w-sm`}>
            <div className="flex items-center space-x-3">
              <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
                notification.type === 'success' ? 'bg-green-500' :
                notification.type === 'error' ? 'bg-red-500' :
                'bg-blue-500'
              }`}>
                {notification.type === 'success' ? (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : notification.type === 'error' ? (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <p className={`text-sm font-medium ${
                notification.type === 'success' ? 'text-green-700' :
                notification.type === 'error' ? 'text-red-700' :
                'text-blue-700'
              }`}>
                {notification.message}
              </p>
            </div>
          </div>
        )}

        {/* Enhanced Header */}
        <div className="relative overflow-hidden bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-2xl shadow-blue-500/10 mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
          
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-6 lg:space-y-0">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl blur-lg opacity-20 animate-pulse"></div>
                    <div className="relative w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
                      <Users className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                      Resume Portfolio
                    </h1>
                    <p className="text-sm sm:text-base text-slate-600 font-medium">
                      Manage your candidate database with AI-powered insights
                    </p>
                  </div>
                </div>

                {/* Enhanced Search */}
                <div className="relative max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search resumes by name or content..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white/80 border border-slate-200/60 hover:border-slate-300/80 focus:border-blue-500/60 rounded-2xl shadow-sm hover:shadow-md focus:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 placeholder-slate-500 text-slate-900 font-medium"
                  />
                </div>
              </div>

              {/* Enhanced Action Buttons - Reorganized for Better UX */}
              <div className="space-y-4">
                {/* Selection-based Actions (Top Priority) */}
                {selectedResumes.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 bg-blue-50/50 rounded-2xl border border-blue-200/40">
                    <div className="text-xs font-medium text-blue-700 w-full mb-1">
                      {selectedResumes.length} selected
                    </div>
                    <button
                      type="button"
                      onClick={handleMassExport}
                      className="group inline-flex items-center px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-medium rounded-xl shadow-md hover:shadow-lg focus:outline-none focus:ring-3 focus:ring-green-500/30 transition-all duration-200"
                      title={`Export ${selectedResumes.length} selected resumes`}
                    >
                      <FileDown className="h-3 w-3 mr-1.5" />
                      <span className="text-sm">Export ({selectedResumes.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBulkCommunication(true)}
                      className="group inline-flex items-center px-3 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium rounded-xl shadow-md hover:shadow-lg focus:outline-none focus:ring-3 focus:ring-blue-500/30 transition-all duration-200"
                      title={`Send update to ${selectedResumes.length} candidates`}
                    >
                      <Mail className="h-3 w-3 mr-1.5" />
                      <span className="text-sm">Bulk Update ({selectedResumes.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="group inline-flex items-center px-2.5 py-2 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                      title="Clear selection"
                    >
                      <span className="text-sm">✕</span>
                    </button>
                  </div>
                )}

                {/* Main Action Buttons - Organized by Function */}
                <div className="flex flex-wrap gap-2 items-center">
                  {/* File Processing Group */}
                  <div className="flex gap-2 p-2 bg-green-50/50 rounded-xl border border-green-200/30">
                    <button
                      type="button"
                      onClick={processExistingFiles}
                      disabled={loading || isProcessingFiles}
                      className="group inline-flex items-center px-3 py-2 bg-white/90 hover:bg-white border border-green-200/60 hover:border-green-300/80 text-green-700 hover:text-green-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Extract text from files uploaded directly to storage and generate embeddings"
                    >
                      <span className="mr-1.5 text-sm">📄</span>
                      <span className="text-sm">Process Files</span>
                    </button>
                    <button
                      type="button"
                      onClick={regenerateAllEmbeddings}
                      disabled={loading}
                      className="group inline-flex items-center px-3 py-2 bg-white/90 hover:bg-white border border-indigo-200/60 hover:border-indigo-300/80 text-indigo-700 hover:text-indigo-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Regenerate embeddings for better matching with text-embedding-3-large model"
                    >
                      <Zap className="h-3 w-3 mr-1.5" />
                      <span className="text-sm">Upgrade AI</span>
                    </button>
                  </div>

                  {/* Maintenance Group */}
                  <div className="flex gap-2 p-2 bg-orange-50/50 rounded-xl border border-orange-200/30">
                    <button
                      type="button"
                      onClick={cleanupOrphanedRecords}
                      disabled={loading}
                      className="group inline-flex items-center px-3 py-2 bg-white/90 hover:bg-white border border-yellow-200/60 hover:border-yellow-300/80 text-yellow-700 hover:text-yellow-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Sync database with storage - remove orphaned records and add new files from storage"
                    >
                      <span className="mr-1.5 text-sm">🧹</span>
                      <span className="text-sm">Cleanup</span>
                    </button>
                    <button
                      type="button"
                      onClick={cleanupDuplicates}
                      disabled={loading || isProcessingFiles}
                      className="group inline-flex items-center px-3 py-2 bg-white/90 hover:bg-white border border-orange-200/60 hover:border-orange-300/80 text-orange-700 hover:text-orange-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Remove duplicate resume records from database"
                    >
                      <span className="mr-1.5 text-sm">�</span>
                      <span className="text-sm">Remove Duplicates</span>
                    </button>
                  </div>

                  {/* View & Communication Group */}
                  <div className="flex gap-2 p-2 bg-purple-50/50 rounded-xl border border-purple-200/30">
                    <button
                      type="button"
                      onClick={() => setShowCommunicationHistory(true)}
                      className="group inline-flex items-center px-3 py-2 bg-white/90 hover:bg-white border border-purple-200/60 hover:border-purple-300/80 text-purple-700 hover:text-purple-800 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                      title="View communication history"
                    >
                      <MessageSquare className="h-3 w-3 mr-1.5" />
                      <span className="text-sm">History</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={loading}
                      className="group inline-flex items-center px-3 py-2 bg-white/90 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Refresh the file list"
                    >
                      <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                      <span className="text-sm">Refresh</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Breadcrumb Navigation */}
        <div className="relative overflow-hidden bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-xl shadow-blue-500/10 mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
          
          <div className="relative p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <nav className="flex items-center space-x-2 flex-1">
                <div className="flex items-center space-x-2 text-sm">
                  {currentFolderPath.map((pathItem, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && <ChevronRight className="h-4 w-4 text-slate-400" />}
                      <button
                        onClick={() => index < currentFolderPath.length - 1 ? navigateToBreadcrumb(index) : undefined}
                        className={`flex items-center px-3 py-1.5 rounded-xl transition-all duration-200 ${
                          index === currentFolderPath.length - 1
                            ? 'bg-blue-100/80 text-blue-700 font-semibold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                        }`}
                        disabled={index === currentFolderPath.length - 1}
                      >
                        {index === 0 ? (
                          <>
                            <Home className="h-4 w-4 mr-1.5" />
                            Home
                          </>
                        ) : (
                          <>
                            <Folder className="h-4 w-4 mr-1.5" />
                            {pathItem}
                          </>
                        )}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </nav>
              
              <div className="flex items-center space-x-2">
                {currentFolderPath.length > 1 && (
                  <button
                    onClick={navigateBack}
                    className="inline-flex items-center px-3 py-2 bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 hover:text-slate-900 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <ChevronRight className="h-4 w-4 mr-1 rotate-180" />
                    <span className="text-sm">Back</span>
                  </button>
                )}
                
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="inline-flex items-center px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-300"
                >
                  <FolderPlus className="h-4 w-4 mr-1.5" />
                  <span className="text-sm">New Folder</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Create Folder Modal */}
        {showCreateFolder && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="relative overflow-hidden bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-2xl shadow-blue-500/20 p-6 max-w-md w-full mx-4">
              <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
              
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Create New Folder</h3>
                  <button
                    onClick={() => {
                      setShowCreateFolder(false)
                      setNewFolderName('')
                    }}
                    className="w-8 h-8 bg-slate-100/80 hover:bg-slate-200/80 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-800 transition-all duration-200"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Folder Name
                    </label>
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !creatingFolder && newFolderName.trim() && createFolder()}
                      placeholder="Enter folder name..."
                      className="w-full px-4 py-3 bg-white/80 border border-slate-200/60 hover:border-slate-300/80 focus:border-blue-500/60 rounded-2xl shadow-sm hover:shadow-md focus:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 placeholder-slate-500 text-slate-900 font-medium"
                      autoFocus
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-2">
                    <button
                      onClick={() => {
                        setShowCreateFolder(false)
                        setNewFolderName('')
                      }}
                      disabled={creatingFolder}
                      className="px-4 py-2 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createFolder}
                      disabled={!newFolderName.trim() || creatingFolder}
                      className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                    >
                      {creatingFolder ? 'Creating...' : 'Create Folder'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Upload Area */}
        <div className="relative overflow-hidden bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-xl shadow-blue-500/10 mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
          
          <div
            className={`relative p-8 border-2 border-dashed rounded-3xl transition-all duration-300 ${
              dragActive
                ? 'border-blue-400/60 bg-blue-50/50 scale-[1.02]'
                : 'border-slate-300/60 hover:border-slate-400/60 hover:bg-slate-50/30'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-2xl blur-lg"></div>
                <div className="relative w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
                  <Upload className="h-8 w-8 text-white" />
                </div>
              </div>
              
              <div className="space-y-3">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="block text-lg font-semibold text-slate-900 mb-2">
                    Drop files here or click to upload
                  </span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    multiple
                    accept=".pdf,.txt,.docx"
                    onChange={handleFileSelect}
                  />
                </label>
                <p className="text-sm text-slate-500 font-medium">
                  Supports PDF, DOCX, and TXT files up to 100MB each
                </p>
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <span className="inline-flex items-center px-3 py-1.5 bg-blue-100/80 text-blue-700 text-xs font-medium rounded-xl">
                    📄 PDF Files
                  </span>
                  <span className="inline-flex items-center px-3 py-1.5 bg-green-100/80 text-green-700 text-xs font-medium rounded-xl">
                    📝 DOCX Files
                  </span>
                  <span className="inline-flex items-center px-3 py-1.5 bg-purple-100/80 text-purple-700 text-xs font-medium rounded-xl">
                    📋 TXT Files
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Upload Progress */}
        {uploading && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="relative overflow-hidden bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-2xl shadow-blue-500/20 p-8 max-w-md w-full mx-4">
              <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
              
              <div className="relative text-center">
                {uploadProgress.total > 1 ? (
                  // Batch upload progress
                  <div className="space-y-4">
                    <div className="relative inline-flex items-center justify-center mb-4">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-2xl blur-lg animate-pulse"></div>
                      <div className="relative w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
                        <Upload className="h-8 w-8 text-white animate-bounce" />
                      </div>
                    </div>
                    
                    <div className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-2">
                      Uploading Files ({uploadProgress.completed + 1} of {uploadProgress.total})
                    </div>
                    
                    <div className="w-full bg-slate-200/60 rounded-full h-3 mb-4 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500 ease-out progress-gradient"
                        style={{
                          width: `${((uploadProgress.completed) / uploadProgress.total) * 100}%`
                        }}
                      ></div>
                    </div>
                    
                    <p className="text-sm font-medium text-slate-600 truncate">
                      Current: {uploadProgress.current}
                    </p>
                    
                    {uploadProgress.failed > 0 && (
                      <p className="text-sm font-medium text-red-600">
                        {uploadProgress.failed} failed uploads
                      </p>
                    )}
                  </div>
                ) : (
                  // Single file upload
                  <div className="space-y-4">
                    <div className="relative inline-flex items-center justify-center mb-4">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-2xl blur-lg animate-pulse"></div>
                      <div className="relative w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
                        <Upload className="h-8 w-8 text-white animate-bounce" />
                      </div>
                    </div>
                    
                    <div className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                      Processing Resume...
                    </div>
                    
                    <div className="w-full bg-slate-200/60 rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-pulse"></div>
                    </div>
                    
                    <p className="text-sm font-medium text-slate-600">
                      Extracting text and generating AI embeddings
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* File Processing Overlay */}
        {isProcessingFiles && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="relative overflow-hidden bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-2xl shadow-green-500/20 p-8 max-w-md w-full mx-4">
              <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
              
              <div className="relative text-center space-y-4">
                <div className="relative inline-flex items-center justify-center mb-4">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-2xl blur-lg animate-pulse"></div>
                  <div className="relative w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-xl">
                    <span className="text-2xl animate-bounce">📄</span>
                  </div>
                </div>
                
                <div className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-2">
                  Processing Files ({processingProgress.processed} of {processingProgress.total})
                </div>
                
                <div className="w-full bg-slate-200/60 rounded-full h-3 mb-4 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${processingProgress.total > 0 ? (processingProgress.processed / processingProgress.total) * 100 : 0}%`
                    }}
                  ></div>
                </div>
                
                {processingProgress.currentFile && (
                  <p className="text-sm font-medium text-slate-600 truncate">
                    Current: {processingProgress.currentFile}
                  </p>
                )}
                
                <p className="text-xs text-slate-500">
                  Extracting text and generating embeddings...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Resume Grid/List */}
        <div className="relative overflow-hidden bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-xl shadow-blue-500/10">
          <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
          
          <div className="relative p-6 sm:p-8">
            {/* Selection Controls */}
            {(filteredResumes.length > 0 || folders.length > 0) && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 pb-6 border-b border-slate-200/60">
                <div className="flex items-center space-x-4 mb-4 sm:mb-0">
                  <button
                    onClick={selectedResumes.length === filteredResumes.length ? clearSelection : selectAllResumes}
                    className="inline-flex items-center px-4 py-2 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    {selectedResumes.length === filteredResumes.length ? (
                      <>
                        <input type="checkbox" checked className="mr-2 rounded" readOnly />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <input type="checkbox" checked={false} className="mr-2 rounded" readOnly />
                        Select All ({filteredResumes.length} resumes)
                      </>
                    )}
                  </button>
                  
                  {selectedResumes.length > 0 && (
                    <span className="inline-flex items-center px-3 py-1.5 bg-blue-100/80 text-blue-700 text-sm font-medium rounded-xl">
                      {selectedResumes.length} selected
                    </span>
                  )}

                  {/* Items per page selector */}
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-slate-600">Show:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => changeItemsPerPage(Number(e.target.value))}
                      className="px-3 py-1.5 bg-white/80 border border-slate-200/60 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      <option value={6}>6</option>
                      <option value={12}>12</option>
                      <option value={24}>24</option>
                      <option value={48}>48</option>
                    </select>
                    <span className="text-sm text-slate-600">per page</span>
                  </div>
                </div>
                
                <div className="text-sm text-slate-600 font-medium">
                  {totalPages > 0 ? (
                    <>
                      Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, folders.length + filteredResumes.length)} of {folders.length + filteredResumes.length} items
                      {debouncedSearchTerm && <span className="text-blue-600"> (filtered)</span>}
                      {totalPages > 1 && <span className="text-slate-500"> • Page {currentPage} of {totalPages}</span>}
                    </>
                  ) : (
                    <>
                      {folders.length + filteredResumes.length} total items
                      {debouncedSearchTerm && <span className="text-blue-600"> (filtered)</span>}
                    </>
                  )}
                  {loading && resumes.length > 0 && (
                    <span className="inline-flex items-center ml-2 text-blue-600">
                      <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                      Updating...
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Resume Content */}
            {(loading && (resumes.length === 0 || initialLoading)) ? (
              <div className="text-center py-12">
                <div className="relative inline-flex items-center justify-center mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-2xl flex items-center justify-center">
                    <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
                  </div>
                </div>
                <div className="text-lg font-semibold text-slate-700">Loading resumes...</div>
                <div className="text-sm text-slate-500 mt-1">Please wait while we fetch your data</div>
              </div>
            ) : filteredResumes.length === 0 && folders.length === 0 ? (
              <div className="text-center py-16">
                <div className="relative inline-flex items-center justify-center mb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-500/10 to-slate-600/10 rounded-2xl blur-lg"></div>
                  <div className="relative w-20 h-20 bg-gradient-to-br from-slate-500/20 to-slate-600/20 rounded-2xl flex items-center justify-center">
                    <File className="h-10 w-10 text-slate-500" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">
                  {debouncedSearchTerm ? 'No matching items found' : 'No content yet'}
                </h3>
                <p className="text-slate-500 font-medium mb-6 max-w-sm mx-auto">
                  {debouncedSearchTerm 
                    ? `Try adjusting your search term "${debouncedSearchTerm}" or clear the filter to see all content.`
                    : 'Create folders or upload resumes to start organizing your candidate database.'
                  }
                </p>
                {debouncedSearchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="inline-flex items-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="resume-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {folderCards}
                  {resumeCards}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="pagination-controls mt-8 pt-6 border-t border-slate-200/60">
                    <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
                      {/* Page Info */}
                      <div className="text-sm text-slate-600 font-medium">
                        Page {currentPage} of {totalPages} ({folders.length + filteredResumes.length} total items)
                      </div>

                      {/* Pagination Buttons */}
                      <div className="flex items-center space-x-2">
                        {/* Previous Button */}
                        <button
                          onClick={goToPrevPage}
                          disabled={currentPage === 1}
                          className="page-button inline-flex items-center px-3 py-2 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/80"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                          Previous
                        </button>

                        {/* Page Numbers */}
                        <div className="flex items-center space-x-1">
                          {(() => {
                            const maxVisiblePages = 5
                            const pages = []
                            let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
                            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)
                            
                            // Adjust startPage if we're near the end
                            if (endPage - startPage < maxVisiblePages - 1) {
                              startPage = Math.max(1, endPage - maxVisiblePages + 1)
                            }

                            // Add first page and ellipsis if needed
                            if (startPage > 1) {
                              pages.push(
                                <button
                                  key={1}
                                  onClick={() => goToPage(1)}
                                  className="page-button inline-flex items-center justify-center w-10 h-10 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                                >
                                  1
                                </button>
                              )
                              if (startPage > 2) {
                                pages.push(
                                  <span key="ellipsis1" className="px-2 text-slate-400">...</span>
                                )
                              }
                            }

                            // Add visible page numbers
                            for (let i = startPage; i <= endPage; i++) {
                              pages.push(
                                <button
                                  key={i}
                                  onClick={() => goToPage(i)}
                                  className={`page-button inline-flex items-center justify-center w-10 h-10 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300 ${
                                    i === currentPage
                                      ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-transparent'
                                      : 'bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900'
                                  }`}
                                >
                                  {i}
                                </button>
                              )
                            }

                            // Add ellipsis and last page if needed
                            if (endPage < totalPages) {
                              if (endPage < totalPages - 1) {
                                pages.push(
                                  <span key="ellipsis2" className="px-2 text-slate-400">...</span>
                                )
                              }
                              pages.push(
                                <button
                                  key={totalPages}
                                  onClick={() => goToPage(totalPages)}
                                  className="page-button inline-flex items-center justify-center w-10 h-10 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                                >
                                  {totalPages}
                                </button>
                              )
                            }

                            return pages
                          })()}
                        </div>

                        {/* Next Button */}
                        <button
                          onClick={goToNextPage}
                          disabled={currentPage === totalPages}
                          className="page-button inline-flex items-center px-3 py-2 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/80"
                        >
                          Next
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>

                      {/* Quick Jump */}
                      {totalPages > 10 && (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-slate-600">Go to:</span>
                          <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={currentPage}
                            onChange={(e) => {
                              const page = parseInt(e.target.value)
                              if (page >= 1 && page <= totalPages) {
                                goToPage(page)
                              }
                            }}
                            className="w-16 px-2 py-1 bg-white/80 border border-slate-200/60 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Enhanced Modal for Bulk Communication */}
        {showBulkCommunication && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
            <div className="relative top-8 mx-auto p-5 w-11/12 md:w-3/4 lg:w-1/2 max-w-4xl">
              <div className="relative overflow-hidden bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-2xl shadow-blue-500/20">
                <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
                
                <div className="relative p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <Mail className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                          Send Bulk Update
                        </h3>
                        <p className="text-sm text-slate-600 font-medium">
                          Communicate with {selectedResumes.length} selected candidates
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowBulkCommunication(false)}
                      className="w-10 h-10 bg-slate-100/80 hover:bg-slate-200/80 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-800 transition-all duration-200"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        Update Title
                      </label>
                      <input
                        type="text"
                        value={bulkTitle}
                        onChange={(e) => setBulkTitle(e.target.value)}
                        placeholder="e.g., Application Status Update, Interview Invitation..."
                        className="w-full px-4 py-3 bg-white/80 border border-slate-200/60 hover:border-slate-300/80 focus:border-blue-500/60 rounded-2xl shadow-sm hover:shadow-md focus:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 placeholder-slate-500 text-slate-900 font-medium"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        Message Content
                      </label>
                      <textarea
                        value={bulkMessage}
                        onChange={(e) => setBulkMessage(e.target.value)}
                        placeholder="Enter your update message for the selected candidates..."
                        rows={6}
                        className="w-full px-4 py-3 bg-white/80 border border-slate-200/60 hover:border-slate-300/80 focus:border-blue-500/60 rounded-2xl shadow-sm hover:shadow-md focus:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 placeholder-slate-500 text-slate-900 font-medium resize-none"
                      />
                    </div>

                    {/* Email Configuration */}
                    <div className="relative overflow-hidden bg-slate-50/80 border border-slate-200/60 rounded-2xl p-6">
                      <div className="flex items-center space-x-3 mb-4">
                        <input
                          type="checkbox"
                          id="sendRealEmails"
                          checked={sendRealEmails}
                          onChange={(e) => setSendRealEmails(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                        />
                        <label htmlFor="sendRealEmails" className="text-sm font-semibold text-slate-700">
                          📧 Send real emails to candidates
                        </label>
                      </div>
                      
                      {sendRealEmails && (
                        <div className={`p-4 rounded-xl border ${
                          import.meta.env.VITE_EMAILJS_SERVICE_ID 
                            ? 'bg-green-50/80 border-green-200/60' 
                            : 'bg-yellow-50/80 border-yellow-200/60'
                        }`}>
                          <div className="text-sm">
                            {import.meta.env.VITE_EMAILJS_SERVICE_ID ? (
                              <div className="text-green-700">
                                <strong>✅ EmailJS configured</strong> - Ready for professional email sending
                                <br />Emails will be sent directly to extracted candidate addresses
                              </div>
                            ) : (
                              <div className="text-yellow-700">
                                <strong>⚠️ EmailJS not configured</strong> - Will use email client fallback
                                <br />Set up EmailJS for direct sending: VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {!sendRealEmails && (
                        <div className="p-4 bg-blue-50/80 border border-blue-200/60 rounded-xl">
                          <p className="text-sm text-blue-700">
                            <strong>📋 Tracking Mode:</strong> Creates communication record for tracking only. No emails sent.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-slate-200/60">
                    <button
                      onClick={() => setShowBulkCommunication(false)}
                      className="px-6 py-3 bg-white/80 hover:bg-white border border-slate-200/60 hover:border-slate-300/80 text-slate-700 hover:text-slate-900 font-medium rounded-2xl shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        console.log('Send Emails button clicked!');
                        console.log('Current state:', {
                          bulkTitle: bulkTitle.trim(),
                          bulkMessage: bulkMessage.trim(),
                          emailSending,
                          sendRealEmails
                        });
                        handleBulkCommunication();
                      }}
                      disabled={!bulkTitle.trim() || !bulkMessage.trim() || emailSending}
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                    >
                      {emailSending ? 'Sending...' : sendRealEmails ? '📧 Send Emails' : '📋 Create Record'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Communication History Modal */}
        {showCommunicationHistory && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
            <div className="relative top-8 mx-auto p-5 w-11/12 md:w-3/4 lg:w-2/3 max-w-5xl">
              <div className="relative overflow-hidden bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-3xl shadow-2xl shadow-blue-500/20">
                <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-slate-50/30"></div>
                
                <div className="relative p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <MessageSquare className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                          Communication History
                        </h3>
                        <p className="text-sm text-slate-600 font-medium">
                          Track all your candidate communications
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCommunicationHistory(false)}
                      className="w-10 h-10 bg-slate-100/80 hover:bg-slate-200/80 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-800 transition-all duration-200"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="max-h-96 overflow-y-auto">
                    {loadingCommunications ? (
                      <div className="text-center py-12">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <div className="text-slate-600 font-medium">Loading communications...</div>
                      </div>
                    ) : communications.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 bg-gradient-to-br from-slate-500/20 to-slate-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <MessageSquare className="h-8 w-8 text-slate-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">No communications yet</h3>
                        <p className="text-slate-500 font-medium">
                          Your bulk communications will appear here once you start sending updates.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {communications.map((comm) => (
                          <div key={comm.id} className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2">
                                  <h4 className="font-semibold text-slate-900">{comm.title}</h4>
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${
                                    comm.status === 'sent' ? 'bg-green-100/80 text-green-700' :
                                    comm.status === 'failed' ? 'bg-red-100/80 text-red-700' :
                                    'bg-yellow-100/80 text-yellow-700'
                                  }`}>
                                    {comm.status}
                                  </span>
                                </div>
                                <p className="text-slate-600 mb-3 leading-relaxed">{comm.message}</p>
                                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                                  <span className="flex items-center">
                                    📅 {new Date(comm.created_at).toLocaleDateString()}
                                  </span>
                                  <span className="flex items-center">
                                    👥 {comm.total_recipients} recipients
                                  </span>
                                  <span className="flex items-center">
                                    ✅ {comm.successful_deliveries} delivered
                                  </span>
                                  {comm.failed_deliveries > 0 && (
                                    <span className="flex items-center text-red-600">
                                      ❌ {comm.failed_deliveries} failed
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Communication Modal */}
        {showBulkCommunication && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Send Bulk Update to {selectedResumes.length} Candidates
                  </h3>
                  <button
                    onClick={() => setShowBulkCommunication(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Update Title
                    </label>
                    <input
                      type="text"
                      value={bulkTitle}
                      onChange={(e) => setBulkTitle(e.target.value)}
                      placeholder="e.g., Application Status Update, Interview Invitation..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Message
                    </label>
                    <textarea
                      value={bulkMessage}
                      onChange={(e) => setBulkMessage(e.target.value)}
                      placeholder="Enter your update message for the selected candidates..."
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Email sending option */}
                  <div className="border rounded-md p-4 bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="sendRealEmails"
                        checked={sendRealEmails}
                        onChange={(e) => setSendRealEmails(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="sendRealEmails" className="text-sm font-medium text-gray-700">
                        📧 Send real emails to candidates
                      </label>
                    </div>
                    {sendRealEmails && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <p className="text-sm text-yellow-800">
                          <strong>⚙️ Email Setup Options:</strong> 
                          <br />
                          <strong>Option 1 (Recommended):</strong> EmailJS - Browser-compatible
                          <br />• Sign up at <a href="https://emailjs.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">emailjs.com</a>
                          <br />• Add <code>VITE_EMAILJS_SERVICE_ID</code>, <code>VITE_EMAILJS_TEMPLATE_ID</code>, <code>VITE_EMAILJS_PUBLIC_KEY</code>
                          <br />• Restart dev server after adding variables
                          <br />
                          <strong>Option 2 (Fallback):</strong> Opens your default email client
                          <br />• Works without setup for testing
                          <br />• Emails will be extracted automatically from resume content
                          <br />
                          {!import.meta.env.VITE_EMAILJS_SERVICE_ID && (
                            <span className="text-orange-600">
                              <br />⚠️ <strong>EmailJS not configured</strong> - will use email client fallback
                            </span>
                          )}
                          {import.meta.env.VITE_EMAILJS_SERVICE_ID && (
                            <span className="text-green-600">
                              <br />✅ <strong>EmailJS configured</strong> - ready for professional email sending
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {!sendRealEmails ? (
                    <div className="bg-blue-50 p-3 rounded-md">
                      <p className="text-sm text-blue-800">
                        <strong>📋 Tracking Mode:</strong> This will create a communication record for tracking purposes only. 
                        No actual emails will be sent.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-green-50 p-3 rounded-md">
                      <p className="text-sm text-green-800">
                        <strong>📧 Email Mode:</strong> Real emails will be sent to candidates. 
                        Email addresses will be automatically extracted from resume content.
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setShowBulkCommunication(false)}
                    disabled={emailSending}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkCommunication}
                    disabled={!bulkTitle.trim() || !bulkMessage.trim() || emailSending}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md flex items-center"
                  >
                    {emailSending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {sendRealEmails ? 'Sending Emails...' : 'Creating Record...'}
                      </>
                    ) : (
                      sendRealEmails ? '📧 Send Emails' : '📋 Create Record'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Communication History Modal */}
        {showCommunicationHistory && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-4/5 lg:w-3/4 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Communication History
                  </h3>
                  <button
                    onClick={() => setShowCommunicationHistory(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                
                {loadingCommunications ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-sm text-gray-500">Loading communications...</p>
                  </div>
                ) : communications.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No communications yet</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Your bulk communications will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {communications.map((comm) => (
                      <div key={comm.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-medium text-gray-900">{comm.title}</h4>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                comm.status === 'sent' ? 'bg-green-100 text-green-800' :
                                comm.status === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {comm.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{comm.message}</p>
                            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                              <span>📅 {new Date(comm.created_at).toLocaleDateString()}</span>
                              <span>👥 {comm.total_recipients} recipients</span>
                              <span>✅ {comm.successful_deliveries} delivered</span>
                              {comm.failed_deliveries > 0 && (
                                <span className="text-red-600">❌ {comm.failed_deliveries} failed</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
