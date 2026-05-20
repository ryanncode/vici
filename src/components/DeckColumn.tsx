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
  
  const fxSlots = state.fxSlots;
  const setFxSlots = (slots: typeof fxSlots) => useMixerStore.getState().setDeckState(deckId, { fxSlots: slots });

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
  const wheelAccumulatorRef = useRef(0);

  const handlePitchWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    const now = Date.now();
    const timeSinceLast = now - lastWheelTimeRef.current;
    lastWheelTimeRef.current = now;

    let speedMultiplier = 1;
    if (timeSinceLast < 100) {
      const speedRatio = 1 - (timeSinceLast / 100);
      speedMultiplier = 1 + (speedRatio * 10); // Normal acceleration
    }

    // Accumulate the delta, applying acceleration
    wheelAccumulatorRef.current += e.deltaY * speedMultiplier;

    // 1 tick = 100 deltaY = 0.1 BPM
    if (Math.abs(wheelAccumulatorRef.current) >= 50) {
       const ticks = Math.trunc(wheelAccumulatorRef.current / 50);
       wheelAccumulatorRef.current -= ticks * 50; 
       
       // deltaY > 0 -> scroll down -> decrease pitch
       nudgePitch(-ticks * 0.1);
    }
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
    <div className={`flex-1 h-[480px] flex flex-col relative gap-2 min-w-0`}>
      
      {/* 1. Metadata Block (Floating Widget) */}
      <div className="h-[90px] w-full px-4 py-1.5 flex flex-col justify-between bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-md shrink-0">
        {/* Row 1: Title & BPM */}
        <div className="flex justify-between items-end mb-0.5">
          <span 
            className={`text-[18px] font-bold text-slate-800 dark:text-white truncate cursor-pointer hover:text-blue-500 transition-colors flex-1 pr-4 ${state.isPlaying ? 'text-blue-500 dark:text-blue-400' : ''}`}
            onClick={togglePlayback}
          >
            {track?.title || 'No Track Loaded'}
          </span>
          <span ref={bpmRef} className="text-[20px] font-bold font-mono text-blue-500 shrink-0">
            0.0
          </span>
        </div>
        
        {/* Row 2: Artist & Key */}
        <div className="flex justify-between items-center -mt-0.5">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 truncate flex-1 pr-4">
            {track?.artist || 'Unknown Artist'}
          </span>
          <span className="text-[12px] font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-600 shrink-0">
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

      <div className={`flex flex-1 ${isLeft ? 'flex-row' : 'flex-row-reverse'} gap-2`}>
        
        {/* 2. Outer Edge: Pitch Control (Floating Widget) */}
        <div className={`w-[70px] h-full bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center py-2 justify-between shadow-md shrink-0`}>
          <button 
            onClick={() => toggleSync(!state.sync)} 
            className={`w-12 h-8 rounded-md border transition relative overflow-hidden group flex flex-col items-center justify-center mb-3 ${state.sync ? 'bg-green-100 dark:bg-green-900 border-green-400 dark:border-green-600 text-green-700 dark:text-green-400' : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
          >
            {state.sync && <div className="w-full h-1 bg-green-500 absolute top-0"></div>}
            <span className="text-[10px] font-bold tracking-widest mt-0.5">SYNC</span>
          </button>

          <button onClick={() => nudgePitch(0.01)} className="w-12 h-7 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-bold flex items-center justify-center transition">
            +
          </button>
          
          {/* Pitch Slider */}
          <div className="flex-1 w-10 my-2 bg-slate-100 dark:bg-slate-900 rounded-md border border-slate-300 dark:border-slate-700 relative flex justify-center py-2 shadow-inner overflow-hidden touch-none" onPointerDown={handlePitchPointerDown} onWheel={handlePitchWheel} onDoubleClick={() => setPitch(1.0)}>
            <input type="range" min="0.84" max="1.16" step="any" value={state.pitch} className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" />
            <div className="w-0.5 bg-slate-400 dark:bg-black h-full rounded-full"></div>
            {/* Center zero line */}
            <div className="absolute top-1/2 w-6 h-0.5 bg-slate-400 dark:bg-white/30 -translate-y-1/2"></div>
            {/* Pitch Fader Cap */}
            <div 
              className="absolute w-full h-6 bg-slate-300 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 rounded flex items-center justify-center shadow-lg pointer-events-none"
              style={{ top: `${(1 - (state.pitch - 0.84) / 0.32) * 100}%`, transform: 'translateY(-50%)' }}
            >
              <div className="w-full h-0.5 bg-white dark:bg-white/40"></div>
            </div>
          </div>

          <button onClick={() => nudgePitch(-0.01)} className="w-12 h-7 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-bold flex items-center justify-center transition mb-3">
            -
          </button>

          <button 
            onClick={() => togglePlayback()} 
            className={`w-14 h-14 rounded-full border shadow-md flex items-center justify-center transition-colors mb-3 ${state.isPlaying ? 'bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-600 text-blue-600 dark:text-blue-400' : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
          >
            {state.isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="ml-1">
                <path d="M5 3L19 12L5 21V3Z" />
              </svg>
            )}
          </button>
        </div>

        {/* 3. Core Area: Performance Grid & Smart FX (Floating Widget) */}
        <div className="flex-1 h-full flex flex-col bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl p-3 shadow-md overflow-hidden">
          
          {/* Dynamic Performance Pad Matrix (Top Half) */}
          <div className="flex-1 flex flex-col">
            {/* Mode Tabs */}
            <div className="flex gap-1 mb-1">
              <button onClick={() => setPadMode('HOT_CUE')} className={`flex-1 py-0.5 text-[11px] font-bold tracking-wider rounded-md border-2 ${padMode === 'HOT_CUE' ? 'bg-slate-800 text-white border-blue-500 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-600'}`}>HOT CUE</button>
              <button onClick={() => setPadMode('LOOP')} className={`flex-1 py-0.5 text-[11px] font-bold tracking-wider rounded-md border-2 ${padMode === 'LOOP' ? 'bg-slate-800 text-white border-green-500 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-600'}`}>LOOP</button>
              <button onClick={() => setPadMode('SAMPLER')} className={`flex-1 py-0.5 text-[11px] font-bold tracking-wider rounded-md border-2 ${padMode === 'SAMPLER' ? 'bg-slate-800 text-white border-purple-500 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-600'}`}>SAMPLER</button>
            </div>
            
            {/* 2x4 Pad Grid */}
            <div className="grid grid-cols-4 grid-rows-2 gap-1.5 flex-1 mb-1.5">
              {[...Array(8)].map((_, i) => (
                <button key={i} className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm relative overflow-hidden group transition-colors">
                  <div className={`w-full h-1 absolute top-0 ${padMode === 'HOT_CUE' ? 'bg-blue-500/40 group-hover:bg-blue-500/60' : padMode === 'LOOP' ? 'bg-green-500/40 group-hover:bg-green-500/60' : 'bg-purple-500/40 group-hover:bg-purple-500/60'}`}></div>
                </button>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className="w-full h-px bg-slate-200 dark:bg-slate-700 mb-1.5"></div>

          {/* Modular Smart FX Bank (Bottom Half) */}
          <div className="shrink-0 flex flex-col justify-between">
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-1">SMART FX</div>
            
            {/* 3 Parallel FX Slots */}
            {fxSlots.map((fxType, slotIndex) => {
              const isOn = state.fx[`${fxType}On` as keyof typeof state.fx] as boolean;
              
              return (
                <div key={slotIndex} className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 p-1 rounded-md border border-slate-200 dark:border-slate-700/50 mb-1 last:mb-0 shadow-sm">
                  <div 
                    onClick={() => handleFxToggle(fxType as 'delay' | 'reverb' | 'phaser' | 'gate' | 'roll' | 'siren' | 'compressor')}
                    className={`w-6 h-6 rounded-md border flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0 ${isOn ? 'bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-600' : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                  >
                    <div className={`w-3 h-0.5 rounded-full mb-0.5 ${isOn ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-500'}`}></div>
                    <div className={`w-2 h-0.5 rounded-full ${isOn ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-500'}`}></div>
                  </div>
                  
                  <div className="w-[45px] shrink-0">
                    <select 
                      value={fxType} 
                      onChange={(e) => {
                        const newSlots = [...fxSlots] as typeof fxSlots;
                        newSlots[slotIndex] = e.target.value as 'delay' | 'reverb' | 'phaser' | 'gate' | 'roll' | 'siren' | 'compressor';
                        setFxSlots(newSlots);
                      }}
                      className="bg-transparent border border-slate-300 dark:border-slate-600 text-[9px] font-bold uppercase text-slate-700 dark:text-slate-300 rounded px-0.5 py-0.5 outline-none w-full"
                    >
                      <option value="delay">DLY</option>
                      <option value="reverb">RVB</option>
                      <option value="phaser">PHS</option>
                      <option value="gate">GTE</option>
                      <option value="roll">RLL</option>
                      <option value="siren">SRN</option>
                      <option value="compressor">CMP</option>
                    </select>
                  </div>
                  
                  <div className="flex-1 flex justify-around items-center">
                    {fxType === 'reverb' && (
                      <>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 w-[16px]">MIX</span>
                          <RotaryKnob label="MIX" hideLabel size="xs" min={0} max={1} step={0.01} value={state.fx.reverbSize} onChange={(v) => handleFxParamChange('reverb', 'size', v)} />
                        </div>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 w-[16px]">DEC</span>
                          <RotaryKnob label="DEC" hideLabel size="xs" min={0.1} max={10.0} step={0.1} value={state.fx.reverbDecay} onChange={(v) => handleFxParamChange('reverb', 'decay', v)} />
                        </div>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 w-[16px]">PRE</span>
                          <RotaryKnob label="PRE" hideLabel size="xs" min={0} max={100} step={1} value={state.fx.reverbPredelay} onChange={(v) => handleFxParamChange('reverb', 'predelay', v)} />
                        </div>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 w-[16px]">COL</span>
                          <RotaryKnob label="COL" hideLabel size="xs" min={-1} max={1} step={0.01} value={state.fx.reverbColor} onChange={(v) => handleFxParamChange('reverb', 'color', v)} />
                        </div>
                      </>
                    )}
                    {fxType === 'delay' && (
                      <>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 w-[16px]">TIM</span>
                          <RotaryKnob label="TIM" hideLabel size="xs" min={0} max={2} step={0.01} value={state.fx.delayTime} onChange={(v) => handleFxParamChange('delay', 'time', v)} />
                        </div>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 w-[16px]">FDB</span>
                          <RotaryKnob label="FDB" hideLabel size="xs" min={0} max={0.95} step={0.01} value={state.fx.delayFeedback} onChange={(v) => handleFxParamChange('delay', 'feedback', v)} />
                        </div>
                      </>
                    )}
                    {fxType === 'phaser' && (
                      <>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 w-[16px]">RAT</span>
                          <RotaryKnob label="RAT" hideLabel size="xs" min={0.1} max={10.0} step={0.01} value={state.fx.phaserRate} onChange={(v) => handleFxParamChange('phaser', 'rate', v)} />
                        </div>
                      </>
                    )}
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
