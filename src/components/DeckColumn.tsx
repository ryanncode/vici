import React, { useState, useRef, useEffect } from 'react';
import { useMixerStore } from '../store/mixerStore';
import { useDeckControl } from '../hooks/useDeckControl';
import { AudioEngine } from '../services/AudioEngine';
import { RotaryKnob } from './CenterMixer';

interface DeckColumnProps {
  deckId: 'A' | 'B';
}

const formatAdjustedTime = (seconds: number, pitch: number) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00.00';
  const val = seconds / pitch;
  const m = Math.floor(val / 60);
  const s = Math.floor(val % 60);
  const ms = Math.floor((val % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const DeckColumn: React.FC<DeckColumnProps> = ({ deckId }) => {
  const isLeft = deckId === 'A';
  const state = useMixerStore(state => deckId === 'A' ? state.deckA : state.deckB);
  
  const { 
    togglePlayback, 
    setPitch, 
    nudgePitch, 
    toggleSync, 
    handleFxToggle,
    handleFxParamChange
  } = useDeckControl(deckId);
  
  const [padMode, setPadMode] = useState<'HOT_CUE' | 'LOOP' | 'SAMPLER'>('HOT_CUE');
  const [fxSlots, setFxSlots] = useState<['delay'|'reverb'|'phaser'|'gate'|'roll'|'siren', 'delay'|'reverb'|'phaser'|'gate'|'roll'|'siren', 'delay'|'reverb'|'phaser'|'gate'|'roll'|'siren']>(['delay', 'reverb', 'phaser']);

  const bpmRef = useRef<HTMLSpanElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const remainingRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let lastBpmStr = '';
    let lastElapsedStr = '';
    let lastRemainingStr = '';
    
    const loop = () => {
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      const current = deckEngine.getCurrentTime();
      const duration = deckEngine.duration || 0;
      
      if (bpmRef.current) {
        const bpmStr = (deckEngine.loaded && deckEngine.currentBpm > 0) ? deckEngine.currentBpm.toFixed(1) : '0.0';
        if (bpmStr !== lastBpmStr) {
          bpmRef.current.textContent = bpmStr;
          lastBpmStr = bpmStr;
        }
      }
      
      if (elapsedRef.current) {
        const elapsedStr = formatAdjustedTime(current, state.pitch);
        if (elapsedStr !== lastElapsedStr) {
          elapsedRef.current.textContent = elapsedStr;
          lastElapsedStr = elapsedStr;
        }
      }
      
      if (remainingRef.current) {
        const remainingStr = `-${formatAdjustedTime(Math.max(0, duration - current), state.pitch)}`;
        if (remainingStr !== lastRemainingStr) {
          remainingRef.current.textContent = remainingStr;
          lastRemainingStr = remainingStr;
        }
      }
    };
    const interval = setInterval(loop, 50);
    return () => clearInterval(interval);
  }, [deckId, state.pitch]);


  
  const lastWheelTimeRef = useRef(0);

  const handlePitchWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const now = Date.now();
    const timeSinceLast = now - lastWheelTimeRef.current;
    lastWheelTimeRef.current = now;

    let amt = 0.32 * 0.01;
    if (timeSinceLast < 80) {
      const speedRatio = 1 - (timeSinceLast / 80);
      const multiplier = 1 + (speedRatio * speedRatio * speedRatio * 150);
      amt *= multiplier;
    }

    let currentValue = state.pitch + (e.deltaY > 0 ? -amt : amt);
    currentValue = Math.max(0.84, Math.min(1.16, currentValue));
    setPitch(currentValue);
  };

  const handlePitchPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const initialPitch = state.pitch;
    document.body.style.cursor = 'grabbing';
    const handlePointerMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // drag up is negative, pitch goes UP (higher value) when moving up, wait. 
      // slider top is 1.16, bottom is 0.84. So drag up = increase pitch.
      let currentValue = initialPitch + (-deltaY / 200) * 0.32;
      currentValue = Math.max(0.84, Math.min(1.16, currentValue));
      setPitch(currentValue);
    };
    const handlePointerUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const track = state.track;

  return (
    <div className={`w-[390px] h-[520px] shrink-0 flex flex-col relative gap-[10px]`}>
      
      {/* 1. Metadata Block (Floating Widget) */}
      <div className="h-[90px] w-full px-4 py-1.5 flex flex-col justify-between bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-md shrink-0">
        {/* Row 1: Title & BPM */}
        <div className="flex justify-between items-end mb-0.5">
          <span 
            className={`text-[18px] font-bold text-slate-800 dark:text-white truncate max-w-[280px] cursor-pointer hover:text-blue-500 transition-colors ${state.isPlaying ? 'text-blue-500 dark:text-blue-400' : ''}`}
            onClick={togglePlayback}
          >
            {track?.title || 'No Track Loaded'}
          </span>
          <span ref={bpmRef} className="text-[20px] font-bold font-mono text-blue-500">
            0.0
          </span>
        </div>
        
        {/* Row 2: Artist & Key */}
        <div className="flex justify-between items-center -mt-0.5">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[280px]">
            {track?.artist || 'Unknown Artist'}
          </span>
          <span className="text-[12px] font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-600">
            {track?.key || '-'}
          </span>
        </div>

        {/* Row 3: Elapsed & Remaining Time */}
        <div className="flex justify-between items-baseline mt-0.5">
          <span ref={elapsedRef} className="text-xs font-mono text-slate-500 dark:text-slate-400 font-bold">
            0:00.00
          </span>
          <span ref={remainingRef} className={`text-lg font-mono font-bold ${track ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'}`}>
            -0:00.00
          </span>
        </div>
      </div>

      <div className={`flex flex-1 ${isLeft ? 'flex-row' : 'flex-row-reverse'} gap-[10px]`}>
        
        {/* 2. Outer Edge: Pitch Control (Floating Widget) */}
        <div className={`w-[50px] h-full bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center py-4 justify-between shadow-md shrink-0`}>
          <button onClick={() => nudgePitch(0.01)} className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-bold flex items-center justify-center transition">
            +
          </button>
          
          {/* Pitch Slider */}
          <div className="flex-1 w-8 my-4 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 relative flex justify-center py-2 shadow-inner overflow-hidden touch-none" onPointerDown={handlePitchPointerDown} onWheel={handlePitchWheel} onDoubleClick={() => setPitch(1.0)}>
            <input type="range" min="0.84" max="1.16" step="any" value={state.pitch} className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" />
            <div className="w-0.5 bg-slate-400 dark:bg-black h-full rounded-full"></div>
            {/* Center zero line */}
            <div className="absolute top-1/2 w-4 h-0.5 bg-slate-400 dark:bg-white/30 -translate-y-1/2"></div>
            {/* Pitch Fader Cap */}
            <div 
              className="absolute w-full h-6 bg-slate-300 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 rounded flex items-center justify-center shadow-lg pointer-events-none"
              style={{ top: `${(1 - (state.pitch - 0.84) / 0.32) * 100}%`, transform: 'translateY(-50%)' }}
            >
              <div className="w-full h-0.5 bg-white dark:bg-white/40"></div>
            </div>
          </div>

          <button onClick={() => nudgePitch(-0.01)} className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-bold flex items-center justify-center transition mb-4">
            -
          </button>

          <button 
            onClick={() => toggleSync(!state.sync)} 
            className={`w-8 h-10 rounded-lg border transition relative overflow-hidden group flex flex-col items-center justify-center ${state.sync ? 'bg-green-100 dark:bg-green-900 border-green-400 dark:border-green-600 text-green-700 dark:text-green-400' : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
          >
            {state.sync && <div className="w-full h-1 bg-green-500 absolute top-0"></div>}
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
              <button 
                onClick={() => togglePlayback()} 
                className={`border rounded-lg shadow-sm relative overflow-hidden group transition-colors flex items-center justify-center ${state.isPlaying ? 'bg-slate-300 dark:bg-slate-600 border-slate-400 dark:border-slate-500' : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
              >
                <div className="w-full h-1.5 absolute top-0 bg-blue-500/40 group-hover:bg-blue-500/60"></div>
                <span className="text-[10px] font-bold tracking-widest text-slate-600 dark:text-slate-300">PLAY</span>
              </button>
              {[...Array(7)].map((_, i) => (
                <button key={i+1} className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm relative overflow-hidden group transition-colors">
                  <div className={`w-full h-1.5 absolute top-0 ${padMode === 'HOT_CUE' ? 'bg-blue-500/40 group-hover:bg-blue-500/60' : padMode === 'LOOP' ? 'bg-green-500/40 group-hover:bg-green-500/60' : 'bg-purple-500/40 group-hover:bg-purple-500/60'}`}></div>
                </button>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className="w-full h-px bg-slate-200 dark:bg-slate-700 mb-4"></div>

          {/* Modular Smart FX Bank (Bottom Half) */}
          <div className="flex-1 flex flex-col justify-between">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-1">SMART FX</div>
            
            {/* 3 Parallel FX Slots */}
            {fxSlots.map((fxType, slotIndex) => {
              const isOn = state.fx[`${fxType}On` as keyof typeof state.fx] as boolean;
              
              return (
                <div key={slotIndex} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50 mb-1 last:mb-0 shadow-sm">
                  <div 
                    onClick={() => handleFxToggle(fxType as 'delay' | 'reverb' | 'phaser' | 'gate' | 'roll' | 'siren')}
                    className={`w-10 h-8 rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0 ${isOn ? 'bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-600' : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                  >
                    <div className={`w-6 h-1 rounded-full mb-1 ${isOn ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-500'}`}></div>
                    <div className={`w-4 h-1 rounded-full ${isOn ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-500'}`}></div>
                  </div>
                  
                  <div className="w-[80px] shrink-0">
                    <select 
                      value={fxType} 
                      onChange={(e) => {
                        const newSlots = [...fxSlots] as typeof fxSlots;
                        newSlots[slotIndex] = e.target.value as 'delay' | 'reverb' | 'phaser' | 'gate' | 'roll' | 'siren';
                        setFxSlots(newSlots);
                      }}
                      className="bg-transparent border border-slate-300 dark:border-slate-600 text-[9px] font-bold uppercase text-slate-700 dark:text-slate-300 rounded px-1 py-1 outline-none w-full"
                    >
                      <option value="delay">Delay</option>
                      <option value="reverb">Reverb</option>
                      <option value="phaser">Phaser</option>
                      <option value="gate">Gate</option>
                      <option value="roll">Roll</option>
                      <option value="siren">Siren</option>
                    </select>
                  </div>
                  
                  <div className="flex-1 flex justify-around items-center">
                     <RotaryKnob 
                        label="Param 1" 
                        size="xs" 
                        min={0} max={1} step={0.01} 
                        value={fxType === 'delay' ? state.fx.delayTime : fxType === 'reverb' ? state.fx.reverbSize : fxType === 'phaser' ? state.fx.phaserRate / 10 : 0.5} 
                        onChange={(v) => handleFxParamChange(fxType as 'delay' | 'reverb' | 'phaser', fxType === 'delay' ? 'time' : fxType === 'reverb' ? 'size' : 'rate', fxType === 'phaser' ? v * 10 : v)}
                      />
                      <RotaryKnob 
                        label="Param 2" 
                        size="xs" 
                        min={0} max={1} step={0.01} 
                        value={fxType === 'delay' ? state.fx.delayFeedback : 0.5} 
                        onChange={(v) => fxType === 'delay' && handleFxParamChange('delay', 'feedback', v)}
                      />
                      <RotaryKnob 
                        label="Param 3" 
                        size="xs" 
                        min={0} max={1} step={0.01} 
                        value={0.5} 
                        onChange={() => {}}
                      />
                  </div>
                </div>
              );
            })}
          </div>

        </div>

      </div>
    </div>
  );
};
