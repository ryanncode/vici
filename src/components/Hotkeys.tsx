import React, { useState } from 'react';

export const Hotkeys: React.FC = () => {
  const [maxSampleRate, setMaxSampleRate] = useState<string>(() => localStorage.getItem('vici_max_samplerate') || '0');
  const [headroom, setHeadroom] = useState<string>(() => localStorage.getItem('vici_headroom') || '-3');

  const handleSampleRateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setMaxSampleRate(val);
    if (val === '0') {
      localStorage.removeItem('vici_max_samplerate');
    } else {
      localStorage.setItem('vici_max_samplerate', val);
    }
    // Need reload to take effect
    if (confirm("Audio engine sample rate change requires a reload. Reload now?")) {
      window.location.reload();
    }
  };

  const handleHeadroomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setHeadroom(val);
    localStorage.setItem('vici_headroom', val);
    if (confirm("Audio engine headroom change requires a reload. Reload now?")) {
      window.location.reload();
    }
  };

  return (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-900 flex flex-col relative">
      {/* Header */}
      <div className="h-[60px] bg-white dark:bg-slate-800 border-b-2 border-slate-300 dark:border-slate-700 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path>
              <path d="M6 10h.01"></path>
              <path d="M10 10h.01"></path>
              <path d="M14 10h.01"></path>
              <path d="M18 10h.01"></path>
              <path d="M8 14h8"></path>
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Settings & MIDI</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure engine and map hardware controllers</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">Audio Engine</h3>
          </div>
          <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700/50">
            <div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Max Sample Rate</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cap the hardware WebAudio context sample rate to save CPU.</div>
            </div>
            <select 
              value={maxSampleRate}
              onChange={handleSampleRateChange}
              className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 outline-none"
            >
              <option value="0">Auto (Hardware Default)</option>
              <option value="44100">44.1 kHz</option>
              <option value="48000">48 kHz</option>
              <option value="88200">88.2 kHz</option>
              <option value="96000">96 kHz</option>
            </select>
          </div>
          <div className="p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Master Headroom</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Attenuate output before the Master Limiter to prevent pumping or distortion.</div>
            </div>
            <select 
              value={headroom}
              onChange={handleHeadroomChange}
              className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 outline-none"
            >
              <option value="0">0 dB (Loud)</option>
              <option value="-1.5">-1.5 dB</option>
              <option value="-3">-3.0 dB (Standard)</option>
              <option value="-6">-6.0 dB</option>
              <option value="-9">-9.0 dB (Safe)</option>
            </select>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">Global Keyboard Shortcuts</h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {[
              { action: 'Play/Pause Deck A', key: 'Shift + Space' },
              { action: 'Play/Pause Deck B', key: 'Space' },
              { action: 'Nudge Pitch Deck A (+/-)', key: 'W / S' },
              { action: 'Nudge Pitch Deck B (+/-)', key: 'Up / Down Arrows' },
              { action: 'Crossfader Left / Right', key: 'Left / Right Arrows' },
              { action: 'Navigate Library Crates', key: 'Up / Down Arrows (when active)' },
              { action: 'Load Selected Crate to Queue', key: 'Enter (when active)' },
            ].map((hk, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <span className="text-sm text-slate-700 dark:text-slate-300">{hk.action}</span>
                <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono text-slate-600 dark:text-slate-400 shadow-sm">{hk.key}</kbd>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest">MIDI Assignments</h3>
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded">No Device Connected</span>
          </div>
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center">
             <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                <circle cx="6" cy="12" r="2"></circle>
                <circle cx="12" cy="12" r="2"></circle>
                <circle cx="18" cy="12" r="2"></circle>
              </svg>
            <p className="text-sm mb-2">Connect a MIDI controller and use the "MIDI Learn" button on the mixer to start assigning controls.</p>
            <p className="text-xs opacity-70">Assigned mappings will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
