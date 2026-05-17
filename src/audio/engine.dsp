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

// --- FX Controls ---

// Delay
fx_delay_on = hslider("fx_delay_on", 0, 0, 1, 1) : si.smoo; // 0 or 1
fx_delay_time = hslider("fx_delay_time", 0.5, 0.0, 2.0, 0.01) : si.smoo; 
fx_delay_feedback = hslider("fx_delay_feedback", 0.5, 0.0, 0.95, 0.01) : si.smoo;

// Reverb
fx_reverb_on = hslider("fx_reverb_on", 0, 0, 1, 1) : si.smoo;
fx_reverb_size = hslider("fx_reverb_size", 0.5, 0.0, 1.0, 0.01) : si.smoo;

// Phaser
fx_phaser_on = hslider("fx_phaser_on", 0, 0, 1, 1) : si.smoo;
fx_phaser_rate = hslider("fx_phaser_rate", 1.0, 0.1, 10.0, 0.01) : si.smoo;

// Gate
fx_gate_on = hslider("fx_gate_on", 0, 0, 1, 1) : si.smoo;
fx_gate_rate = hslider("fx_gate_rate", 4.0, 1.0, 32.0, 0.1) : si.smoo; // hz

// Roll (Beat Repeater)
fx_roll_on = hslider("fx_roll_on", 0, 0, 1, 1) : si.smoo;
fx_roll_bpm = hslider("fx_roll_bpm", 120.0, 30.0, 300.0, 0.1) : si.smoo;

// Siren
fx_siren_on = hslider("fx_siren_on", 0, 0, 1, 1) : si.smoo;


// --- DSP Blocks ---

// EQ
eq(l, r) = l_eq, r_eq
with {
    eq_filter = fi.low_shelf(low_gain, 250) : fi.peak_eq(mid_gain, 1000, 1) : fi.high_shelf(high_gain, 2500);
    l_eq = l : eq_filter;
    r_eq = r : eq_filter;
};

// DJ Filter
dj_filter(l, r) = l_filt, r_filt
with {
    c = filter_color / 100.0;
    abs_c = abs(c);
    freq = 20.0 * (1000.0 ^ abs_c);
    res = 1.5;
    
    l_lp = l : fi.resonlp(20000.0 * (0.001 ^ abs_c), res, 1.0);
    r_lp = r : fi.resonlp(20000.0 * (0.001 ^ abs_c), res, 1.0);
    
    l_hp = l : fi.resonhp(freq, res, 1.0);
    r_hp = r : fi.resonhp(freq, res, 1.0);
    
    lp_mix = min(1.0, max(0.0, -c * 10.0));
    hp_mix = min(1.0, max(0.0, c * 10.0));
    dry_mix = 1.0 - (lp_mix + hp_mix);
    
    l_filt = (l_lp * lp_mix) + (l_hp * hp_mix) + (l * dry_mix);
    r_filt = (r_lp * lp_mix) + (r_hp * hp_mix) + (r * dry_mix);
};

// 1. Delay
delay_fx(l, r) = l_out, r_out
with {
    delay_time_samp = max(1.0, fx_delay_time * ma.SR);
    fb = fx_delay_feedback;
    wet = fx_delay_on;
    
    dl_l(x) = x * wet : + ~ (de.fdelay(ma.SR*4, delay_time_samp) : *(fb));
    l_out = l + dl_l(l);
    
    dl_r(x) = x * wet : + ~ (de.fdelay(ma.SR*4, delay_time_samp) : *(fb));
    r_out = r + dl_r(r);
};

// 2. Reverb (Simple)
reverb_fx(l, r) = l_out, r_out
with {
    wet = fx_reverb_on * fx_reverb_size;
    
    // simple FDN-like or just comb filters
    rev_l = l : + ~ (de.fdelay(ma.SR, ma.SR*0.03) : *(0.8));
    rev_r = r : + ~ (de.fdelay(ma.SR, ma.SR*0.04) : *(0.8));
    
    l_out = l + (rev_l * wet);
    r_out = r + (rev_r * wet);
};

// 3. Phaser
phaser_fx(l, r) = l_out, r_out
with {
    wet = fx_phaser_on;
    
    rate = fx_phaser_rate;
    lfo = os.osc(rate) * 0.5 + 0.5; // 0 to 1
    freq = 500.0 + lfo * 2000.0;
    
    // A simple notch filter sweeping gives a phaser-like effect
    ph_l = l : fi.peak_eq(-20, freq, 2.0) : fi.peak_eq(-20, freq * 2.0, 2.0);
    ph_r = r : fi.peak_eq(-20, freq, 2.0) : fi.peak_eq(-20, freq * 2.0, 2.0);
    
    l_out = (l * (1-wet)) + (ph_l * wet);
    r_out = (r * (1-wet)) + (ph_r * wet);
};

// 4. Gate
gate_fx(l, r) = l_out, r_out
with {
    wet = fx_gate_on;
    lfo = os.lf_squarewave(fx_gate_rate) > 0.0;
    gate_val = 1.0 - (wet * (1.0 - lfo)) : si.smoo;
    l_out = l * gate_val;
    r_out = r * gate_val;
};

// 5. Roll (Beat Repeater)
roll_fx(l, r) = l_out, r_out
with {
    trigger = fx_roll_on > 0.5;
    smooth_mix = trigger : si.smoo;
    roll_time = max(1.0, (60.0 / max(1.0, fx_roll_bpm)) * 0.5 * ma.SR);
    captured_time = roll_time : ba.sAndH(trigger);
    
    // We add a tiny bit of feedback decay (e.g., 0.99) instead of 1.0 
    // to prevent the loop from blowing up or accumulating DC offset,
    // and a gentle lowpass to take the edge off loop-boundary clicks.
    loop_fb = trigger * 0.98;
    
    loop_l(x) = x * (1.0 - trigger) : + ~ (de.fdelay(ma.SR*4, captured_time) : *(loop_fb) : fi.lowpass(1, 15000));
    loop_r(x) = x * (1.0 - trigger) : + ~ (de.fdelay(ma.SR*4, captured_time) : *(loop_fb) : fi.lowpass(1, 15000));
    
    l_out = l * (1.0 - smooth_mix) + loop_l(l) * smooth_mix;
    r_out = r * (1.0 - smooth_mix) + loop_r(r) * smooth_mix;
};

// 6. Siren (Dub Siren)
siren_fx(l, r) = l_out, r_out
with {
    wet = fx_siren_on;
    
    // Base frequency modulated by a fast LFO
    lfo = os.osc(4.0) * 0.5 + 0.5; // 4Hz
    freq = 400.0 + lfo * 400.0;
    
    // Square wave oscillator
    siren_sig = os.square(freq) * 0.2; // 0.2 gain
    
    // Apply an envelope so it doesn't click, and triggered by fx_siren_on
    env = en.adsr(0.1, 0.1, 0.8, 0.5, wet);
    siren_sound = siren_sig * env;
    
    l_out = l + siren_sound;
    r_out = r + siren_sound;
};

// --- Main Audio Graph ---
process = eq : delay_fx : reverb_fx : phaser_fx : roll_fx : gate_fx : siren_fx : dj_filter : *(volume), *(volume);
