#include <emscripten/bind.h>
#include <wasm_simd128.h>
#include <vector>
#include <cmath>
#include <algorithm>
#include <cstring>
#include <memory>

using namespace emscripten;

class BungeeStretcher {
private:
    int sr;
    
    static const int WINDOW_SIZE = 2048;
    static const int H_OUT = 1024; // WINDOW_SIZE / 2
    static const int SEARCH_WINDOW = 512;
    
    std::vector<float> input_fifo_l;
    std::vector<float> input_fifo_r;
    int fifo_len;
    
    std::vector<float> output_fifo_l;
    std::vector<float> output_fifo_r;
    int out_fifo_len;
    
    std::vector<float> overlap_buffer_l;
    std::vector<float> overlap_buffer_r;
    
    std::vector<float> prev_unwindowed_l;
    std::vector<float> prev_unwindowed_r;
    
    std::vector<float> hann_window;
    
    double p_target;
    bool first_block;

    void precompute_window() {
        hann_window.resize(WINDOW_SIZE);
        for (int i = 0; i < WINDOW_SIZE; ++i) {
            hann_window[i] = 0.5f * (1.0f - std::cos(2.0f * M_PI * i / (WINDOW_SIZE - 1)));
        }
    }

    float cross_correlate(const float* ref_l, const float* ref_r, const float* cand_l, const float* cand_r) {
        v128_t sum_vec = wasm_f32x4_const_splat(0.0f);
        
        for (int i = 0; i < H_OUT; i += 4) {
            v128_t r_l = wasm_v128_load(&ref_l[i]);
            v128_t c_l = wasm_v128_load(&cand_l[i]);
            sum_vec = wasm_f32x4_add(sum_vec, wasm_f32x4_mul(r_l, c_l));
            
            v128_t r_r = wasm_v128_load(&ref_r[i]);
            v128_t c_r = wasm_v128_load(&cand_r[i]);
            sum_vec = wasm_f32x4_add(sum_vec, wasm_f32x4_mul(r_r, c_r));
        }
        
        float sums[4];
        wasm_v128_store(sums, sum_vec);
        return sums[0] + sums[1] + sums[2] + sums[3];
    }

    void push_audio(const float* input, int inputFrames) {
        if (fifo_len + inputFrames > static_cast<int>(input_fifo_l.size())) {
            input_fifo_l.resize(fifo_len + inputFrames + 8192);
            input_fifo_r.resize(fifo_len + inputFrames + 8192);
        }
        for (int i = 0; i < inputFrames; ++i) {
            input_fifo_l[fifo_len + i] = input[i * 2];
            input_fifo_r[fifo_len + i] = input[i * 2 + 1];
        }
        fifo_len += inputFrames;
    }

    void shift_fifo(int consumed) {
        if (consumed <= 0) return;
        int remaining = fifo_len - consumed;
        if (remaining > 0) {
            std::memmove(input_fifo_l.data(), input_fifo_l.data() + consumed, remaining * sizeof(float));
            std::memmove(input_fifo_r.data(), input_fifo_r.data() + consumed, remaining * sizeof(float));
        }
        fifo_len = remaining;
    }

    void push_output(const float* out_l, const float* out_r, int frames) {
        if (out_fifo_len + frames > static_cast<int>(output_fifo_l.size())) {
            output_fifo_l.resize(out_fifo_len + frames + 8192);
            output_fifo_r.resize(out_fifo_len + frames + 8192);
        }
        std::memcpy(output_fifo_l.data() + out_fifo_len, out_l, frames * sizeof(float));
        std::memcpy(output_fifo_r.data() + out_fifo_len, out_r, frames * sizeof(float));
        out_fifo_len += frames;
    }

    void shift_output_fifo(int consumed) {
        if (consumed <= 0) return;
        int remaining = out_fifo_len - consumed;
        if (remaining > 0) {
            std::memmove(output_fifo_l.data(), output_fifo_l.data() + consumed, remaining * sizeof(float));
            std::memmove(output_fifo_r.data(), output_fifo_r.data() + consumed, remaining * sizeof(float));
        }
        out_fifo_len = remaining;
    }

public:
    BungeeStretcher(int sampleRate) : sr(sampleRate) {
        precompute_window();
        
        input_fifo_l.resize(65536, 0.0f);
        input_fifo_r.resize(65536, 0.0f);
        output_fifo_l.resize(16384, 0.0f);
        output_fifo_r.resize(16384, 0.0f);
        
        overlap_buffer_l.resize(H_OUT, 0.0f);
        overlap_buffer_r.resize(H_OUT, 0.0f);
        
        prev_unwindowed_l.resize(WINDOW_SIZE, 0.0f);
        prev_unwindowed_r.resize(WINDOW_SIZE, 0.0f);
        
        reset();
    }

    void reset() {
        fifo_len = 0;
        out_fifo_len = 0;
        
        std::fill(overlap_buffer_l.begin(), overlap_buffer_l.end(), 0.0f);
        std::fill(overlap_buffer_r.begin(), overlap_buffer_r.end(), 0.0f);
        
        std::fill(prev_unwindowed_l.begin(), prev_unwindowed_l.end(), 0.0f);
        std::fill(prev_unwindowed_r.begin(), prev_unwindowed_r.end(), 0.0f);
        
        p_target = 0.0;
        first_block = true;
    }

    int process_audio(uintptr_t inputPtr, int inputFrames, uintptr_t outputPtr, int outputFrames, float speed, float pitch) {
        const float* input = reinterpret_cast<const float*>(inputPtr);
        float* output = reinterpret_cast<float*>(outputPtr);
        
        push_audio(input, inputFrames);
        
        // Generate output until we have enough to fulfill outputFrames
        std::vector<float> temp_out_l(H_OUT);
        std::vector<float> temp_out_r(H_OUT);
        
        while (out_fifo_len < outputFrames) {
            int target_int = static_cast<int>(p_target);
            
            // Check if we have enough input
            if (target_int + SEARCH_WINDOW + WINDOW_SIZE > fifo_len) {
                // Not enough input! We break and output whatever we have, padding with zeros.
                break;
            }
            
            int best_p = target_int;
            
            if (first_block) {
                best_p = target_int;
                first_block = false;
            } else {
                float max_corr = -1e30f;
                int search_start = std::max(0, target_int - SEARCH_WINDOW);
                int search_end = std::min(fifo_len - WINDOW_SIZE, target_int + SEARCH_WINDOW);
                
                const float* ref_l = &prev_unwindowed_l[H_OUT];
                const float* ref_r = &prev_unwindowed_r[H_OUT];
                
                for (int p = search_start; p <= search_end; ++p) {
                    float corr = cross_correlate(ref_l, ref_r, &input_fifo_l[p], &input_fifo_r[p]);
                    if (corr > max_corr) {
                        max_corr = corr;
                        best_p = p;
                    }
                }
            }
            
            // Overlap add
            for (int i = 0; i < H_OUT; ++i) {
                temp_out_l[i] = overlap_buffer_l[i] + input_fifo_l[best_p + i] * hann_window[i];
                temp_out_r[i] = overlap_buffer_r[i] + input_fifo_r[best_p + i] * hann_window[i];
                
                overlap_buffer_l[i] = input_fifo_l[best_p + H_OUT + i] * hann_window[H_OUT + i];
                overlap_buffer_r[i] = input_fifo_r[best_p + H_OUT + i] * hann_window[H_OUT + i];
                
                prev_unwindowed_l[i] = input_fifo_l[best_p + i];
                prev_unwindowed_r[i] = input_fifo_r[best_p + i];
                prev_unwindowed_l[H_OUT + i] = input_fifo_l[best_p + H_OUT + i];
                prev_unwindowed_r[H_OUT + i] = input_fifo_r[best_p + H_OUT + i];
            }
            
            push_output(temp_out_l.data(), temp_out_r.data(), H_OUT);
            
            p_target += H_OUT * speed;
        }
        
        // Return up to outputFrames
        int frames_to_return = std::min(outputFrames, out_fifo_len);
        
        for (int i = 0; i < frames_to_return; ++i) {
            output[i * 2] = output_fifo_l[i];
            output[i * 2 + 1] = output_fifo_r[i];
        }
        
        // Zero pad the rest if underrun
        for (int i = frames_to_return; i < outputFrames; ++i) {
            output[i * 2] = 0.0f;
            output[i * 2 + 1] = 0.0f;
        }
        
        shift_output_fifo(frames_to_return);
        
        // Garbage collect input fifo based on how far p_target advanced
        // We must keep SEARCH_WINDOW samples before p_target just in case
        int consume_up_to = std::max(0, static_cast<int>(p_target) - SEARCH_WINDOW);
        if (consume_up_to > 0) {
            shift_fifo(consume_up_to);
            p_target -= consume_up_to;
        }
        
        // IMPORTANT: We need to return the number of INPUT frames consumed!
        // wait, we just garbage collected consume_up_to, so we shifted the FIFO.
        // But how much total input did we consume from the original inputFrames?
        // JS fed inputFrames. We appended them.
        // JS wants to know how much its `playhead` should advance.
        // The playhead should advance by the exact macroscopic time advanced.
        // We generated `frames_to_return` output frames.
        // At ratio `speed`, this corresponds to `frames_to_return * speed` input frames!
        // Yes! To maintain exact beat sync, JS playhead MUST advance by exactly `frames_to_return * speed`!
        return static_cast<int>(std::round(frames_to_return * speed));
    }
};

class Resampler {
private:
    static const int CROSSINGS = 32;
    static const int RESOLUTION = 512;
    static const int NUM_BANKS = 64;
    static constexpr float MAX_PITCH = 2.0f;
    static constexpr float BETA = 9.0f;

    std::vector<float> sincTables;
    float frac;

    double besselI0(double x) {
        double sum = 1.0;
        double term = 1.0;
        double x2_4 = (x * x) / 4.0;
        for (int k = 1; k <= 20; k++) {
            term *= x2_4 / (k * k);
            sum += term;
            if (term < 1e-12 * sum) break;
        }
        return sum;
    }

public:
    Resampler() : frac(0.0f) {
        sincTables.resize(NUM_BANKS * RESOLUTION * (CROSSINGS * 2));
        double I0_BETA = besselI0(BETA);

        for (int bank = 0; bank < NUM_BANKS; bank++) {
            double stretch = 1.0 + (bank / (double)(NUM_BANKS - 1)) * (MAX_PITCH - 1.0);
            int bankOffset = bank * RESOLUTION * (CROSSINGS * 2);

            for (int r = 0; r < RESOLUTION; r++) {
                double fracOffset = (double)r / RESOLUTION;
                double sumWeights = 0.0;
                
                int phaseOffset = bankOffset + r * (CROSSINGS * 2);

                std::vector<double> tempWeights(CROSSINGS * 2, 0.0);
                int weightIndex = 0;
                
                for (int j = -CROSSINGS; j < CROSSINGS; j++, weightIndex++) {
                    double x = j - fracOffset;
                    double stretchedX = std::abs(x) / stretch;
                    
                    if (stretchedX == 0.0) {
                        tempWeights[weightIndex] = 1.0 / stretch;
                        sumWeights += tempWeights[weightIndex];
                    } else if (stretchedX < CROSSINGS) {
                        double piX = M_PI * stretchedX;
                        double sinc = std::sin(piX) / piX;
                        
                        double xRatio = stretchedX / CROSSINGS;
                        double kaiser = besselI0(BETA * std::sqrt(1.0 - xRatio * xRatio)) / I0_BETA;
                        
                        tempWeights[weightIndex] = (sinc * kaiser) / stretch;
                        sumWeights += tempWeights[weightIndex];
                    }
                }
                
                if (sumWeights > 0.0) {
                    for (int j = 0; j < CROSSINGS * 2; j++) {
                        sincTables[phaseOffset + j] = static_cast<float>(tempWeights[j] / sumWeights);
                    }
                }
            }
        }
    }

    void reset() {
        frac = 0.0f;
    }

    int process_audio_simd(uintptr_t inputPtr, int inputFrames, uintptr_t outputPtr, int outputFrames, float ratio) {
        const float* input = reinterpret_cast<const float*>(inputPtr);
        float* output = reinterpret_cast<float*>(outputPtr);

        float stretch = std::max(1.0f, ratio);
        int bankIndex = std::round(((stretch - 1.0f) / (MAX_PITCH - 1.0f)) * (NUM_BANKS - 1));
        bankIndex = std::max(0, std::min(NUM_BANKS - 1, bankIndex));
        int bankOffset = bankIndex * RESOLUTION * (CROSSINGS * 2);

        int inputIndex = CROSSINGS;

        for (int i = 0; i < outputFrames; i++) {
            v128_t sum_vec = wasm_f32x4_const_splat(0.0f);
            
            float tableIndex = frac * RESOLUTION;
            int r1 = static_cast<int>(tableIndex);
            int r2 = std::min(r1 + 1, RESOLUTION - 1);
            float tFrac = tableIndex - r1;
            
            int phaseOffset1 = bankOffset + r1 * (CROSSINGS * 2);
            int phaseOffset2 = bankOffset + r2 * (CROSSINGS * 2);

            int weightIndex = 0;
            for (int j = -CROSSINGS; j < CROSSINGS; j += 2, weightIndex += 2) {
                int tapIndex1 = inputIndex + j;
                int tapIndex2 = inputIndex + j + 1;
                
                float w1_1 = sincTables[phaseOffset1 + weightIndex];
                float w1_2 = sincTables[phaseOffset2 + weightIndex];
                float finalWeight1 = w1_1 * (1.0f - tFrac) + w1_2 * tFrac;

                float w2_1 = sincTables[phaseOffset1 + weightIndex + 1];
                float w2_2 = sincTables[phaseOffset2 + weightIndex + 1];
                float finalWeight2 = w2_1 * (1.0f - tFrac) + w2_2 * tFrac;

                float L1 = (tapIndex1 >= 0 && tapIndex1 < inputFrames) ? input[tapIndex1 * 2] : 0.0f;
                float R1 = (tapIndex1 >= 0 && tapIndex1 < inputFrames) ? input[tapIndex1 * 2 + 1] : 0.0f;
                float L2 = (tapIndex2 >= 0 && tapIndex2 < inputFrames) ? input[tapIndex2 * 2] : 0.0f;
                float R2 = (tapIndex2 >= 0 && tapIndex2 < inputFrames) ? input[tapIndex2 * 2 + 1] : 0.0f;

                v128_t input_vec = wasm_f32x4_make(L1, R1, L2, R2);
                v128_t weight_vec = wasm_f32x4_make(finalWeight1, finalWeight1, finalWeight2, finalWeight2);
                
                v128_t mul_vec = wasm_f32x4_mul(input_vec, weight_vec);
                sum_vec = wasm_f32x4_add(sum_vec, mul_vec);
            }
            
            float sums[4];
            wasm_v128_store(sums, sum_vec);
            
            output[i * 2] = sums[0] + sums[2];
            output[i * 2 + 1] = sums[1] + sums[3];

            frac += ratio;
            int advance = static_cast<int>(frac);
            inputIndex += advance;
            frac -= advance;
        }

        return inputIndex - CROSSINGS;
    }
};

EMSCRIPTEN_BINDINGS(resampler_module) {
    class_<Resampler>("Resampler")
        .constructor<>()
        .function("reset", &Resampler::reset)
        .function("process_audio_simd", &Resampler::process_audio_simd);

    class_<BungeeStretcher>("BungeeStretcher")
        .constructor<int>()
        .function("reset", &BungeeStretcher::reset)
        .function("process_audio", &BungeeStretcher::process_audio);
}
