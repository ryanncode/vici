import("stdfaust.lib");

// --- UI Controls ---
pitch_rate = hslider("pitch", 1.0, 0.5, 2.0, 0.001);

// 3-Band EQ (Gain in dB)
low_gain  = hslider("eq_low", 0.0, -24.0, 6.0, 0.1);
mid_gain  = hslider("eq_mid", 0.0, -24.0, 6.0, 0.1);
high_gain = hslider("eq_high", 0.0, -24.0, 6.0, 0.1);

// Master Volume
volume = hslider("volume", 1.0, 0.0, 1.0, 0.01);

// --- DSP Processing ---

// 3-Band EQ using stdfaust.lib filters
// Crossover frequencies: 250 Hz and 2500 Hz
eq(l, r) = l_eq, r_eq
with {
    // Basic 3-band EQ implementation using low shelf, peak, and high shelf
    eq_filter = fi.low_shelf(low_gain, 250) : fi.peak_eq(mid_gain, 1000, 1) : fi.high_shelf(high_gain, 2500);
    l_eq = l : eq_filter;
    r_eq = r : eq_filter;
};

// Variable delay line for high-quality pitch-shifting / resampling (SoX style approximation via interpolation)
// Using a 65536 sample delay line (approx 1.5s at 44.1kHz)
max_delay = 65536;
resampler(l, r) = l_pitch, r_pitch
with {
    // Basic fractional delay for pitch shifting (this is a simplified placeholder
    // for a true bandlimited polyphase FIR, which FAUST can optimize via library functions)
    delay_time = (1.0 - pitch_rate) * max_delay; 
    l_pitch = l : de.fdelay(max_delay, delay_time);
    r_pitch = r : de.fdelay(max_delay, delay_time);
};

// --- Main Audio Graph ---
// Stereo input -> Resampler -> EQ -> Volume -> Stereo output
process = resampler : eq : *(volume), *(volume);
