import React, { type ChangeEvent } from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import { useMixerStore } from '../store/mixerStore';
import { AudioEngine } from '../services/AudioEngine';
import * as Tone from 'tone';

export const MixerConsole = React.memo(function MixerConsole() {
  const deckA = useMixerStore(state => state.deckA);
  const deckB = useMixerStore(state => state.deckB);
  const crossfade = useMixerStore(state => state.crossfade);
  const isAutomixEnabled = useMixerStore(state => state.isAutomixEnabled);
  
  const setIsAutomixEnabled = useMixerStore(state => state.setIsAutomixEnabled);
  const setDeckFx = useMixerStore(state => state.setDeckFx);
  
  const scrollRef = React.useRef({ time: 0, multiplier: 1 });
  const crossfadeSliderRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!isAutomixEnabled) return;
    let lastVal = '';
    const loop = () => {
      if (crossfadeSliderRef.current) {
        const engine = AudioEngine.getInstance();
        const valStr = engine.crossfader.fade.value.toFixed(3);
        if (valStr !== lastVal) {
          crossfadeSliderRef.current.value = valStr;
          lastVal = valStr;
        }
      }
    };
    const interval = setInterval(loop, 50);
    return () => clearInterval(interval);
  }, [isAutomixEnabled]);

  const lastStateUpdateRef = React.useRef<{ [key: string]: number }>({});
  const dspThrottleRef = React.useRef<{ [key: string]: number }>({});
  const dspTimeoutRef = React.useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});

  const throttledDSP = (key: string, fn: () => void, delay = 32) => {
    const now = Date.now();
    const lastUpdate = dspThrottleRef.current[key] || 0;
    
    if (dspTimeoutRef.current[key]) {
      clearTimeout(dspTimeoutRef.current[key]);
    }

    if (now - lastUpdate >= delay) {
      fn();
      dspThrottleRef.current[key] = now;
    } else {
      dspTimeoutRef.current[key] = setTimeout(() => {
        fn();
        dspThrottleRef.current[key] = Date.now();
      }, delay);
    }
  };

  const throttledSetDeckState = (deckId: 'A' | 'B', key: string, value: number) => {
    const now = Date.now();
    const lastUpdate = lastStateUpdateRef.current[`${deckId}-${key}`] || 0;
    if (now - lastUpdate > 200) {
      useMixerStore.getState().setDeckState(deckId, { [key]: value });
      lastStateUpdateRef.current[`${deckId}-${key}`] = now;
    }
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
      engine.crossfader.fade.cancelScheduledValues(Tone.now());
      engine.setCrossfadeValue(val);
    });
    
    const now = Date.now();
    const lastUpdate = lastStateUpdateRef.current['crossfade'] || 0;
    if (now - lastUpdate > 200) {
      useMixerStore.getState().setCrossfade(val);
      lastStateUpdateRef.current['crossfade'] = now;
    }
  };

  const handleEqChange = (deckId: 'A' | 'B', band: 'high' | 'mid' | 'low', value: number) => {
    throttledDSP(`eq-${deckId}-${band}`, () => {
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      deckEngine.setEq(band, value);
    });
    
    const now = Date.now();
    const lastUpdate = lastStateUpdateRef.current[`${deckId}-eq-${band}`] || 0;
    if (now - lastUpdate > 200) {
      useMixerStore.getState().setDeckEq(deckId, { [band]: value });
      lastStateUpdateRef.current[`${deckId}-eq-${band}`] = now;
    }
  };

  const handleFilterChange = (deckId: 'A' | 'B', value: number) => {
    throttledDSP(`flt-${deckId}`, () => {
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      deckEngine.setFilterColor(value);
    });
    throttledSetDeckState(deckId, 'filter', value);
  };

  const handleFxToggle = (deckId: 'A' | 'B', fxType: 'gate' | 'roll' | 'siren') => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const currentFx = deckId === 'A' ? deckA.fx : deckB.fx;
    
    if (fxType === 'gate') {
      const newState = !currentFx.gateOn;
      setDeckFx(deckId, { gateOn: newState });
      deckEngine.setGateState(newState);
    } else if (fxType === 'roll') {
      const newState = !currentFx.rollOn;
      setDeckFx(deckId, { rollOn: newState });
      deckEngine.setRoll(newState, 8);
    } else if (fxType === 'siren') {
      const newState = !currentFx.sirenOn;
      setDeckFx(deckId, { sirenOn: newState });
      deckEngine.triggerSiren(newState);
    }
  };

  const handleSliderWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (e.currentTarget.type !== 'range') return;
    e.preventDefault();
    const target = e.currentTarget;
    const min = parseFloat(target.min || "0");
    const max = parseFloat(target.max || "100");
    const baseStep = parseFloat(target.step || "1");
    
    if (isNaN(baseStep)) return;

    const now = Date.now();
    const timeSinceLast = now - scrollRef.current.time;
    if (timeSinceLast < 50) {
      scrollRef.current.multiplier = Math.min(20, scrollRef.current.multiplier + 1);
    } else if (timeSinceLast > 250) {
      scrollRef.current.multiplier = 1;
    }
    scrollRef.current.time = now;
    
    let effectiveStep = baseStep * scrollRef.current.multiplier;
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
    <div className="w-56 sm:w-64 lg:w-72 flex flex-col p-2 sm:p-4 rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-inner">
      <div className="flex w-full justify-between items-start px-2 mb-2 sm:mb-4">
        <div className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wider mt-1">CH A</div>
        <div className="flex flex-col items-center gap-1.5 -mt-1">
          <h1 className="text-xl font-bold tracking-tight text-white leading-none">Vici</h1>
          <button 
            onClick={() => setIsAutomixEnabled(!isAutomixEnabled)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide transition ${isAutomixEnabled ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
          >
            {isAutomixEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            AUTOMIX
          </button>
        </div>
        <div className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wider mt-1">CH B</div>
      </div>

      <div className="flex justify-between w-full flex-1 gap-2 sm:gap-4">
        
        {/* Deck A Controls */}
        <div className="flex flex-1 gap-1 sm:gap-2">
          <div className="flex flex-col items-center h-full justify-center pb-4">
            <div className="h-32 sm:h-40 w-4 flex items-center justify-center relative">
              <input type="range" min="0" max="1.5" step="0.01" defaultValue={deckA.volume} onChange={(e) => handleVolumeChange('A', parseFloat(e.target.value))} onDoubleClick={(e) => { e.currentTarget.value = '1.0'; handleVolumeChange('A', 1.0); }} onWheel={handleSliderWheel} className="w-32 sm:w-40 h-1.5 absolute -rotate-90 appearance-none cursor-pointer accent-blue-500 bg-slate-800 rounded-full" />
            </div>
            <span className="text-[8px] sm:text-[9px] mt-2 font-bold text-slate-500">VOL</span>
          </div>

          <div className="flex flex-col justify-between flex-1 py-1 gap-2 sm:gap-3">
            {[
              { band: 'high', label: 'HI', value: deckA.eq.high },
              { band: 'mid', label: 'MID', value: deckA.eq.mid },
              { band: 'low', label: 'LOW', value: deckA.eq.low }
            ].map(({ band, label, value }) => (
              <div key={`eqa-${band}`} className="flex flex-col gap-1">
                <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold">{label}</span>
                <input type="range" min="-24" max="6" step="0.1" defaultValue={value} onChange={(e) => handleEqChange('A', band as 'high'|'mid'|'low', parseFloat(e.target.value))} onDoubleClick={(e) => { e.currentTarget.value = '0'; handleEqChange('A', band as 'high'|'mid'|'low', 0); }} onWheel={handleSliderWheel} className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 shadow-inner" />
              </div>
            ))}
            
            <div className="flex gap-1 mt-auto mb-1">
              <button
                onMouseDown={() => handleFxToggle('A', 'roll')}
                onMouseUp={() => handleFxToggle('A', 'roll')}
                onMouseLeave={() => deckA.fx.rollOn && handleFxToggle('A', 'roll')}
                className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${deckA.fx.rollOn ? 'bg-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
              >ROLL</button>
              <button
                onClick={() => handleFxToggle('A', 'gate')}
                className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${deckA.fx.gateOn ? 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
              >GATE</button>
              <button
                onMouseDown={() => handleFxToggle('A', 'siren')}
                onMouseUp={() => handleFxToggle('A', 'siren')}
                onMouseLeave={() => deckA.fx.sirenOn && handleFxToggle('A', 'siren')}
                className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${deckA.fx.sirenOn ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
              >SIREN</button>
            </div>

            <div className="flex flex-col gap-1 mt-1 mb-1">
              <span className="text-[8px] sm:text-[9px] text-blue-400 font-bold">FLT</span>
              <input type="range" min="-100" max="100" step="1" defaultValue={deckA.filter} onChange={(e) => handleFilterChange('A', parseFloat(e.target.value))} onDoubleClick={(e) => { e.currentTarget.value = '0'; handleFilterChange('A', 0); }} onWheel={handleSliderWheel} className="w-full h-2 sm:h-2.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 shadow-inner" />
            </div>
          </div>
        </div>

        {/* Deck B Controls */}
        <div className="flex flex-1 gap-1 sm:gap-2 flex-row-reverse">
          <div className="flex flex-col items-center h-full justify-center pb-4">
            <div className="h-32 sm:h-40 w-4 flex items-center justify-center relative">
              <input type="range" min="0" max="1.5" step="0.01" defaultValue={deckB.volume} onChange={(e) => handleVolumeChange('B', parseFloat(e.target.value))} onDoubleClick={(e) => { e.currentTarget.value = '1.0'; handleVolumeChange('B', 1.0); }} onWheel={handleSliderWheel} className="w-32 sm:w-40 h-1.5 absolute -rotate-90 appearance-none cursor-pointer accent-cyan-500 bg-slate-800 rounded-full" />
            </div>
            <span className="text-[8px] sm:text-[9px] mt-2 font-bold text-slate-500">VOL</span>
          </div>

          <div className="flex flex-col justify-between flex-1 py-1 gap-2 sm:gap-3 items-end">
            {[
              { band: 'high', label: 'HI', value: deckB.eq.high },
              { band: 'mid', label: 'MID', value: deckB.eq.mid },
              { band: 'low', label: 'LOW', value: deckB.eq.low }
            ].map(({ band, label, value }) => (
              <div key={`eqb-${band}`} className="flex flex-col gap-1 items-end w-full">
                <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold">{label}</span>
                <input type="range" min="-24" max="6" step="0.1" defaultValue={value} onChange={(e) => handleEqChange('B', band as 'high'|'mid'|'low', parseFloat(e.target.value))} onDoubleClick={(e) => { e.currentTarget.value = '0'; handleEqChange('B', band as 'high'|'mid'|'low', 0); }} onWheel={handleSliderWheel} className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 shadow-inner rotate-180" />
              </div>
            ))}
            
            <div className="flex gap-1 mt-auto mb-1 w-full flex-row-reverse">
              <button
                onMouseDown={() => handleFxToggle('B', 'roll')}
                onMouseUp={() => handleFxToggle('B', 'roll')}
                onMouseLeave={() => deckB.fx.rollOn && handleFxToggle('B', 'roll')}
                className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${deckB.fx.rollOn ? 'bg-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
              >ROLL</button>
              <button
                onClick={() => handleFxToggle('B', 'gate')}
                className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${deckB.fx.gateOn ? 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
              >GATE</button>
              <button
                onMouseDown={() => handleFxToggle('B', 'siren')}
                onMouseUp={() => handleFxToggle('B', 'siren')}
                onMouseLeave={() => deckB.fx.sirenOn && handleFxToggle('B', 'siren')}
                className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${deckB.fx.sirenOn ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
              >SIREN</button>
            </div>

            <div className="flex flex-col gap-1 mt-1 mb-1 items-end w-full">
              <span className="text-[8px] sm:text-[9px] text-cyan-400 font-bold">FLT</span>
              <input type="range" min="-100" max="100" step="1" defaultValue={deckB.filter} onChange={(e) => handleFilterChange('B', parseFloat(e.target.value))} onDoubleClick={(e) => { e.currentTarget.value = '0'; handleFilterChange('B', 0); }} onWheel={handleSliderWheel} className="w-full h-2 sm:h-2.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-500 shadow-inner rotate-180" />
            </div>
          </div>
        </div>

      </div>

      <div className="w-full mt-4 sm:mt-6 bg-slate-950/80 px-4 py-3 sm:py-4 rounded-lg border border-slate-800/80 shadow-inner">
        <input 
          ref={crossfadeSliderRef}
          type="range" 
          min="0" max="1" step="0.01" 
          defaultValue={crossfade} 
          onChange={handleCrossfadeChange}
          onDoubleClick={() => handleCrossfadeChange({ target: { value: '0.5' } } as ChangeEvent<HTMLInputElement>)}
          onWheel={handleSliderWheel}
          className="w-full h-2 sm:h-2.5 bg-slate-900 rounded-full appearance-none cursor-pointer accent-slate-400 shadow-inner"
        />
      </div>
    </div>
  );
});
