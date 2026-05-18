#include <emscripten/bind.h>
#include <wasm_simd128.h>
#include <vector>
#include <cmath>
#include <algorithm>
#include <memory>
#include <bungee/Stream.h>

using namespace emscripten;

class BungeeStretcher {
private:
    std::unique_ptr<Bungee::Stretcher<Bungee::Basic>> stretcher;
    std::unique_ptr<Bungee::Stream<Bungee::Basic>> stream;
    
    std::vector<float> inL;
    std::vector<float> inR;
    std::vector<float> outL;
    std::vector<float> outR;
    
    int sr;

public:
    BungeeStretcher(int sampleRate) : sr(sampleRate) {
        Bungee::SampleRates rates{sampleRate, sampleRate};
        stretcher = std::make_unique<Bungee::Stretcher<Bungee::Basic>>(rates, 2);
        
        // maximum 4096 frames input per process call
        stream = std::make_unique<Bungee::Stream<Bungee::Basic>>(*stretcher, 4096, 2);
    }

    void reset() {
        Bungee::SampleRates rates{sr, sr};
        stretcher = std::make_unique<Bungee::Stretcher<Bungee::Basic>>(rates, 2);
        stream = std::make_unique<Bungee::Stream<Bungee::Basic>>(*stretcher, 4096, 2);
    }

    int process_audio(uintptr_t inputPtr, int inputFrames, uintptr_t outputPtr, int outputFrames, float speed, float pitch) {
        const float* input = reinterpret_cast<const float*>(inputPtr);
        float* output = reinterpret_cast<float*>(outputPtr);

        if (inL.size() < inputFrames) {
            inL.resize(inputFrames);
            inR.resize(inputFrames);
        }
        if (outL.size() < outputFrames) {
            outL.resize(outputFrames);
            outR.resize(outputFrames);
        }

        // Deinterleave
        for (int i = 0; i < inputFrames; i++) {
            inL[i] = input[i * 2];
            inR[i] = input[i * 2 + 1];
        }

        const float* inPointers[2] = {inL.data(), inR.data()};
        float* outPointers[2] = {outL.data(), outR.data()};

        int framesRendered = stream->process(inPointers, outPointers, inputFrames, outputFrames, pitch);

        // Interleave
        for (int i = 0; i < framesRendered; i++) {
            output[i * 2] = outL[i];
            output[i * 2 + 1] = outR[i];
        }

        return framesRendered;
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
        // Flat 3D array: [NUM_BANKS][RESOLUTION][CROSSINGS * 2]
        sincTables.resize(NUM_BANKS * RESOLUTION * (CROSSINGS * 2));
        double I0_BETA = besselI0(BETA);

        for (int bank = 0; bank < NUM_BANKS; bank++) {
            double stretch = 1.0 + (bank / (double)(NUM_BANKS - 1)) * (MAX_PITCH - 1.0);
            int bankOffset = bank * RESOLUTION * (CROSSINGS * 2);

            // To guarantee 0 dB gain at DC and prevent "hot" volume or amplitude modulation,
            // we calculate and normalize the exact weights for every specific fractional offset.
            for (int r = 0; r < RESOLUTION; r++) {
                double fracOffset = (double)r / RESOLUTION;
                double sumWeights = 0.0;
                
                int phaseOffset = bankOffset + r * (CROSSINGS * 2);

                // First pass: compute unnormalized weights and sum them
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
                
                // Second pass: normalize exactly to 1.0 and place into 2D polyphase structure
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
                
                // Load contiguous pre-computed weights and interpolate the phase
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
