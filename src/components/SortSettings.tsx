import React, { useState } from 'react';
import { useMixerStore } from '../store/mixerStore';

interface SortSettingsProps {
  onClose: () => void;
}

export const SortSettings: React.FC<SortSettingsProps> = ({ onClose }) => {
  const automixBars = useMixerStore(state => state.automixBars);

  const [flowQueue, setFlowQueue] = useState([{ type: 'Genre', specific: 'Any' }]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[400px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6 relative">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
        >
          ✕
        </button>
        
        <h3 className="text-sm font-bold text-slate-200 uppercase mb-4 text-center tracking-wider">Sort Settings</h3>
        
        <div className="space-y-6">
          {/* DJ Style */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2">DJ Style (Auto-Mix)</label>
            <select 
              value={automixBars}
              onChange={handleDjStyleChange}
              className="w-full bg-slate-800 text-slate-300 border border-slate-600 rounded text-xs p-2 outline-none"
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
                <span className="text-xs text-slate-300 font-bold pr-2 text-right">BPM</span>
                <select className="bg-slate-800 text-slate-300 border border-slate-600 rounded text-xs p-1.5 outline-none w-full">
                  <option>None</option>
                  <option>Low to High</option>
                  <option>High to Low</option>
                </select>
                <select className="bg-slate-800 text-slate-300 border border-slate-600 rounded text-xs p-1.5 outline-none w-full">
                  <option>None</option>
                  <option>Light</option>
                  <option>Heavy</option>
                </select>
              </div>
              
              {/* Year Row */}
              <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 items-center">
                <span className="text-xs text-slate-300 font-bold pr-2 text-right">Year</span>
                <select className="bg-slate-800 text-slate-300 border border-slate-600 rounded text-xs p-1.5 outline-none w-full">
                  <option>None</option>
                  <option>Low to High</option>
                  <option>High to Low</option>
                </select>
                <select className="bg-slate-800 text-slate-300 border border-slate-600 rounded text-xs p-1.5 outline-none w-full">
                  <option>None</option>
                  <option>Light</option>
                  <option>Heavy</option>
                </select>
              </div>

              {/* Energy Row */}
              <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 items-center">
                <span className="text-xs text-slate-300 font-bold pr-2 text-right">Energy</span>
                <select className="bg-slate-800 text-slate-300 border border-slate-600 rounded text-xs p-1.5 outline-none w-full">
                  <option>None</option>
                  <option>Low to High</option>
                  <option>High to Low</option>
                </select>
                <select className="bg-slate-800 text-slate-300 border border-slate-600 rounded text-xs p-1.5 outline-none w-full">
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
                 <div key={idx} className="flex gap-2 items-center bg-slate-800 p-2 rounded border border-slate-700">
                   <span className="text-slate-500 font-mono text-[10px]">{idx + 1}.</span>
                   <select 
                     value={item.type}
                     onChange={(e) => updateFlowItem(idx, 'type', e.target.value)}
                     className="flex-1 bg-transparent text-slate-300 text-xs outline-none border-b border-slate-600 pb-0.5"
                   >
                     <option>Genre</option>
                     <option>Artist</option>
                     <option>Album</option>
                     <option>Publisher</option>
                   </select>
                   <select 
                     value={item.specific}
                     onChange={(e) => updateFlowItem(idx, 'specific', e.target.value)}
                     className="flex-1 bg-transparent text-slate-300 text-xs outline-none border-b border-slate-600 pb-0.5"
                   >
                     <option>Any</option>
                     <option>Include</option>
                     <option>Exclude</option>
                   </select>
                   <button onClick={() => removeFlowItem(idx)} className="text-slate-500 hover:text-red-400 transition-colors ml-1">✕</button>
                 </div>
               ))}
            </div>
            <button onClick={addFlowItem} className="w-full py-1.5 border border-slate-600 border-dashed rounded text-slate-400 hover:text-slate-200 hover:border-slate-400 hover:bg-slate-800 transition-all text-xs">
              + Add Flow Rule
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};