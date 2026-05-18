#include <emscripten.h>
#include <wasm_simd128.h>

extern "C" {

EMSCRIPTEN_KEEPALIVE
int test_simd() {
    v128_t a = wasm_f32x4_splat(1.0f);
    v128_t b = wasm_f32x4_splat(2.0f);
    v128_t c = wasm_f32x4_add(a, b);
    return (int)wasm_f32x4_extract_lane(c, 0); // Should return 3
}

}
