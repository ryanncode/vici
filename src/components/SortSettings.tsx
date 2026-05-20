import React, { useState } from 'react';
import { useMixerStore } from '../store/mixerStore';
import { useLibraryStore } from '../store/libraryStore';
import type { Track } from '../types/mixer';

interface SortSettingsProps {
  onClose: () => void;
}

export const SortSettings: React.FC<SortSettingsProps> = ({ onClose }) => {
  const automixBars = useMixerStore(state => state.automixBars);

  const [flowQueue, setFlowQueue] = useState([{ type: 'Genre', specific: 'Any' }]);
  const library = useLibraryStore(state => state.library);
  const setLibrary = useLibraryStore(state => state.setLibrary);

  // State for metrics settings
  const [metrics, setMetrics] = useState({
    bpm: { direction: 'None', shuffle: 'None' },
    year: { direction: 'None', shuffle: 'None' },
    energy: { direction: 'None', shuffle: 'None' }
  });

  const handleDjStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    useMixerStore.setState({ automixBars: parseInt(e.target.value) });
  };

  const addFlowItem = () => {
    setFlowQueue([...flowQueue, { type: 'Genre', specific: 'Any' }]);
  };

  const removeFlowItem = (index: number) => {
    setFlowQueue(flowQueue.filter((_, idx) => idx !== index));
  };

  const updateFlowItem = (index: number, key: 'type' | 'specific', value: string) => {
    const newQueue = [...flowQueue];
    newQueue[index][key] = value;
    setFlowQueue(newQueue);
  };

  const handleMetricChange = (metric: 'bpm' | 'year' | 'energy', field: 'direction' | 'shuffle', value: string) => {
    setMetrics({
      ...metrics,
      [metric]: {
        ...metrics[metric],
        [field]: value
      }
    });
  };

  const applySort = () => {
    if (!library || library.length === 0) {
      onClose();
      return;
    }

    let sorted = [...library];

    // Build sort weights based on what is selected
    // For now we will do a simple sort applying the ones selected in order of Energy -> Year -> BPM
    // (Meaning BPM has the final/highest precedence since it's applied last).
    
    // Sort by Energy
    if (metrics.energy.direction !== 'None') {
      sorted.sort((a, b) => {
        const ea = a.energy || 0;
        const eb = b.energy || 0;
        return metrics.energy.direction === 'Low to High' ? ea - eb : eb - ea;
      });
    }

    // Sort by Year
    if (metrics.year.direction !== 'None') {
      sorted.sort((a, b) => {
        const ya = a.year || 0;
        const yb = b.year || 0;
        return metrics.year.direction === 'Low to High' ? ya - yb : yb - ya;
      });
    }

    // Sort by BPM
    if (metrics.bpm.direction !== 'None') {
      sorted.sort((a, b) => {
        const ba = a.bpm || 0;
        const bb = b.bpm || 0;
        return metrics.bpm.direction === 'Low to High' ? ba - bb : bb - ba;
      });
    }

    // Then apply shuffles if selected
    // Light shuffle: swaps adjacent or nearby tracks occasionally
    // Heavy shuffle: randomizes heavily while attempting to maintain general direction

    // Helper to add jitter (chunk-based shuffling for "Heavy", simple shift for "Light")
    const applyJitter = (arr: Track[], intensity: 'Light' | 'Heavy') => {
      if (intensity === 'Light') {
        // Light shuffle: simple fuzzy sorting (minor shifts of +/- 3 positions)
        const mapped = arr.map((item, index) => ({
          item, 
          sortWeight: index + (Math.random() * 6 - 3)
        }));
        mapped.sort((a, b) => a.sortWeight - b.sortWeight);
        return mapped.map(m => m.item);
      } else {
        // Heavy shuffle: Chunk-based jumping (Open format DJ style)
        // Group the array into chunks of 3 to 6 tracks
        const chunks: Track[][] = [];
        let i = 0;
        while (i < arr.length) {
          const chunkSize = Math.floor(Math.random() * 4) + 3; // 3 to 6 tracks
          chunks.push(arr.slice(i, i + chunkSize));
          i += chunkSize;
        }

        // Now fuzzily reorder the chunks themselves so that a "section" of tracks plays, 
        // then jumps to another section of tracks (simulating jumping to a different BPM range)
        const mappedChunks = chunks.map((chunk, index) => ({
          chunk,
          sortWeight: index + (Math.random() * 10 - 5) // Jumps chunks around
        }));
        
        mappedChunks.sort((a, b) => a.sortWeight - b.sortWeight);
        
        // Flatten back into a single array
        return mappedChunks.flatMap(m => m.chunk);
      }
    };

    if (metrics.energy.shuffle !== 'None') {
      sorted = applyJitter(sorted, metrics.energy.shuffle as 'Light' | 'Heavy');
    }
    if (metrics.year.shuffle !== 'None') {
      sorted = applyJitter(sorted, metrics.year.shuffle as 'Light' | 'Heavy');
    }
    if (metrics.bpm.shuffle !== 'None') {
      sorted = applyJitter(sorted, metrics.bpm.shuffle as 'Light' | 'Heavy');
    }

    setLibrary(sorted);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[400px] bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl p-6 relative flex flex-col items-center">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          ✕
        </button>
        
        <div className="flex flex-col items-center mb-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-2">Sort Settings</h3>
          <button 
            onClick={applySort}
            className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-1.5 px-6 rounded-full text-[11px] uppercase tracking-widest shadow-sm transition-all border border-slate-300 dark:border-slate-600"
          >
            Apply to Playlist
          </button>
        </div>
        
        <div className="space-y-6 w-full">
          {/* DJ Style */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2">DJ Style (Auto-Mix)</label>
            <select 
              value={automixBars}
              onChange={handleDjStyleChange}
              className="w-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded text-xs p-2 outline-none"
            >
              <option value={0}>No Fade</option>
              <option value={4}>Casual Listening</option>
              <option value={1}>Hip Hop Radio</option>
              <option value={2}>Club Momentum</option>
              <option value={8}>Long Progressions</option>
            </select>
          </div>

          {/* Direction & Shuffle Grid */}
          <div>
            <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 mb-2 px-1 text-[10px] text-slate-500 uppercase tracking-widest text-center">
              <div></div>
              <div className="text-left pl-1">Direction</div>
              <div className="text-left pl-1">Shuffle</div>
            </div>
            <div className="space-y-2">
              {/* BPM Row */}
              <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 items-center">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-bold pr-2 text-right">BPM</span>
                <select 
                  value={metrics.bpm.direction}
                  onChange={(e) => handleMetricChange('bpm', 'direction', e.target.value)}
                  className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded text-xs p-1.5 outline-none w-full"
                >
                  <option>None</option>
                  <option>Low to High</option>
                  <option>High to Low</option>
                </select>
                <select 
                  value={metrics.bpm.shuffle}
                  onChange={(e) => handleMetricChange('bpm', 'shuffle', e.target.value)}
                  className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded text-xs p-1.5 outline-none w-full"
                >
                  <option>None</option>
                  <option>Light</option>
                  <option>Heavy</option>
                </select>
              </div>
              
              {/* Year Row */}
              <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 items-center">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-bold pr-2 text-right">Year</span>
                <select 
                  value={metrics.year.direction}
                  onChange={(e) => handleMetricChange('year', 'direction', e.target.value)}
                  className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded text-xs p-1.5 outline-none w-full"
                >
                  <option>None</option>
                  <option>Low to High</option>
                  <option>High to Low</option>
                </select>
                <select 
                  value={metrics.year.shuffle}
                  onChange={(e) => handleMetricChange('year', 'shuffle', e.target.value)}
                  className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded text-xs p-1.5 outline-none w-full"
                >
                  <option>None</option>
                  <option>Light</option>
                  <option>Heavy</option>
                </select>
              </div>

              {/* Energy Row */}
              <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 items-center">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-bold pr-2 text-right">Energy</span>
                <select 
                  value={metrics.energy.direction}
                  onChange={(e) => handleMetricChange('energy', 'direction', e.target.value)}
                  className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded text-xs p-1.5 outline-none w-full"
                >
                  <option>None</option>
                  <option>Low to High</option>
                  <option>High to Low</option>
                </select>
                <select 
                  value={metrics.energy.shuffle}
                  onChange={(e) => handleMetricChange('energy', 'shuffle', e.target.value)}
                  className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded text-xs p-1.5 outline-none w-full"
                >
                  <option>None</option>
                  <option>Light</option>
                  <option>Heavy</option>
                </select>
              </div>
            </div>
          </div>

          {/* Flow Order Expandable Queue */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2">Flow Order Queue</label>
            <div className="space-y-2 mb-2 max-h-[140px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
               {flowQueue.map((item, idx) => (
                 <div key={idx} className="flex gap-2 items-center bg-white dark:bg-slate-800 p-2 rounded border border-slate-300 dark:border-slate-700">
                   <span className="text-slate-500 font-mono text-[10px]">{idx + 1}.</span>
                   <select 
                     value={item.type}
                     onChange={(e) => updateFlowItem(idx, 'type', e.target.value)}
                     className="flex-1 bg-transparent text-slate-700 dark:text-slate-300 text-xs outline-none border-b border-slate-300 dark:border-slate-600 pb-0.5"
                   >
                     <option>Genre</option>
                     <option>Artist</option>
                     <option>Album</option>
                     <option>Publisher</option>
                   </select>
                   <select 
                     value={item.specific}
                     onChange={(e) => updateFlowItem(idx, 'specific', e.target.value)}
                     className="flex-1 bg-transparent text-slate-700 dark:text-slate-300 text-xs outline-none border-b border-slate-300 dark:border-slate-600 pb-0.5"
                   >
                     <option>Any</option>
                     <option>Include</option>
                     <option>Exclude</option>
                   </select>
                   <button onClick={() => removeFlowItem(idx)} className="text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-1">✕</button>
                 </div>
               ))}
            </div>
            <button onClick={addFlowItem} className="w-full py-1.5 border border-slate-300 dark:border-slate-600 border-dashed rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-400 dark:hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-xs">
              + Add Flow Rule
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};