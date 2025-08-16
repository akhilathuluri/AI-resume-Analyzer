/*
  # Add Folder Support for Resume Organization

  1. New Table
    - `folders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `name` (text, folder name)
      - `path` (text, full path for nested folders)
      - `parent_folder_id` (uuid, foreign key to folders, nullable for root folders)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Modify existing tables
    - Add `folder_id` to `resumes` table to associate resumes with folders

  3. Security
    - Enable RLS on folders table
    - Add policies for authenticated users to manage their own folders
    - Users can only access their own folders

  4. Constraints
    - Ensure folder names are unique within the same parent folder for each user
    - Prevent circular references in folder hierarchy
*/

-- Create folders table
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  parent_folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique folder names within the same parent for each user
  CONSTRAINT unique_folder_name_per_parent UNIQUE (user_id, parent_folder_id, name)
);

-- Add folder_id to resumes table (nullable for backward compatibility)
ALTER TABLE public.resumes 
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

-- Enable Row Level Security on folders table
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for folders table
CREATE POLICY "Users can view their own folders"
  ON public.folders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own folders"
  ON public.folders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders"
  ON public.folders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders"
  ON public.folders
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON public.folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON public.folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON public.folders(path);
CREATE INDEX IF NOT EXISTS idx_resumes_folder_id ON public.resumes(folder_id);

-- Create trigger to automatically update updated_at for folders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_folders_updated_at'
  ) THEN
    CREATE TRIGGER update_folders_updated_at
      BEFORE UPDATE ON public.folders
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Function to prevent circular references in folder hierarchy
CREATE OR REPLACE FUNCTION prevent_folder_circular_reference()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the new parent would create a circular reference
  IF NEW.parent_folder_id IS NOT NULL THEN
    -- Use a recursive CTE to check if NEW.id appears in the ancestry chain of NEW.parent_folder_id
    WITH RECURSIVE folder_ancestry AS (
      -- Base case: start with the new parent
      SELECT id, parent_folder_id, 1 as depth
      FROM public.folders 
      WHERE id = NEW.parent_folder_id AND user_id = NEW.user_id
      
      UNION ALL
      
      -- Recursive case: go up the hierarchy
      SELECT f.id, f.parent_folder_id, fa.depth + 1
      FROM public.folders f
      INNER JOIN folder_ancestry fa ON f.id = fa.parent_folder_id
      WHERE fa.depth < 100 -- Prevent infinite loops in case of existing circular refs
    )
    SELECT 1 FROM folder_ancestry WHERE id = NEW.id LIMIT 1;
    
    IF FOUND THEN
      RAISE EXCEPTION 'Cannot create circular reference in folder hierarchy';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to prevent circular references
DROP TRIGGER IF EXISTS prevent_folder_circular_reference_trigger ON public.folders;
CREATE TRIGGER prevent_folder_circular_reference_trigger
  BEFORE INSERT OR UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_folder_circular_reference();

-- Function to update folder path when parent changes
CREATE OR REPLACE FUNCTION update_folder_path()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the path based on parent folder
  IF NEW.parent_folder_id IS NULL THEN
    NEW.path = NEW.name;
  ELSE
    -- Get parent folder path and append this folder's name
    SELECT path || '/' || NEW.name INTO NEW.path
    FROM public.folders
    WHERE id = NEW.parent_folder_id AND user_id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update folder path
DROP TRIGGER IF EXISTS update_folder_path_trigger ON public.folders;
CREATE TRIGGER update_folder_path_trigger
  BEFORE INSERT OR UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION update_folder_path();

-- Function to update paths of child folders when parent path changes
CREATE OR REPLACE FUNCTION update_child_folder_paths()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update children if the path actually changed
  IF TG_OP = 'UPDATE' AND OLD.path != NEW.path THEN
    -- Update all descendant folders' paths
    WITH RECURSIVE folder_descendants AS (
      -- Base case: direct children
      SELECT id, name, parent_folder_id, path, 1 as depth
      FROM public.folders 
      WHERE parent_folder_id = NEW.id AND user_id = NEW.user_id
      
      UNION ALL
      
      -- Recursive case: children of children
      SELECT f.id, f.name, f.parent_folder_id, f.path, fd.depth + 1
      FROM public.folders f
      INNER JOIN folder_descendants fd ON f.parent_folder_id = fd.id
      WHERE fd.depth < 100 -- Prevent infinite loops
    )
    UPDATE public.folders
    SET path = NEW.path || substring(folder_descendants.path, length(OLD.path) + 1)
    FROM folder_descendants
    WHERE public.folders.id = folder_descendants.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update child folder paths
DROP TRIGGER IF EXISTS update_child_folder_paths_trigger ON public.folders;
CREATE TRIGGER update_child_folder_paths_trigger
  AFTER UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION update_child_folder_paths();
