import("stdfaust.lib");

// --- Utilities ---
// Anti-Denormal protection: Add a tiny imperceptible DC offset to prevent IIR filters from processing subnormals
denormal_dc = 1e-15;

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
fx_reverb_decay = hslider("fx_reverb_decay", 3.0, 0.1, 10.0, 0.1) : si.smoo;
fx_reverb_predelay = hslider("fx_reverb_predelay", 20.0, 0.0, 100.0, 1.0) : si.smoo;
fx_reverb_color = hslider("fx_reverb_color", 0.0, -1.0, 1.0, 0.01) : si.smoo;

// Phaser
fx_phaser_on = hslider("fx_phaser_on", 0, 0, 1, 1) : si.smoo;
fx_phaser_rate = hslider("fx_phaser_rate", 1.0, 0.1, 10.0, 0.01) : si.smoo;

// Gate
fx_gate_on = hslider("fx_gate_on", 0, 0, 1, 1) : si.smoo;
fx_gate_rate = hslider("fx_gate_rate", 4.0, 1.0, 32.0, 0.1) : si.smoo; // hz

// Roll (Beat Repeater)
fx_roll_on = hslider("fx_roll_on", 0, 0, 1, 1) : si.smoo;
fx_roll_bpm = hslider("fx_roll_bpm", 120.0, 30.0, 300.0, 0.1) : si.smoo;
fx_roll_beats = hslider("fx_roll_beats", 1.0, 0.0625, 4.0, 0.0625) : si.smoo;

// Siren
fx_siren_on = hslider("fx_siren_on", 0, 0, 1, 1) : si.smoo;
fx_siren_type = hslider("fx_siren_type", 0, 0, 3, 1);
fx_siren_freq = hslider("fx_siren_freq", 300.0, 50.0, 2000.0, 1.0) : si.smoo;
fx_siren_lfo_rate = hslider("fx_siren_lfo_rate", 2.0, 0.1, 20.0, 0.1) : si.smoo;
fx_siren_lfo_depth = hslider("fx_siren_lfo_depth", 500.0, 0.0, 2000.0, 1.0) : si.smoo;

// Compressor (Macro Dynamics)
fx_compressor_on = hslider("fx_compressor_on", 0, 0, 1, 1) : si.smoo;
fx_compressor_ratio = hslider("fx_compressor_ratio", 2.0, 1.0, 20.0, 0.1);
fx_compressor_thresh = hslider("fx_compressor_thresh", -12.0, -60.0, 0.0, 0.1);
fx_compressor_attack = hslider("fx_compressor_attack", 0.01, 0.001, 1.0, 0.001);
fx_compressor_release = hslider("fx_compressor_release", 0.1, 0.01, 2.0, 0.01);

// Noise Sweep
fx_noise_on = hslider("fx_noise_on", 0, 0, 1, 1) : si.smoo;
fx_noise_sweep = hslider("fx_noise_sweep", 0.5, 0.0, 1.0, 0.01) : si.smoo;

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
    
    // HP: 20Hz -> 20kHz
    hp_freq = 20.0 * (1000.0 ^ abs_c);
    
    // LP: 20kHz -> 20Hz
    lp_freq = 20000.0 * (0.001 ^ abs_c);
    
    Q = 0.707 + (abs_c * 1.5);
    drive = abs_c * 0.8; // Introduce Crunch as filter opens
    
    is_lp = c < -0.01;
    is_hp = c > 0.01;
    is_bypass = (is_lp == 0) & (is_hp == 0);
    
    l_lp = l : fi.svf.lp(lp_freq, Q) : ef.cubicnl(drive, 0);
    r_lp = r : fi.svf.lp(lp_freq, Q) : ef.cubicnl(drive, 0);
    
    l_hp = l : fi.svf.hp(hp_freq, Q) : ef.cubicnl(drive, 0);
    r_hp = r : fi.svf.hp(hp_freq, Q) : ef.cubicnl(drive, 0);
    
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
reverb_fx(l, r) = l, r : re.zita_rev1_stereo(fx_reverb_predelay, f1, f2, fx_reverb_decay, fx_reverb_decay, 48000) : rev_mix
with {
    wet = fx_reverb_on * fx_reverb_size;
    c = fx_reverb_color;
    f1 = 200.0 * (1.0 + (max(0.0, c) * 4.0));
    f2 = 6000.0 * (1.0 - (max(0.0, -c) * 0.8333));
    rev_mix(rev_l, rev_r) = (l * (1.0 - wet)) + (rev_l * wet), (r * (1.0 - wet)) + (rev_r * wet);
};

// 3. Phaser
phaser_fx(l, r) = l, r <: (*(1-wet), *(1-wet)), (pf.phaser2_stereo(4, 1, 100, 2, 4000, fx_phaser_rate, 0.8, 0.1, 0) : *(wet), *(wet)) :> _,_
with {
    wet = fx_phaser_on;
};

// 4. Gate
gate_fx(l, r) = l_out, r_out
with {
    wet = fx_gate_on;
    lfo = os.lf_squarewave(fx_gate_rate) > 0.0;
    env = lfo : en.ar(0.01, 0.05); // softer attack/release to remove squeak
    gate_val = 1.0 - (wet * (1.0 - env));
    l_out = l * gate_val;
    r_out = r * gate_val;
};

// 5. Roll (Beat Repeater)
roll_fx(l, r) = l_out, r_out
with {
    trigger = fx_roll_on > 0.5;
    smooth_mix = trigger : si.smoo;
    
    capture_trig = trigger > trigger';
    
    roll_time = max(1.0, (60.0 / max(1.0, fx_roll_bpm)) * fx_roll_beats * ma.SR);
    cap_samps = max(1, int(roll_time : ba.sAndH(capture_trig)));
    
    table_size = 262144;
    write_idx = (+(1) : %(table_size)) ~ _ ;
    start_idx = write_idx : ba.sAndH(capture_trig);
    
    run_counter = (+(1) : %(cap_samps)) ~ *(trigger);
    
    read_idx = (start_idx + run_counter) % table_size;
    
    roll_l = rwtable(table_size, 0.0, int(write_idx), l, int(read_idx));
    roll_r = rwtable(table_size, 0.0, int(write_idx), r, int(read_idx));
    
    dip_samps = max(1, int(0.002 * ma.SR));
    env_dip = (run_counter > dip_samps) & (run_counter < (cap_samps - dip_samps));
    fast_smoo = si.smooth(ba.tau2pole(0.002));
    loop_env = env_dip : fast_smoo;
    
    l_out = l * (1.0 - smooth_mix) + (roll_l * loop_env) * smooth_mix;
    r_out = r * (1.0 - smooth_mix) + (roll_r * loop_env) * smooth_mix;
};

// 6. Siren (Dub Siren)
siren_fx(l, r) = l_out, r_out
with {
    wet = fx_siren_on;
    
    // Allow different siren types: 0=Triangle, 1=Square, 2=Sine, 3=Saw
    lfo = (os.lf_triangle(fx_siren_lfo_rate) * (fx_siren_type == 0)) + 
          (os.lf_squarewave(fx_siren_lfo_rate) * (fx_siren_type == 1)) + 
          (os.osc(fx_siren_lfo_rate) * (fx_siren_type == 2)) +
          (os.sawtooth(fx_siren_lfo_rate) * (fx_siren_type == 3));
          
    freq = fx_siren_freq + (lfo * 0.5 + 0.5) * fx_siren_lfo_depth;
    siren_sig = os.square(freq) * 0.05; // Much quieter
    env = en.adsr(0.05, 0.1, 0.8, 0.5, wet);
    siren_dry = siren_sig * env;
    siren_echo(x) = x : + ~ (de.fdelay(ma.SR*4, ma.SR * 0.375) : *(0.75) : fi.lowpass(1, 4000));
    siren_sound = siren_dry : siren_echo;
    l_out = l + siren_sound;
    r_out = r + siren_sound;
};

// 7. Compressor (Macro Dynamics)
compressor_fx(l, r) = l_out, r_out
with {
    wet = fx_compressor_on;
    ratio = fx_compressor_ratio;
    thresh = fx_compressor_thresh;
    att = fx_compressor_attack;
    rel = fx_compressor_release;
    
    c_l = l : co.compressor_mono(ratio, thresh, att, rel);
    c_r = r : co.compressor_mono(ratio, thresh, att, rel);
    
    l_out = (l * (1.0 - wet)) + (c_l * wet);
    r_out = (r * (1.0 - wet)) + (c_r * wet);
};

// 8. Noise Sweep
noise_fx(l, r) = l_out, r_out
with {
    wet = fx_noise_on;
    pink = no.pink_noise * 0.2;
    sweep_freq = 200.0 * (75.0 ^ fx_noise_sweep);
    bp_noise = pink : fi.svf.bp(sweep_freq, 4.0);
    noise_sig = bp_noise * wet;
    l_out = l + noise_sig;
    r_out = r + noise_sig;
};

// --- Main Audio Graph ---
// True Peak Lookahead Limiter (Mastering Grade)
master_limiter(l, r) = l_out, r_out
with {
    ceiling = 0.98;
    abs_sig = max(abs(l), abs(r));
    
    // 2ms attack prevents instant waveform tracking. 1000ms release flattens low-frequency envelope ripple.
    peak_env = abs_sig : an.amp_follower_ar(0.002, 1.000);
    
    gr_raw = min(1.0, ceiling / max(0.0001, peak_env));
    
    // 2-pole lowpass filter provides 12dB/oct steeper ripple rejection. 
    // A 15Hz 2-pole Butterworth naturally has a group delay of exactly 15.0 milliseconds.
    gr_smooth = gr_raw : fi.lowpass(2, 15.0);
    
    lookahead_samps = int(0.015 * ma.SR);
    l_delayed = l : de.delay(ma.SR, lookahead_samps);
    r_delayed = r : de.delay(ma.SR, lookahead_samps);
    
    l_out = l_delayed * gr_smooth;
    r_out = r_delayed * gr_smooth;
};

// Main processing chain with input sanitization!
process = (+ (denormal_dc), + (denormal_dc)) : eq : phaser_fx : roll_fx : gate_fx : compressor_fx : dj_filter : *(volume), *(volume) : delay_fx : reverb_fx : siren_fx : noise_fx : master_limiter : (- (denormal_dc), - (denormal_dc));