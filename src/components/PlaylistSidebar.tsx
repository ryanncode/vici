import React, { useState, useRef } from 'react';
import { Save, FolderOpen, ListMusic } from 'lucide-react';
import { parseM3U, generateM3U } from '../utils/m3uParser';
import type { Track } from '../types/mixer';

interface PlaylistSidebarProps {
  library: Track[];
  setLibrary: React.Dispatch<React.SetStateAction<Track[]>>;
}

export function PlaylistSidebar({ library, setLibrary }: PlaylistSidebarProps) {
  const [dragActive, setDragActive] = useState(false);
  const fallbackM3uInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const applyM3U = (content: string) => {
    const paths = parseM3U(content);
    // match them against the active file handles in the current library
    const newLibrary = paths.map(path => {
      // Extract filename from path for loose matching
      const filename = path.split('\\').pop()?.split('/').pop();
      return library.find(t => t.fileHandle?.name === filename || t.title === filename || t.url === path);
    }).filter(Boolean) as Track[];
    
    if (newLibrary.length > 0) {
      setLibrary(newLibrary);
    } else {
      alert('No matching files found in the currently loaded directory. Please load the directory containing these audio files first.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.m3u') || file.name.endsWith('.m3u8')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          applyM3U(content);
        };
        reader.readAsText(file);
      }
    }
  };

  const handleOpen = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ accept: { 'audio/x-mpegurl': ['.m3u', '.m3u8'] } }]
        });
        const file = await handle.getFile();
        const content = await file.text();
        applyM3U(content);
        return;
      } catch (e) {
        console.warn('showOpenFilePicker failed or cancelled', e);
      }
    }
    fallbackM3uInputRef.current?.click();
  };

  const handleFallbackM3u = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      applyM3U(content);
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    try {
      const m3uContent = generateM3U(library.map(t => t.url));
      const handle = await window.showSaveFilePicker({
        suggestedName: 'playlist.m3u',
        types: [{ accept: { 'audio/x-mpegurl': ['.m3u'] } }]
      });
      // @ts-expect-error createWritable is part of File System Access API
      const writable = await handle.createWritable();
      await writable.write(m3uContent);
      await writable.close();
      alert('Playlist saved!');
    } catch (e) {
      console.log('User cancelled or error', e);
    }
  };

  return (
    <div 
      className={`w-64 bg-slate-950 border-r border-slate-800 p-4 flex flex-col gap-4 ${dragActive ? 'bg-slate-900 border-amber-500' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <ListMusic size={18} className="text-amber-500" />
        <h3 className="font-semibold text-slate-200">Playlists</h3>
      </div>
      <div className="flex gap-2">
        <button onClick={handleOpen} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center gap-2 text-sm transition">
          <FolderOpen size={16} /> Open
        </button>
        <button onClick={handleSave} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center gap-2 text-sm transition">
          <Save size={16} /> Save
        </button>
      </div>
      <input 
        type="file" 
        ref={fallbackM3uInputRef} 
        style={{ display: 'none' }} 
        accept=".m3u,.m3u8"
        onChange={handleFallbackM3u} 
      />
      <div className="flex-1 text-sm text-slate-500 flex items-center justify-center border-2 border-dashed border-slate-800 rounded-lg p-4 text-center">
        Drag & Drop .m3u files here
      </div>
    </div>
  );
}
