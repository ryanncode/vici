import React from 'react';

const RotaryKnob = ({ label, size = 'sm', color = 'slate' }: { label: string, size?: 'xs' | 'sm' | 'md' | 'lg', color?: 'slate' | 'amber' | 'blue' }) => {
  const dims = size === 'xs' ? 'w-8 h-8' : size === 'sm' ? 'w-10 h-10' : size === 'md' ? 'w-12 h-12' : 'w-16 h-16';
  const colorMap = {
    slate: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700',
    amber: 'bg-slate-100 dark:bg-slate-800 border-amber-400 dark:border-amber-600/50',
    blue: 'bg-slate-100 dark:bg-slate-800 border-blue-400 dark:border-blue-600/50'
  };

  return (
    <div className="flex flex-col items-center gap-1 my-[3px]">
      <div className={`${dims} rounded-full border-2 ${colorMap[color]} shadow-md relative flex items-center justify-center cursor-ns-resize`}>
        {/* Indicator Line */}
        <div className="absolute w-1 h-3/4 bg-slate-400 dark:bg-white/10 rounded-full top-1"></div>
        {/* Center marker */}
        <div className="absolute top-0 w-1 h-1.5 bg-slate-600 dark:bg-white rounded-full"></div>
      </div>
      <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase">{label}</span>
    </div>
  );
};

const VUMeter = () => {
  return (
    <div className="h-full w-2 bg-slate-200 dark:bg-slate-950 rounded-full flex flex-col justify-between py-1 px-[1px] border border-slate-300 dark:border-slate-900 shadow-inner">
      {/* 10 Segments (2 Red, 2 Yellow, 6 Green) */}
      {[...Array(10)].map((_, i) => (
        <div 
          key={i} 
          className={`w-full flex-1 mb-[1px] rounded-sm ${
            i < 2 ? 'bg-red-500/40 dark:bg-red-500/20' : 
            i < 4 ? 'bg-amber-500/40 dark:bg-amber-500/20' : 
            'bg-green-500/40 dark:bg-green-500/20'
          }`}
        ></div>
      ))}
    </div>
  );
};

export const CenterMixer: React.FC = () => {
  return (
    <div className="w-[250px] h-[520px] flex flex-col relative gap-[10px] shrink-0">
      
      {/* Top Section: Channels (420px max height) */}
      <div className="flex-1 flex justify-between gap-[10px] h-[420px] overflow-hidden">
        
        {/* Deck A Channel Strip */}
        <div className="flex-1 flex flex-col items-center bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-md py-2 shrink-0">
          <RotaryKnob label="Gain" size="xs" />
          <div className="w-8 border-b-2 border-slate-200 dark:border-slate-700 my-[2px]"></div>
          <RotaryKnob label="High" size="sm" />
          <RotaryKnob label="Mid" size="sm" />
          <RotaryKnob label="Low" size="sm" />
          <div className="w-8 border-b-2 border-slate-200 dark:border-slate-700 my-[2px]"></div>
          <RotaryKnob label="Filter" size="md" color="blue" />
          
          {/* Fader & VU Block */}
          <div className="flex items-center gap-3 mt-2 h-[90px]">
            <VUMeter />
            <div className="h-full w-8 bg-slate-100 dark:bg-slate-950 rounded-lg flex justify-center py-1 border border-slate-300 dark:border-slate-900 shadow-inner relative cursor-ns-resize">
              <div className="w-1 bg-slate-300 dark:bg-slate-900 h-full rounded-full"></div>
              {/* Fader Cap */}
              <div className="absolute top-1/4 w-full h-6 bg-slate-200 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-600 rounded flex items-center justify-center shadow-lg">
                <div className="w-full h-1 bg-white/60 dark:bg-white/20"></div>
              </div>
            </div>
            <VUMeter />
          </div>
        </div>

        {/* Deck B Channel Strip */}
        <div className="flex-1 flex flex-col items-center bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-md py-2 shrink-0">
          <RotaryKnob label="Gain" size="xs" />
          <div className="w-8 border-b-2 border-slate-200 dark:border-slate-700 my-[2px]"></div>
          <RotaryKnob label="High" size="sm" />
          <RotaryKnob label="Mid" size="sm" />
          <RotaryKnob label="Low" size="sm" />
          <div className="w-8 border-b-2 border-slate-200 dark:border-slate-700 my-[2px]"></div>
          <RotaryKnob label="Filter" size="md" color="amber" />
          
          {/* Fader & VU Block */}
          <div className="flex items-center gap-3 mt-2 h-[90px]">
            <VUMeter />
            <div className="h-full w-8 bg-slate-100 dark:bg-slate-950 rounded-lg flex justify-center py-1 border border-slate-300 dark:border-slate-900 shadow-inner relative cursor-ns-resize">
              <div className="w-1 bg-slate-300 dark:bg-slate-900 h-full rounded-full"></div>
              {/* Fader Cap */}
              <div className="absolute top-1/4 w-full h-6 bg-slate-200 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-600 rounded flex items-center justify-center shadow-lg">
                <div className="w-full h-1 bg-white/60 dark:bg-white/20"></div>
              </div>
            </div>
            <VUMeter />
          </div>
        </div>

      </div>

      {/* Bottom Section: Crossfader Hub */}
      <div className="h-[90px] border-2 border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center bg-white dark:bg-slate-800 shadow-md shrink-0">
        <span className="text-[9px] font-bold tracking-widest text-slate-500 mb-2 uppercase">Crossfader</span>
        
        <div className="w-[160px] h-10 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 shadow-inner flex items-center px-1 relative cursor-ew-resize">
          <div className="w-full h-1 bg-slate-300 dark:bg-black rounded-full absolute left-0 right-0 mx-2"></div>
          {/* Crossfader Cap */}
          <div className="absolute left-1/2 -translate-x-1/2 w-10 h-10 bg-slate-200 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-600 rounded shadow-xl flex items-center justify-center">
            <div className="w-1 h-full bg-white/60 dark:bg-white/20"></div>
          </div>
        </div>
      </div>

    </div>
  );
};
