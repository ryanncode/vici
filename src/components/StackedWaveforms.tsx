import React from 'react';
import { useMixerStore } from '../store/mixerStore';

export const StackedWaveforms: React.FC = () => {
  const deckA = useMixerStore(state => state.deckA);
  const deckB = useMixerStore(state => state.deckB);

  // For now, these are placeholder visual implementations.
  // We will integrate the actual canvas rendering for scrolling beatgrids later.
  
  return (
    <div className="h-[150px] shrink-0 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col w-full relative overflow-hidden shadow-lg">
      
      {/* Central Playhead Line (Static, dead center) */}
      <div className="absolute top-[20px] bottom-[20px] left-1/2 w-1 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)] z-50 -translate-x-1/2 pointer-events-none rounded-full"></div>

      {/* Deck A Overview (20px) */}
      <div className="h-[20px] w-full bg-slate-100 dark:bg-slate-950 flex relative border-b-2 border-slate-200 dark:border-slate-800 group cursor-pointer">
        {deckA.track ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-blue-500/50 font-mono">
            [ Deck A Overview Waveform ]
          </div>
        ) : (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.05)_10px,rgba(0,0,0,0.05)_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]"></div>
        )}
      </div>

      {/* Deck A Zoom Grid (55px) */}
      <div className="flex-1 h-[55px] w-full relative flex items-center border-b-2 border-slate-300 dark:border-slate-700 cursor-grab active:cursor-grabbing">
        {deckA.track ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-blue-500/40 font-mono tracking-widest font-bold">
            {'> > > SCROLLING BEATGRID A > > >'}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-600 font-mono tracking-widest">
            NO TRACK LOADED
          </div>
        )}
      </div>

      {/* Deck B Zoom Grid (55px) */}
      <div className="flex-1 h-[55px] w-full relative flex items-center border-b-2 border-slate-200 dark:border-slate-800 cursor-grab active:cursor-grabbing">
        {deckB.track ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-amber-500/40 font-mono tracking-widest font-bold">
            {'> > > SCROLLING BEATGRID B > > >'}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-600 font-mono tracking-widest">
            NO TRACK LOADED
          </div>
        )}
      </div>

      {/* Deck B Overview (20px) */}
      <div className="h-[20px] w-full bg-slate-100 dark:bg-slate-950 flex relative group cursor-pointer">
        {deckB.track ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-amber-500/50 font-mono">
            [ Deck B Overview Waveform ]
          </div>
        ) : (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.05)_10px,rgba(0,0,0,0.05)_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]"></div>
        )}
      </div>

    </div>
  );
};
