import { Play, Square } from 'lucide-react';
import { useDeckControl } from '../hooks/useDeckControl';
import { Waveform } from './Waveform';
import { useMixerStore } from '../store/mixerStore';

const formatAdjustedTime = (seconds: number, pitch: number) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor((seconds / pitch) / 60);
  const s = Math.floor((seconds / pitch) % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export function Deck({ deckId }: { deckId: 'A' | 'B' }) {
  const { 
    state, 
    togglePlayback, 
    seek, 
    setPitch, 
    nudgePitch, 
    toggleMute, 
    toggleSync, 
    toggleMaster,
    handleFxToggle,
    handleFxParamChange
  } = useDeckControl(deckId);
  
  const masterDeck = useMixerStore(s => s.masterDeck);

  const isLeft = deckId === 'A';
  const color = isLeft ? '#3b82f6' : '#06b6d4';
  const colorClassText = isLeft ? 'text-blue-500' : 'text-cyan-500';

  const handleSliderWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (e.currentTarget.type !== 'range') return;
    e.preventDefault();
    const target = e.currentTarget;
    const min = parseFloat(target.min || "0");
    const max = parseFloat(target.max || "100");
    const baseStep = parseFloat(target.step || "1");
    
    if (isNaN(baseStep)) return;

    let effectiveStep = baseStep;
    const maxAllowedStep = (max - min) * 0.1;
    if (effectiveStep > maxAllowedStep) effectiveStep = maxAllowedStep;
    
    const currentVal = parseFloat(target.value);
    const direction = e.deltaY > 0 ? -1 : 1;
    let nextVal = currentVal + (direction * effectiveStep);
    nextVal = Math.max(min, Math.min(max, nextVal));
    
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(target, nextVal.toString());
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  return (
    <div className={`flex-1 min-w-0 w-full p-3 sm:p-4 lg:p-5 rounded-xl border flex flex-col gap-2 transition-colors ${state.isPlaying ? `bg-slate-900/80 border-${isLeft ? 'blue' : 'cyan'}-500/30` : 'bg-slate-900/40 border-slate-800/80'}`}>
      
      {/* Waveform */}
      <div className="h-10 sm:h-12 lg:h-16 w-full shrink-0 rounded overflow-hidden shadow-inner bg-slate-950/50">
        <Waveform 
          peaks={state.peaks}
          segments={state.segments}
          currentTime={state.progress.current}
          duration={state.progress.max}
          introMarker={state.introMarker}
          outroMarker={state.outroMarker}
          color={color}
          onSeek={seek}
          onMarkerChange={() => {}}
        />
      </div>

      {/* Transport & Info */}
      <div className={`flex items-center bg-slate-950/50 p-2 sm:p-3 rounded-lg border border-slate-800/50 gap-2 sm:gap-4 mt-auto ${!isLeft ? 'flex-row-reverse text-right' : ''}`}>
        
        <div className="flex flex-col items-center gap-2 shrink-0">
          <button 
            disabled={!state.track}
            onClick={togglePlayback}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white shadow-inner border border-slate-700/50 shrink-0"
          >
            {state.isPlaying ? <Square size={18} fill="currentColor" className={colorClassText} /> : <Play size={20} fill="currentColor" className={isLeft ? "ml-1" : "mr-1"} />}
          </button>
          <button 
            onClick={toggleMute}
            className={`w-full py-0.5 px-2 rounded-full text-[8px] sm:text-[9px] font-bold tracking-widest transition-colors flex items-center justify-center border ${state.mute ? 'bg-red-600 text-white border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
          >
            MUTE
          </button>
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className={`flex justify-between items-end mb-0.5 ${!isLeft ? 'flex-row-reverse' : ''}`}>
            <div className={`truncate ${isLeft ? 'pr-2' : 'pl-2'}`}>
              <h2 className="text-sm sm:text-base font-bold text-white truncate">{state.track?.title || 'No Track'}</h2>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">{state.track?.artist || 'Ready to load'}</p>
            </div>
            <div className={`shrink-0 ${isLeft ? 'text-right' : 'text-left'}`}>
              <div className="text-lg sm:text-xl font-mono font-light text-cyan-400 leading-none">{state.track ? state.currentBpm.toFixed(1) : '---'}</div>
              <div className="text-[8px] sm:text-[9px] uppercase text-slate-500 font-bold tracking-widest mt-0.5">BPM</div>
            </div>
          </div>
          {state.track && (
            <div className={`flex gap-2 sm:gap-3 text-[9px] sm:text-[10px] font-mono text-slate-400 ${!isLeft ? 'flex-row-reverse' : ''}`}>
              <span><span className="text-slate-500">{isLeft ? 'TIME:' : ''}</span> {formatAdjustedTime(state.progress.current, state.pitch)} / {formatAdjustedTime(state.progress.max, state.pitch)} <span className="text-slate-500">{!isLeft ? ':TIME' : ''}</span></span>
              <span className="hidden sm:inline"><span className="text-slate-500">{isLeft ? 'IN:' : ''}</span> {formatAdjustedTime(state.introMarker, state.pitch)} <span className="text-slate-500">{!isLeft ? ':IN' : ''}</span></span>
              <span className="hidden sm:inline"><span className="text-slate-500">{isLeft ? 'OUT:' : ''}</span> {formatAdjustedTime(state.progress.max - state.outroMarker, state.pitch)} <span className="text-slate-500">{!isLeft ? ':OUT' : ''}</span></span>
              {state.track.key && <span className="hidden lg:inline"><span className="text-slate-600">{isLeft ? 'KEY:' : ''}</span> {state.track.key} <span className="text-slate-600">{!isLeft ? ':KEY' : ''}</span></span>}
            </div>
          )}
        </div>

        <div className={`flex gap-2 sm:gap-3 items-center shrink-0 border-${isLeft ? 'l' : 'r'} border-slate-800/50 ${isLeft ? 'pl-2 sm:pl-3' : 'pr-2 sm:pr-3 flex-row-reverse'}`}>
          <div className="flex flex-col items-center gap-1 w-20 sm:w-24">
            <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold tracking-widest leading-none">PITCH</span>
            <div className="flex items-center w-full gap-1">
              <button onClick={() => nudgePitch(-0.1)} className="text-[10px] text-slate-500 hover:text-slate-200 font-bold leading-none select-none px-1 py-0.5 rounded hover:bg-slate-800">-</button>
              <input 
                type="range" 
                min="0.84" 
                max="1.16" 
                step="any" 
                value={state.pitch} 
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                onDoubleClick={() => setPitch(1.0)}
                className={`flex-1 w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-${isLeft ? 'blue' : 'cyan'}-500 shadow-inner min-w-0`} 
              />
              <button onClick={() => nudgePitch(0.1)} className="text-[10px] text-slate-500 hover:text-slate-200 font-bold leading-none select-none px-1 py-0.5 rounded hover:bg-slate-800">+</button>
            </div>
            <span className="text-[8px] sm:text-[9px] font-mono text-slate-500 leading-none">{((state.pitch - 1) * 100).toFixed(1)}%</span>
            
            <div className={`flex w-full gap-1 mt-0.5 ${!isLeft ? 'flex-row-reverse' : ''}`}>
              <button 
                onClick={() => toggleSync(!state.sync)}
                className={`flex-1 py-0.5 rounded text-[7px] sm:text-[8px] font-bold transition-colors flex items-center justify-center border ${state.sync ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
              >SYNC</button>
              <button 
                onClick={toggleMaster}
                className={`flex-1 py-0.5 rounded text-[7px] sm:text-[8px] font-bold transition-colors flex items-center justify-center border ${masterDeck === deckId ? 'bg-amber-600 text-white border-amber-500 shadow-[0_0_8px_rgba(217,119,6,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
              >MST</button>
            </div>
          </div>
        </div>
      </div>

      {/* FX */}
      <div className={`flex gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-900/80 rounded-lg border border-slate-800/80 ${!isLeft ? 'flex-row-reverse' : ''}`}>
        
        {/* ECHO */}
        <div className={`flex flex-col gap-1.5 sm:gap-2 flex-1 min-w-0 border-${isLeft ? 'r' : 'l'} border-slate-800/50 ${isLeft ? 'pr-2 sm:pr-3' : 'pl-2 sm:pl-3'}`}>
          <div className={`flex justify-between items-center ${!isLeft ? 'flex-row-reverse' : ''}`}>
            <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-blue-400">ECHO</span>
            <button 
              onClick={() => handleFxToggle('delay')}
              className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${state.fx.delayOn ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-700'}`}
            ></button>
          </div>
          <div className={`flex items-center gap-1 sm:gap-2 ${!isLeft ? 'flex-row-reverse' : ''}`}>
            <span className={`text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 ${!isLeft ? 'text-right' : ''}`}>TIME</span>
            <input type="range" min="0.05" max="1" step="0.01" value={state.fx.delayTime} onChange={(e) => handleFxParamChange('delay', 'time', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('delay', 'time', 0.25)} onWheel={handleSliderWheel} className={`flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400 ${!isLeft ? 'rotate-180' : ''}`} />
          </div>
          <div className={`flex items-center gap-1 sm:gap-2 ${!isLeft ? 'flex-row-reverse' : ''}`}>
            <span className={`text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 ${!isLeft ? 'text-right' : ''}`}>FDBK</span>
            <input type="range" min="0" max="0.95" step="0.01" value={state.fx.delayFeedback} onChange={(e) => handleFxParamChange('delay', 'feedback', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('delay', 'feedback', 0.5)} onWheel={handleSliderWheel} className={`flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400 ${!isLeft ? 'rotate-180' : ''}`} />
          </div>
          <div className={`flex gap-1 -mt-1 flex-wrap ${isLeft ? 'justify-end' : 'justify-start flex-row-reverse'}`}>
            <button onClick={() => handleFxParamChange('delay', 'time', Math.min(1, 60 / (state.currentBpm || 120)))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1/4</button>
            <button onClick={() => handleFxParamChange('delay', 'time', Math.min(1, (60 / (state.currentBpm || 120)) * 0.5))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1/8</button>
            <button onClick={() => handleFxParamChange('delay', 'time', Math.min(1, (60 / (state.currentBpm || 120)) * 0.25))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1/16</button>
          </div>
        </div>

        {/* REVERB */}
        <div className={`flex flex-col gap-1.5 sm:gap-2 flex-1 min-w-0 border-${isLeft ? 'r' : 'l'} border-slate-800/50 ${isLeft ? 'pr-2 sm:pr-3' : 'pl-2 sm:pl-3'}`}>
          <div className={`flex justify-between items-center ${!isLeft ? 'flex-row-reverse' : ''}`}>
            <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-cyan-400">REVERB</span>
            <button 
              onClick={() => handleFxToggle('reverb')}
              className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${state.fx.reverbOn ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'bg-slate-700'}`}
            ></button>
          </div>
          <div className={`flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1 ${!isLeft ? 'flex-row-reverse' : ''}`}>
            <span className={`text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 ${!isLeft ? 'text-right' : ''}`}>SIZE</span>
            <input type="range" min="0" max="1" step="0.01" value={state.fx.reverbSize} onChange={(e) => handleFxParamChange('reverb', 'size', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('reverb', 'size', 0.7)} onWheel={handleSliderWheel} className={`flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400 ${!isLeft ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* PHASER */}
        <div className={`flex flex-col gap-1.5 sm:gap-2 flex-1 min-w-0`}>
          <div className={`flex justify-between items-center ${!isLeft ? 'flex-row-reverse' : ''}`}>
            <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-fuchsia-400">PHASER</span>
            <button 
              onClick={() => handleFxToggle('phaser')}
              className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${state.fx.phaserOn ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.6)]' : 'bg-slate-700'}`}
            ></button>
          </div>
          <div className={`flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1 ${!isLeft ? 'flex-row-reverse' : ''}`}>
            <span className={`text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 ${!isLeft ? 'text-right' : ''}`}>RATE</span>
            <input type="range" min="0.1" max="10" step="0.1" value={state.fx.phaserRate} onChange={(e) => handleFxParamChange('phaser', 'rate', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('phaser', 'rate', 0.5)} onWheel={handleSliderWheel} className={`flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400 ${!isLeft ? 'rotate-180' : ''}`} />
          </div>
          <div className={`flex gap-1 -mt-1 flex-wrap ${isLeft ? 'justify-end' : 'justify-start flex-row-reverse'}`}>
            <button onClick={() => handleFxParamChange('phaser', 'rate', Math.min(10, ((state.currentBpm || 120) / 60) * 0.25))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">4 BARS</button>
            <button onClick={() => handleFxParamChange('phaser', 'rate', Math.min(10, ((state.currentBpm || 120) / 60) * 0.5))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">2 BARS</button>
            <button onClick={() => handleFxParamChange('phaser', 'rate', Math.min(10, (state.currentBpm || 120) / 60))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1 BAR</button>
          </div>
        </div>

      </div>

    </div>
  );
}
