import React, { useState } from 'react';
import { useMixerStore } from '../store/mixerStore';

interface DeckColumnProps {
  deckId: 'A' | 'B';
}

export const DeckColumn: React.FC<DeckColumnProps> = ({ deckId }) => {
  const isLeft = deckId === 'A';
  const state = useMixerStore(state => deckId === 'A' ? state.deckA : state.deckB);
  
  const [padMode, setPadMode] = useState<'HOT_CUE' | 'LOOP' | 'SAMPLER'>('HOT_CUE');

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const track = state.track;

  return (
    <div className={`w-[390px] h-[520px] shrink-0 flex flex-col relative gap-[10px]`}>
      
      {/* 1. Metadata Block (Floating Widget) */}
      <div className="h-[90px] w-full px-4 py-1.5 flex flex-col justify-between bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-md shrink-0">
        {/* Row 1: Title & BPM */}
        <div className="flex justify-between items-end mb-0.5">
          <span className="text-[18px] font-bold text-slate-800 dark:text-white truncate max-w-[280px]">
            {track?.title || 'No Track Loaded'}
          </span>
          <span className="text-[20px] font-bold font-mono text-blue-500">
            {track ? (track.bpm || 120).toFixed(1) : '0.0'}
          </span>
        </div>
        
        {/* Row 2: Artist & Key */}
        <div className="flex justify-between items-center -mt-0.5">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[280px]">
            {track?.artist || 'Unknown Artist'}
          </span>
          <span className="text-[12px] font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-600">
            {track?.key || '8A / Am'}
          </span>
        </div>

        {/* Row 3: Elapsed & Remaining Time */}
        <div className="flex justify-between items-baseline mt-0.5">
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-bold">
            {formatTime(0)}
          </span>
          <span className={`text-lg font-mono font-bold ${track ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'}`}>
            -{formatTime(track ? (typeof track.duration === 'string' ? parseFloat(track.duration) : track.duration) : 0)}
          </span>
        </div>
      </div>

      <div className={`flex flex-1 ${isLeft ? 'flex-row' : 'flex-row-reverse'} gap-[10px]`}>
        
        {/* 2. Outer Edge: Pitch Control (Floating Widget) */}
        <div className={`w-[50px] h-full bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center py-4 justify-between shadow-md shrink-0`}>
          <button className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-bold flex items-center justify-center transition">
            +
          </button>
          
          {/* Pitch Slider */}
          <div className="flex-1 w-8 my-4 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 relative flex justify-center py-2 cursor-ns-resize shadow-inner">
            <div className="w-0.5 bg-slate-400 dark:bg-black h-full rounded-full"></div>
            {/* Center zero line */}
            <div className="absolute top-1/2 w-4 h-0.5 bg-slate-400 dark:bg-white/30 -translate-y-1/2"></div>
            {/* Pitch Fader Cap */}
            <div className="absolute top-1/2 -translate-y-1/2 w-full h-6 bg-slate-300 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 rounded flex items-center justify-center shadow-lg">
              <div className="w-full h-0.5 bg-white dark:bg-white/40"></div>
            </div>
          </div>

          <button className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-bold flex items-center justify-center transition mb-4">
            -
          </button>

          <button className="w-8 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 flex flex-col items-center justify-center transition relative overflow-hidden group">
            <div className="w-full h-1 bg-green-500/40 absolute top-0"></div>
            <span className="text-[9px] font-bold tracking-widest mt-1">SYNC</span>
          </button>
        </div>

        {/* 3. Core Area: Performance Grid & Smart FX (Floating Widget) */}
        <div className="flex-1 h-full flex flex-col bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl p-4 shadow-md overflow-hidden">
          
          {/* Dynamic Performance Pad Matrix (Top Half) */}
          <div className="flex-1 flex flex-col">
            {/* Mode Tabs */}
            <div className="flex gap-1 mb-2">
              <button onClick={() => setPadMode('HOT_CUE')} className={`flex-1 py-1 text-[10px] font-bold tracking-wider rounded-lg border-2 ${padMode === 'HOT_CUE' ? 'bg-slate-800 text-white border-blue-500 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-600'}`}>HOT CUE</button>
              <button onClick={() => setPadMode('LOOP')} className={`flex-1 py-1 text-[10px] font-bold tracking-wider rounded-lg border-2 ${padMode === 'LOOP' ? 'bg-slate-800 text-white border-green-500 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-600'}`}>LOOP</button>
              <button onClick={() => setPadMode('SAMPLER')} className={`flex-1 py-1 text-[10px] font-bold tracking-wider rounded-lg border-2 ${padMode === 'SAMPLER' ? 'bg-slate-800 text-white border-purple-500 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-600'}`}>SAMPLER</button>
            </div>
            
            {/* 2x4 Pad Grid */}
            <div className="grid grid-cols-4 grid-rows-2 gap-2 flex-1 mb-4">
              {[...Array(8)].map((_, i) => (
                <button key={i} className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm relative overflow-hidden group transition-colors">
                  {/* Subtle top color bar representing pad state */}
                  <div className={`w-full h-1.5 absolute top-0 ${padMode === 'HOT_CUE' ? 'bg-blue-500/40 group-hover:bg-blue-500/60' : padMode === 'LOOP' ? 'bg-green-500/40 group-hover:bg-green-500/60' : 'bg-purple-500/40 group-hover:bg-purple-500/60'}`}></div>
                </button>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className="w-full h-px bg-slate-200 dark:bg-slate-700 mb-4"></div>

          {/* Modular Smart FX Bank (Bottom Half) */}
          <div className="h-[150px] flex flex-col justify-between">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-1">SMART FX</div>
            
            {/* 3 Parallel FX Slots */}
            {[1, 2, 3].map((slot) => (
              <div key={slot} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50 mb-1 last:mb-0 shadow-sm">
                <div className="w-10 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                  <div className="w-6 h-1 rounded-full bg-slate-400 dark:bg-slate-500 mb-1"></div>
                  <div className="w-4 h-1 rounded-full bg-slate-400 dark:bg-slate-500"></div>
                </div>
                
                <div className="flex-1 flex flex-col">
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white">Delay ▼</span>
                </div>
                
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 shadow-inner relative flex items-center justify-center cursor-ns-resize">
                  <div className="absolute top-1 w-0.5 h-2 bg-slate-500 dark:bg-white/40 rounded-full"></div>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
};
