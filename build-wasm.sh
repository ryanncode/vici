#!/bin/bash
set -e

# Load emsdk environment if emcc is not available
if ! command -v emcc &> /dev/null; then
  if [ -f "./emsdk/emsdk_env.sh" ]; then
    source "./emsdk/emsdk_env.sh"
  else
    echo "emcc not found. Please install Emscripten or run this script in an environment with emcc available."
    exit 1
  fi
fi

echo "Building WASM module..."

mkdir -p public/worklets/wasm

# Emscripten flags
# -msimd128: Enable SIMD128 instructions
# -mrelaxed-simd: Enable Relaxed SIMD instructions (FMA)
# -O3: Aggressive optimization
# -s EXPORT_ES6=1 -s MODULARIZE=1: Modern module output
# -s MAXIMUM_MEMORY=4GB -s MEMORY64=1 (Optional, sticking to standard memory for now to avoid broad compatibility issues unless required)
# -s ENVIRONMENT=worker: Target WebWorker/AudioWorklet

emcc src/wasm/resampler.cpp \
  -Isrc/wasm/bungee \
  -Lsrc/wasm/bungee/build \
  -lbungee -lpffft \
  -O3 \
  -msimd128 \
  -s EXPORT_ES6=1 \
  -s MODULARIZE=1 \
  -s SINGLE_FILE=1 \
  -s ENVIRONMENT=worklet,worker \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS="['_malloc', '_free']" \
  -s EXPORTED_RUNTIME_METHODS="['wasmMemory', 'HEAPF32']" \
  --bind \
  -o public/worklets/wasm/audio-processor.js

echo "WASM build complete!"

echo "Bundling AudioWorklet..."
npx esbuild public/worklets/track-processor.js --bundle --outfile=public/worklets/track-processor.bundle.js --format=esm
echo "AudioWorklet bundled successfully!"
