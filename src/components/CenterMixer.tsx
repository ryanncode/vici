import React, { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useMixerStore } from '../store/mixerStore';
import { AudioEngine } from '../services/AudioEngine';
import { Headphones } from 'lucide-react';

export const RotaryKnob = ({ 
  label, 
  size = 'sm', 
  color = 'slate',
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  onDoubleClick,
  hideLabel = false
}: { 
  label: string, 
  size?: 'xs' | 'sm' | 'md' | 'lg', 
  color?: 'slate' | 'amber' | 'blue',
  min?: number,
  max?: number,
  step?: number,
  value?: number,
  onChange?: (val: number) => void,
  onDoubleClick?: () => void,
  hideLabel?: boolean
}) => {
  const dims = size === 'xs' ? 'w-8 h-8' : size === 'sm' ? 'w-10 h-10' : size === 'md' ? 'w-12 h-12' : 'w-16 h-16';
  const colorMap = {
    slate: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700',
    amber: 'bg-slate-100 dark:bg-slate-800 border-amber-400 dark:border-amber-600/50',
    blue: 'bg-slate-100 dark:bg-slate-800 border-blue-400 dark:border-blue-600/50'
  };

  const pct = value !== undefined ? (value - min) / (max - min) : 0.5;
  const rotation = -135 + (pct * 270);

  const lastWheelTimeRef = useRef(0);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>, min: number, max: number, value: number, onChange: (v: number) => void, step?: number) => {
    e.preventDefault();
    const range = max - min;
    const now = Date.now();
    const timeSinceLast = now - lastWheelTimeRef.current;
    lastWheelTimeRef.current = now;

    let amt = range * 0.01;
    if (timeSinceLast < 80) {
      const speedRatio = 1 - (timeSinceLast / 80);
      const multiplier = 1 + (speedRatio * speedRatio * speedRatio * 30);
      amt *= multiplier;
    }

    let nextValue = value + (e.deltaY > 0 ? -amt : amt);
    nextValue = Math.max(min, Math.min(max, nextValue));
    
    if (step && step >= 1) {
      onChange(Math.round(nextValue / step) * step);
    } else {
      onChange(nextValue);
    }
  };

  // Custom drag handler for smooth movement using standard dragging
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onChange || value === undefined) return;
    e.preventDefault();
    
    const startY = e.clientY;
    const initialValue = value;
    const range = max - min;
    
    document.body.style.cursor = 'grabbing';

    const handlePointerMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY; // Drag up is negative
      let nextValue = initialValue + (-deltaY / 250) * range;
      nextValue = Math.max(min, Math.min(max, nextValue));
      
      if (step && step >= 1) {
        onChange(Math.round(nextValue / step) * step);
      } else {
        onChange(nextValue);
      }
    };

    const handlePointerUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div className={`flex flex-col items-center relative group ${hideLabel ? '' : 'my-0'}`}>
      <div 
        className={`${dims} rounded-full border-2 ${colorMap[color]} shadow-md relative flex items-center justify-center cursor-ns-resize overflow-hidden touch-none`}
        onDoubleClick={onDoubleClick}
        onPointerDown={handlePointerDown}
        onWheel={(e) => {
          if (!onChange || value === undefined) return;
          handleWheel(e, min, max, value, onChange, step);
        }}
      >
        <div className="absolute inset-0" style={{ transform: `rotate(${rotation}deg)` }}>
          {/* Indicator Line */}
          <div className="absolute left-1/2 -translate-x-1/2 top-1 w-1 h-1/2 bg-slate-600 dark:bg-white/80 rounded-full pointer-events-none"></div>
        </div>
        
        {/* The hidden input to capture events, disabled to allow pointer events on parent */}
        <input 
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange && onChange(parseFloat(e.target.value))}
          className="absolute inset-0 opacity-0 pointer-events-none"
        />
      </div>
      {!hideLabel && label && <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase pointer-events-none">{label}</span>}
    </div>
  );
};

const VUMeter = ({ deckId }: { deckId: 'A' | 'B' }) => {
  const [level, setLevel] = useState(0);
  
  useEffect(() => {
    let rafId: number;
    const updateLevel = () => {
      const engine = AudioEngine.getInstance();
      const deck = deckId === 'A' ? engine.deckA : engine.deckB;
      if (deck && deck.peaks && deck.duration > 0 && deck.getCurrentTime() > 0 && !deck.mute) {
        const progress = deck.getCurrentTime() / deck.duration;
        const index = Math.floor(progress * deck.peaks.length);
        const rawPeak = deck.peaks[index] || 0;
        // Apply volume and gain to peak
        setLevel(rawPeak * deck.channelVolume * deck.channelGain);
      } else {
        setLevel(0);
      }
      rafId = requestAnimationFrame(updateLevel);
    };
    rafId = requestAnimationFrame(updateLevel);
    return () => cancelAnimationFrame(rafId);
  }, [deckId]);

  const activeSegments = Math.min(10, Math.floor(level * 10));

  return (
    <div className="h-full w-2 bg-slate-200 dark:bg-slate-950 rounded-full flex flex-col justify-between py-1 px-[1px] border border-slate-300 dark:border-slate-900 shadow-inner">
      {/* 10 Segments (2 Red, 2 Yellow, 6 Green) */}
      {[...Array(10)].map((_, i) => {
        const segIdx = 9 - i; // bottom is 0
        const isActive = segIdx < activeSegments;
        let color = 'bg-slate-300/20 dark:bg-white/5';
        if (isActive) {
          if (i < 2) color = 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]';
          else if (i < 4) color = 'bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.8)]';
          else color = 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]';
        }
        return (
          <div 
            key={i} 
            className={`w-full flex-1 mb-[1px] rounded-[1px] transition-all duration-75 ${color}`}
          ></div>
        );
      })}
    </div>
  );
};

export const CenterMixer: React.FC = () => {
  const deckA = useMixerStore(state => state.deckA);
  const deckB = useMixerStore(state => state.deckB);
  const crossfade = useMixerStore(state => state.crossfade);
  
  const crossfadeSliderRef = useRef<HTMLInputElement>(null);

  const throttleState = useRef<{ [key: string]: boolean }>({});

  const throttledDSP = (_key: string, fn: () => void) => {
    // Re-enable ~30fps throttle (32ms) to prevent message port flooding when aggressively turning knobs
    // Using a simple timeout-based throttle strategy
    if (!throttleState.current[_key]) {
      throttleState.current[_key] = true;
      fn();
      setTimeout(() => {
        throttleState.current[_key] = false;
      }, 32);
    }
  };

  const throttledSetDeckState = (deckId: 'A' | 'B', key: string, value: number) => {
    useMixerStore.getState().setDeckState(deckId, { [key]: value });
  };

  const handleGainChange = (deckId: 'A' | 'B', value: number) => {
    throttledDSP(`gain-${deckId}`, () => {
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      deckEngine.setChannelGain(value);
    });
    throttledSetDeckState(deckId, 'gain', value);
  };

  const handleVolumeChange = (deckId: 'A' | 'B', value: number) => {
    throttledDSP(`vol-${deckId}`, () => {
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      deckEngine.setChannelVolume(value);
    });
    throttledSetDeckState(deckId, 'volume', value);
  };

  const handleCrossfadeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    throttledDSP('crossfade', () => {
      const engine = AudioEngine.getInstance();
      const curve = useMixerStore.getState().crossfadeCurve || 'constant_power';
      engine.setCrossfadeValue(val, curve);
    });
    
    useMixerStore.getState().setCrossfade(val);
  };

  const handleEqChange = (deckId: 'A' | 'B', band: 'high' | 'mid' | 'low', value: number) => {
    throttledDSP(`eq-${deckId}-${band}`, () => {
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      deckEngine.setEq(band, value);
    });
    
    useMixerStore.getState().setDeckEq(deckId, { [band]: value });
  };


  const handleFilterChange = (deckId: 'A' | 'B', value: number) => {
    throttledDSP(`flt-${deckId}`, () => {
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      deckEngine.setFilterColor(value);
    });
    throttledSetDeckState(deckId, 'filter', value);
  };

  const handleCueToggle = (deckId: 'A' | 'B') => {
    const currentState = deckId === 'A' ? deckA.isCue : deckB.isCue;
    const newState = !currentState;
    
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    if (deckEngine) {
      deckEngine.setCueState(newState);
    }
    
    useMixerStore.setState(state => ({
      [deckId === 'A' ? 'deckA' : 'deckB']: {
        ...state[deckId === 'A' ? 'deckA' : 'deckB'],
        isCue: newState
      }
    }));
  };

  const lastFaderWheelTimeRef = useRef(0);

  const handleFaderWheel = (e: React.WheelEvent<HTMLDivElement>, deckId: 'A' | 'B', currentValue: number) => {
    e.preventDefault();
    const now = Date.now();
    const timeSinceLast = now - lastFaderWheelTimeRef.current;
    lastFaderWheelTimeRef.current = now;

    let amt = 1.5 * 0.01;
    if (timeSinceLast < 80) {
      const speedRatio = 1 - (timeSinceLast / 80);
      amt *= 1 + (speedRatio * speedRatio * speedRatio * 30);
    }
    let val = currentValue + (e.deltaY > 0 ? -amt : amt);
    val = Math.max(0, Math.min(1.5, val));
    handleVolumeChange(deckId, val);
  };

  const handleFaderPointerDown = (e: React.PointerEvent<HTMLDivElement>, deckId: 'A' | 'B', currentValue: number) => {
    e.preventDefault();
    
    const startY = e.clientY;
    const initialValue = currentValue;
    document.body.style.cursor = 'grabbing';

    const handlePointerMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      let val = initialValue + (-deltaY / 150) * 1.5;
      val = Math.max(0, Math.min(1.5, val));
      handleVolumeChange(deckId, val);
    };

    const handlePointerUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleCrossfaderWheel = (e: React.WheelEvent<HTMLDivElement>, currentValue: number) => {
    e.preventDefault();
    const now = Date.now();
    const timeSinceLast = now - lastFaderWheelTimeRef.current;
    lastFaderWheelTimeRef.current = now;

    let amt = 1.0 * 0.01;
    if (timeSinceLast < 80) {
      const speedRatio = 1 - (timeSinceLast / 80);
      amt *= 1 + (speedRatio * speedRatio * speedRatio * 30);
    }
    // scrolling down (positive deltaY) moves crossfader left? Or right?
    // standard: scroll up -> increases value (moves right). So deltaY < 0 is right.
    let val = currentValue + (e.deltaY > 0 ? -amt : amt);
    val = Math.max(0, Math.min(1, val));
    handleCrossfadeChange({ target: { value: val.toString() } } as unknown as ChangeEvent<HTMLInputElement>);
  };

  const handleCrossfaderPointerDown = (e: React.PointerEvent<HTMLDivElement>, currentValue: number) => {
    e.preventDefault();
    
    const startX = e.clientX;
    const initialValue = currentValue;
    document.body.style.cursor = 'grabbing';

    const handlePointerMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const trackWidth = crossfadeSliderRef.current?.clientWidth || 160;
      let val = initialValue + (deltaX / trackWidth);
      val = Math.max(0, Math.min(1, val));
      handleCrossfadeChange({ target: { value: val.toString() } } as unknown as ChangeEvent<HTMLInputElement>);
    };

    const handlePointerUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };


  return (
    <div className="w-[200px] h-[480px] flex flex-col relative gap-2 shrink-0">
      
      {/* Top Section: Channels */}
      <div className="flex-1 flex justify-between gap-1 overflow-hidden">
        
        {/* Deck A Channel Strip */}
        <div className="flex-1 flex flex-col items-center bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl shadow-md py-1 shrink-0">
          <RotaryKnob label="Gain" size="xs" min={0} max={2} step={0.01} value={deckA.gain} onChange={(v) => handleGainChange('A', v)} onDoubleClick={() => handleGainChange('A', 1.0)} />
          <div className="w-6 border-b-2 border-slate-200 dark:border-slate-700 my-[1px]"></div>
          <RotaryKnob label="High" size="sm" min={-24} max={6} step={0.1} value={deckA.eq.high} onChange={(v) => handleEqChange('A', 'high', v)} onDoubleClick={() => handleEqChange('A', 'high', 0)} />
          <RotaryKnob label="Mid" size="sm" min={-24} max={6} step={0.1} value={deckA.eq.mid} onChange={(v) => handleEqChange('A', 'mid', v)} onDoubleClick={() => handleEqChange('A', 'mid', 0)} />
          <RotaryKnob label="Low" size="sm" min={-24} max={6} step={0.1} value={deckA.eq.low} onChange={(v) => handleEqChange('A', 'low', v)} onDoubleClick={() => handleEqChange('A', 'low', 0)} />
          <div className="w-6 border-b-2 border-slate-200 dark:border-slate-700 my-[1px]"></div>
          <RotaryKnob label="Filter" size="sm" color="blue" min={-100} max={100} step={1} value={deckA.filter} onChange={(v) => handleFilterChange('A', v)} onDoubleClick={() => handleFilterChange('A', 0)} />
          
          {/* Fader & VU Block */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => handleCueToggle('A')}
              className={`w-12 h-5 rounded flex items-center justify-center border transition-colors shadow-sm ${deckA.isCue ? 'bg-orange-500 text-white border-orange-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700'}`}
              title="Headphone Cue"
            >
              <Headphones size={13} />
            </button>
            <div className="flex items-center gap-2 h-[90px]">
              <VUMeter deckId="A" />
              <div className="h-full w-6 bg-slate-100 dark:bg-slate-950 rounded-lg flex justify-center py-1 border border-slate-300 dark:border-slate-900 shadow-inner relative touch-none" onPointerDown={(e) => handleFaderPointerDown(e, 'A', deckA.volume)} onWheel={(e) => handleFaderWheel(e, 'A', deckA.volume)} onDoubleClick={() => handleVolumeChange('A', 1.0)}>
                <input 
                  type="range" 
                  min="0" max="1.5" step="0.01" 
                  value={deckA.volume} 
                  onChange={(e) => handleVolumeChange('A', parseFloat(e.target.value))} 
                  onDoubleClick={() => handleVolumeChange('A', 1.0)} 
                  
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize z-10"
                  style={{ writingMode: 'vertical-lr' } as React.CSSProperties}
                />
                <div className="w-1 bg-slate-300 dark:bg-slate-900 h-full rounded-full"></div>
                {/* Fader Cap */}
                <div 
                  className="absolute w-full h-5 bg-slate-200 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-600 rounded flex items-center justify-center shadow-lg pointer-events-none"
                  style={{ bottom: `${(deckA.volume / 1.5) * 100}%`, transform: 'translateY(50%)' }}
                >
                  <div className="w-full h-1 bg-white/60 dark:bg-white/20"></div>
                </div>
              </div>
              <VUMeter deckId="A" />
            </div>
          </div>
        </div>

        {/* Deck B Channel Strip */}
        <div className="flex-1 flex flex-col items-center bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl shadow-md py-1 shrink-0">
          <RotaryKnob label="Gain" size="xs" min={0} max={2} step={0.01} value={deckB.gain} onChange={(v) => handleGainChange('B', v)} onDoubleClick={() => handleGainChange('B', 1.0)} />
          <div className="w-6 border-b-2 border-slate-200 dark:border-slate-700 my-[1px]"></div>
          <RotaryKnob label="High" size="sm" min={-24} max={6} step={0.1} value={deckB.eq.high} onChange={(v) => handleEqChange('B', 'high', v)} onDoubleClick={() => handleEqChange('B', 'high', 0)} />
          <RotaryKnob label="Mid" size="sm" min={-24} max={6} step={0.1} value={deckB.eq.mid} onChange={(v) => handleEqChange('B', 'mid', v)} onDoubleClick={() => handleEqChange('B', 'mid', 0)} />
          <RotaryKnob label="Low" size="sm" min={-24} max={6} step={0.1} value={deckB.eq.low} onChange={(v) => handleEqChange('B', 'low', v)} onDoubleClick={() => handleEqChange('B', 'low', 0)} />
          <div className="w-6 border-b-2 border-slate-200 dark:border-slate-700 my-[1px]"></div>
          <RotaryKnob label="Filter" size="sm" color="amber" min={-100} max={100} step={1} value={deckB.filter} onChange={(v) => handleFilterChange('B', v)} onDoubleClick={() => handleFilterChange('B', 0)} />
          
          {/* Fader & VU Block */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => handleCueToggle('B')}
              className={`w-12 h-5 rounded flex items-center justify-center border transition-colors shadow-sm ${deckB.isCue ? 'bg-orange-500 text-white border-orange-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700'}`}
              title="Headphone Cue"
            >
              <Headphones size={13} />
            </button>
            <div className="flex items-center gap-2 h-[90px]">
              <VUMeter deckId="B" />
              <div className="h-full w-6 bg-slate-100 dark:bg-slate-950 rounded-lg flex justify-center py-1 border border-slate-300 dark:border-slate-900 shadow-inner relative touch-none" onPointerDown={(e) => handleFaderPointerDown(e, 'B', deckB.volume)} onWheel={(e) => handleFaderWheel(e, 'B', deckB.volume)} onDoubleClick={() => handleVolumeChange('B', 1.0)}>
                <input 
                  type="range" 
                  min="0" max="1.5" step="0.01" 
                  value={deckB.volume} 
                  onChange={(e) => handleVolumeChange('B', parseFloat(e.target.value))} 
                  onDoubleClick={() => handleVolumeChange('B', 1.0)} 
                  
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize z-10"
                  style={{ writingMode: 'vertical-lr' } as React.CSSProperties}
                />
                <div className="w-1 bg-slate-300 dark:bg-slate-900 h-full rounded-full"></div>
                {/* Fader Cap */}
                <div 
                  className="absolute w-full h-5 bg-slate-200 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-600 rounded flex items-center justify-center shadow-lg pointer-events-none"
                  style={{ bottom: `${(deckB.volume / 1.5) * 100}%`, transform: 'translateY(50%)' }}
                >
                  <div className="w-full h-1 bg-white/60 dark:bg-white/20"></div>
                </div>
              </div>
              <VUMeter deckId="B" />
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Section: Crossfader Hub */}
      <div className="h-[75px] border-2 border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center bg-white dark:bg-slate-800 shadow-md shrink-0 relative py-1 px-2">
        <div className="flex w-full justify-between items-center mb-1">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase flex-1 text-center pl-6">Crossfader</span>
          <select 
            value={useMixerStore(s => s.crossfadeCurve)}
            onChange={(e) => useMixerStore.getState().setCrossfadeCurve(e.target.value as 'constant_power' | 'linear' | 'cut')}
            className="text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-600 outline-none w-[60px]"
          >
            <option value="constant_power">Power</option>
            <option value="linear">Linear</option>
            <option value="cut">Cut</option>
          </select>
        </div>
        
        <div className="w-full h-8 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 shadow-inner flex items-center px-1 relative touch-none" onPointerDown={(e) => handleCrossfaderPointerDown(e, crossfade)} onWheel={(e) => handleCrossfaderWheel(e, crossfade)} onDoubleClick={() => handleCrossfadeChange({ target: { value: '0.5' } } as unknown as ChangeEvent<HTMLInputElement>)}>
          <input 
            ref={crossfadeSliderRef}
            type="range" 
            min="0" max="1" step="0.01" 
            value={crossfade} 
            onChange={handleCrossfadeChange}
            onDoubleClick={() => handleCrossfadeChange({ target: { value: '0.5' } } as ChangeEvent<HTMLInputElement>)}
           
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
          />
          <div className="h-1 bg-slate-300 dark:bg-black rounded-full absolute left-2 right-2"></div>
          {/* Crossfader Cap */}
          <div 
            className="absolute w-8 h-8 bg-slate-200 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-600 rounded shadow-xl flex items-center justify-center pointer-events-none transition-none"
            style={{ left: `calc(${crossfade * 100}% - 16px)` }}
          >
            <div className="w-1 h-full bg-white/60 dark:bg-white/20"></div>
          </div>
        </div>
      </div>

    </div>
  );
};
