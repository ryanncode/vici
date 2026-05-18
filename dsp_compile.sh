#!/bin/bash
curl -X POST "https://faustservice.grame.fr/file/json" -F "file=@src/audio/engine.dsp" > public/faust/dsp-meta.json
curl -X POST "https://faustservice.grame.fr/file/wasm" -F "file=@src/audio/engine.dsp" > public/faust/dsp-module.wasm
