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

// Compressor (Macro Dynamics)
fx_compressor_on = hslider("fx_compressor_on", 0, 0, 1, 1) : si.smoo;


// --- DSP Blocks ---

// EQ
eq(l, r) = l_eq, r_eq
with {
    low_lin = ba.db2linear(low_gain);
    mid_lin = ba.db2linear(mid_gain);
    high_lin = ba.db2linear(high_gain);

    // Linkwitz-Riley 4th order (24dB/oct) crossover building blocks
    lp4(f) = fi.lowpass(2, f) : fi.lowpass(2, f);
    hp4(f) = fi.highpass(2, f) : fi.highpass(2, f);
    
    // Crossover frequencies
    f1 = 150.0;
    f2 = 6500.0;

    // Isolate bands (Left)
    l_low = l : lp4(f1);
    l_mid = l : hp4(f1) : lp4(f2);
    l_high = l : hp4(f1) : hp4(f2);
    
    l_eq = (l_low * low_lin) + (l_mid * mid_lin) + (l_high * high_lin);

    // Isolate bands (Right)
    r_low = r : lp4(f1);
    r_mid = r : hp4(f1) : lp4(f2);
    r_high = r : hp4(f1) : hp4(f2);
    
    r_eq = (r_low * low_lin) + (r_mid * mid_lin) + (r_high * high_lin);
};

// DJ Filter
dj_filter(l, r) = l_filt, r_filt
with {
    c = filter_color / 100.0; // -1.0 to 1.0
    abs_c = abs(c);
    
    // When dead center, pass perfectly clean signal. 
    // Otherwise apply filter 100% wet.
    
    // HP: 20Hz -> 20kHz
    hp_freq = 20.0 * (1000.0 ^ abs_c);
    
    // LP: 20kHz -> 20Hz
    lp_freq = 20000.0 * (0.001 ^ abs_c);
    
    Q = 0.707 + (abs_c * 1.5);
    
    // If c < 0, it's LP. If c > 0, it's HP. If c == 0, bypass.
    is_lp = c < -0.01;
    is_hp = c > 0.01;
    is_bypass = (is_lp == 0) & (is_hp == 0);
    
    l_lp = l : fi.svf.lp(lp_freq, Q);
    r_lp = r : fi.svf.lp(lp_freq, Q);
    
    l_hp = l : fi.svf.hp(hp_freq, Q);
    r_hp = r : fi.svf.hp(hp_freq, Q);
    
    l_filt = (l * is_bypass) + (l_lp * is_lp) + (l_hp * is_hp);
    r_filt = (r * is_bypass) + (r_lp * is_lp) + (r_hp * is_hp);
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

// 2. Reverb
reverb_fx(l, r) = l, r : re.zita_rev1_stereo(20, 200, 6000, 3.0, 3.0, 48000) : rev_mix
with {
    wet = fx_reverb_on * fx_reverb_size;
    rev_mix(rev_l, rev_r) = (l * (1.0 - wet)) + (rev_l * wet), (r * (1.0 - wet)) + (rev_r * wet);
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
    
    cap_samps = max(1, int(captured_time));
    counter = (+(1) : %(cap_samps)) ~ *(trigger);
    dip_samps = max(1, int(0.002 * ma.SR));
    env_dip = (counter > dip_samps) & (counter < (cap_samps - dip_samps));
    fast_smoo = si.smooth(ba.tau2pole(0.002));
    
    loop_fb = trigger * 0.98 * (env_dip : fast_smoo);
    
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

// 7. Compressor (Macro Dynamics)
compressor_fx(l, r) = l_out, r_out
with {
    wet = fx_compressor_on;
    ratio = 2.0;
    thresh = -12.0;
    att = 0.01;
    rel = 0.1;
    
    c_l = l : co.compressor_mono(ratio, thresh, att, rel);
    c_r = r : co.compressor_mono(ratio, thresh, att, rel);
    
    l_out = (l * (1.0 - wet)) + (c_l * wet);
    r_out = (r * (1.0 - wet)) + (c_r * wet);
};

// --- Main Audio Graph ---
// True Peak Lookahead Limiter to prevent clipping without WaveShaper distortion
master_limiter(l, r) = l_out, r_out
with {
    // 2ms lookahead buffer to catch peaks before they happen
    lookahead_time = 0.002;
    lookahead_samps = int(lookahead_time * ma.SR);
    
    // Fast attack (0.5ms) to pull down gain quickly within the lookahead window
    att_time = 0.0005;
    // Smooth release (50ms) to prevent pumping and harmonic distortion
    rel_time = 0.050;
    
    ceiling = 0.98; // Digital ceiling (-0.17 dBFS)
    
    // Track the absolute peak across both channels
    peak_sig = max(abs(l), abs(r));
    
    // Generate a smooth amplitude envelope
    env = peak_sig : an.amp_follower_ar(att_time, rel_time);
    
    // Calculate required gain reduction based on the envelope
    gain_reduction = min(1.0, ceiling / max(0.001, env));
    
    // Delay the original audio and apply the mathematically perfect gain reduction
    l_delayed = l : de.delay(ma.SR, lookahead_samps);
    r_delayed = r : de.delay(ma.SR, lookahead_samps);
    
    l_out = l_delayed * gain_reduction;
    r_out = r_delayed * gain_reduction;
};

process = eq : delay_fx : reverb_fx : phaser_fx : roll_fx : gate_fx : siren_fx : compressor_fx : dj_filter : *(volume), *(volume) : master_limiter;