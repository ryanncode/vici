import("stdfaust.lib");

// --- UI Controls ---
pitch_rate = hslider("pitch", 1.0, 0.5, 2.0, 0.001);

// 3-Band EQ (Gain in dB)
low_gain  = hslider("eq_low", 0.0, -24.0, 6.0, 0.1) : si.smoo;
mid_gain  = hslider("eq_mid", 0.0, -24.0, 6.0, 0.1) : si.smoo;
high_gain = hslider("eq_high", 0.0, -24.0, 6.0, 0.1) : si.smoo;

// Master Volume
volume = hslider("volume", 1.0, 0.0, 1.5, 0.01) : si.smoo;

// DJ Filter (-100 to 100)
filter_color = hslider("filter", 0.0, -100.0, 100.0, 1.0) : si.smoo;

// --- DSP Processing ---

// 3-Band EQ
eq(l, r) = l_eq, r_eq
with {
    eq_filter = fi.low_shelf(low_gain, 250) : fi.peak_eq(mid_gain, 1000, 1) : fi.high_shelf(high_gain, 2500);
    l_eq = l : eq_filter;
    r_eq = r : eq_filter;
};

// Resonant DJ Filter
// If filter_color < 0, map to Lowpass (20000Hz down to 20Hz)
// If filter_color > 0, map to Highpass (20Hz up to 20000Hz)
dj_filter(l, r) = l_filt, r_filt
with {
    c = filter_color / 100.0;
    
    // Smooth the absolute value to map frequency
    abs_c = abs(c);
    
    // Freq ranges from 20 to 20000 exponentially
    freq = 20.0 * (1000.0 ^ abs_c);
    
    res = 1.5; // Lower resonance to sound less terrible
    
    // Always run both filters to prevent clicks from state reset
    l_lp = l : fi.resonlp(20000.0 * (0.001 ^ abs_c), res, 1.0);
    r_lp = r : fi.resonlp(20000.0 * (0.001 ^ abs_c), res, 1.0);
    
    l_hp = l : fi.resonhp(freq, res, 1.0);
    r_hp = r : fi.resonhp(freq, res, 1.0);
    
    // Mix smoothly based on c
    // Crossfade rapidly around the center (0.0) to avoid phase cancellation
    // between the dry signal and the filters
    lp_mix = min(1.0, max(0.0, -c * 10.0));
    hp_mix = min(1.0, max(0.0, c * 10.0));
    dry_mix = 1.0 - (lp_mix + hp_mix);
    
    l_filt = (l_lp * lp_mix) + (l_hp * hp_mix) + (l * dry_mix);
    r_filt = (r_lp * lp_mix) + (r_hp * hp_mix) + (r * dry_mix);
};

// --- Main Audio Graph ---
process = eq : dj_filter : *(volume), *(volume);
