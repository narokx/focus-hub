import React, { useRef } from 'react';
import { Settings, Download, Upload, Moon, Sun } from 'lucide-react';
import { Settings, Download, Upload, Moon, Sun, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
@@ -15,6 +16,7 @@ const STORAGE_KEY = 'productivity-heatmap-state';
export function SettingsModal() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { signOut, user } = useAuth();

  const handleExport = () => {
    const data = localStorage.getItem(STORAGE_KEY);
@@ -112,6 +114,26 @@ export function SettingsModal() {
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
