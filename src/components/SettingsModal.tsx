import React, { useRef, useState } from 'react';
import { Settings, Download, Upload, Moon, Sun, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTheme } from '@/hooks/useTheme';

const STORAGE_KEY = 'productivity-heatmap-state';

export function SettingsModal({ onImportComplete }: { onImportComplete?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { signOut, user } = useAuth();

  const handleExport = () => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return;
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `productivity-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isValidUUID = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result as string;
        const parsed = JSON.parse(data);

        if (!Array.isArray(parsed.quickTasks)) {
          alert('Invalid backup file structure.');
          return;
        }

        // Save to localStorage for backward compatibility
        localStorage.setItem(STORAGE_KEY, data);

        if (user) {
          setIsImporting(true);
          const quickTasks: any[] = parsed.quickTasks;

          // Separate tasks with valid UUIDs from those without
          const withValidId = quickTasks.filter(t => t.id && isValidUUID(t.id));
          const withoutValidId = quickTasks.filter(t => !t.id || !isValidUUID(t.id));

          // Upsert tasks with valid UUIDs (conflict on id)
          if (withValidId.length > 0) {
            const rows = withValidId.map(t => ({
              id: t.id,
              name: t.name,
              color: t.color || '#3B82F6',
              user_id: user.id,
            }));
            const { error } = await supabase.from('tasks').upsert(rows, { onConflict: 'id' });
            if (error) {
              console.error('Failed to upsert tasks with valid IDs:', error);
              alert('Failed to import some tasks to cloud.');
              setIsImporting(false);
              return;
            }
          }

          // For tasks without valid UUIDs, deduplicate by name
          if (withoutValidId.length > 0) {
            // Fetch existing task names for this user
            const { data: existing } = await supabase
              .from('tasks')
              .select('name')
              .eq('user_id', user.id);
            const existingNames = new Set((existing || []).map(t => t.name.toLowerCase()));

            const newTasks = withoutValidId
              .filter(t => !existingNames.has(t.name.toLowerCase()))
              .map(t => ({
                name: t.name,
                color: t.color || '#3B82F6',
                user_id: user.id,
              }));

            if (newTasks.length > 0) {
              const { error } = await supabase.from('tasks').insert(newTasks);
              if (error) {
                console.error('Failed to insert new tasks:', error);
                alert('Failed to import some tasks to cloud.');
                setIsImporting(false);
                return;
              }
            }
          }

          // Refresh UI state
          if (onImportComplete) {
            onImportComplete();
          }
          setIsImporting(false);
          alert('Tasks imported successfully!');
        } else {
          alert('Data imported locally. Sign in to sync to cloud.');
        }
      } catch {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
          <Settings className="w-5 h-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your preferences and data</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
              <div>
                <div className="text-sm font-medium">Theme</div>
                <div className="text-xs text-muted-foreground">{theme === 'dark' ? 'Dark mode active' : 'Light mode active'}</div>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                theme === 'dark' ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-secondary transition-colors text-left"
          >
            <Download className="w-5 h-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Export Data</div>
              <div className="text-xs text-muted-foreground">Download all data as a .json file</div>
            </div>
          </button>

          {/* Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-secondary transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className={`w-5 h-5 text-primary ${isImporting ? 'animate-pulse' : ''}`} />
            <div>
              <div className="text-sm font-medium">{isImporting ? 'Importing...' : 'Import Data'}</div>
              <div className="text-xs text-muted-foreground">{isImporting ? 'Syncing with Supabase...' : 'Restore from a .json backup'}</div>
            </div>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />

          {/* Sign Out */}
          {user && (
            <>
              <div className="border-t border-border my-1" />
              <div className="px-4 py-1">
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-destructive/30 hover:bg-destructive/10 transition-colors text-left text-destructive"
              >
                <LogOut className="w-5 h-5" />
                <div>
                  <div className="text-sm font-medium">Sign Out</div>
                  <div className="text-xs opacity-70">Log out and return to login</div>
                </div>
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
