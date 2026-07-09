// public/worklets/wasm/audio-processor.js
async function Module(moduleArg = {}) {
  var moduleRtn;
  var Module2 = moduleArg;
  var ENVIRONMENT_IS_AUDIO_WORKLET = !!globalThis.AudioWorkletGlobalScope;
  var ENVIRONMENT_IS_WEB = !!globalThis.window;
  var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
  var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != "renderer";
  var arguments_ = [];
  var thisProgram = "./this.program";
  var _scriptName = import.meta.url;
  var scriptDirectory = "";
  var readAsync, readBinary;
  if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
      scriptDirectory = new URL(".", _scriptName).href;
    } catch {
    }
    {
      if (ENVIRONMENT_IS_WORKER) {
        readBinary = (url) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.responseType = "arraybuffer";
          xhr.send(null);
          return new Uint8Array(xhr.response);
        };
      }
      readAsync = async (url) => {
        var response = await fetch(url, { credentials: "same-origin" });
        if (response.ok) {
          return response.arrayBuffer();
        }
        throw new Error(response.status + " : " + response.url);
      };
    }
  } else {
  }
  var out = console.log.bind(console);
  var err = console.error.bind(console);
  var wasmBinary;
  var ABORT = false;
  class EmscriptenEH {
  }
  class EmscriptenSjLj extends EmscriptenEH {
  }
  function binaryDecode(bin) {
    for (var i = 0, l = bin.length, o = new Uint8Array(l), c; i < l; ++i) {
      c = bin.charCodeAt(i);
      o[i] = ~c >> 8 & c;
    }
    return o;
  }
  var readyPromiseResolve, readyPromiseReject;
  var runtimeInitialized = false;
  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    HEAP8 = new Int8Array(b);
    HEAP16 = new Int16Array(b);
    HEAPU8 = new Uint8Array(b);
    HEAPU16 = new Uint16Array(b);
    HEAP32 = new Int32Array(b);
    HEAPU32 = new Uint32Array(b);
    Module2["HEAPF32"] = HEAPF32 = new Float32Array(b);
    HEAPF64 = new Float64Array(b);
    HEAP64 = new BigInt64Array(b);
    HEAPU64 = new BigUint64Array(b);
  }
  function preRun() {
    if (Module2["preRun"]) {
      if (typeof Module2["preRun"] == "function") Module2["preRun"] = [Module2["preRun"]];
      while (Module2["preRun"].length) {
        addOnPreRun(Module2["preRun"].shift());
      }
    }
    callRuntimeCallbacks(onPreRuns);
  }
  function initRuntime() {
    runtimeInitialized = true;
    wasmExports["q"]();
  }
  function postRun() {
    if (Module2["postRun"]) {
      if (typeof Module2["postRun"] == "function") Module2["postRun"] = [Module2["postRun"]];
      while (Module2["postRun"].length) {
        addOnPostRun(Module2["postRun"].shift());
      }
    }
    callRuntimeCallbacks(onPostRuns);
  }
  function abort(what) {
    Module2["onAbort"]?.(what);
    what = `Aborted(${what})`;
    err(what);
    ABORT = true;
    what += ". Build with -sASSERTIONS for more info.";
    var e = new WebAssembly.RuntimeError(what);
    readyPromiseReject?.(e);
    throw e;
  }
  var wasmBinaryFile;
  function findWasmBinary() {
    return binaryDecode('\0asm\0\0\0\xB5`\x7F\x7F`\x7F\0`\0\0`\x7F\x7F\x7F\x7F\0`\x7F\x7F\x7F\0`\x7F\x7F\x7F\x7F\x7F\x7F\0`\x7F\x7F\x7F\x7F\x7F\0`\x7F\x7F\0`\x7F\x7F\x7F\x7F`\x7F\x7F\x7F`\x7F\x7F\x7F\x7F\x7F}\x7F`\0\x7F`\x07\x7F\x7F\x7F\x7F\x7F}}\x7F`\n\x7F\x7F\x7F\x7F\x7F\x7F\x7F\x7F\x7F\x7F\0`\x7F\x7F\x7F~~\0`\r\x7F\x7F\x7F\x7F\x7F\x7F\x7F\x7F\x7F\x7F\x7F\x7F\x7F\0`||\x7F|`|||`|\x7F|`||`}}`|\x7F\x7F`\x07\x7F\x7F\x7F\x7F\x7F\x7F}\x7F`\b\x7F\x7F\x7F\x7F\x7F\x7F}}\x7F[aa\0ab\0ac\0\rad\0ae\0af\0ag\0ah\0ai\0aj\0\x07ak\0al\0\x07am\0an\0\0ao\0:9	\0\b\0\x07\0\x07\0	\0\0\0\n\0\0\v\b\b\0\b\0\0\f\0	\0p**\x07\x82\x80\x80\b\x7FA\x90\xBB\v\x07p\0q\0Gr\0s\0>t\0u\0	/\0A\v)?=;5/.-FEDCBA@#,)#""<:249368710\f\n\xFF\xAD9\xDF\v\b\x7F@ \0E\r\0 \0A\bk" \0Ak(\0"Axq"\0j!@ Aq\r\0 AqE\r  (\0"k"A\xA07(\0I\r \0 j!\0@@@A\xA47(\0 G@ (\f! A\xFFM@  (\b"G\rA\x907A\x907(\0A~ Avwq6\0\f\v (!\x07  G@ (\b" 6\f  6\b\f\v ("\x7F Aj ("E\r Aj\v!@ ! "Aj! ("\r\0 Aj! ("\r\0\v A\x006\0\f\v ("AqAG\rA\x987 \x006\0  A~q6  \0Ar6  \x006\0\v  6\f  6\b\f\vA\0!\v \x07E\r\0@ ("At"(\xC09 F@ A\xC09j 6\0 \rA\x947A\x947(\0A~ wq6\0\f\v@  \x07(F@ \x07 6\f\v \x07 6\v E\r\v  \x076 ("@  6  6\v ("E\r\0  6  6\v  O\r\0 ("AqE\r\0@@@@ AqE@A\xA87(\0 F@A\xA87 6\0A\x9C7A\x9C7(\0 \0j"\x006\0  \0Ar6 A\xA47(\0G\rA\x987A\x006\0A\xA47A\x006\0\vA\xA47(\0"\x07 F@A\xA47 6\0A\x987A\x987(\0 \0j"\x006\0  \0Ar6 \0 j \x006\0\v Axq \0j!\0 (\f! A\xFFM@ (\b" F@A\x907A\x907(\0A~ Avwq6\0\f\v  6\f  6\b\f\v (!\b  G@ (\b" 6\f  6\b\f\v ("\x7F Aj ("E\r Aj\v!@ ! "Aj! ("\r\0 Aj! ("\r\0\v A\x006\0\f\v  A~q6  \0Ar6 \0 j \x006\0\f\vA\0!\v \bE\r\0@ ("At"(\xC09 F@ A\xC09j 6\0 \rA\x947A\x947(\0A~ wq6\0\f\v@  \b(F@ \b 6\f\v \b 6\v E\r\v  \b6 ("@  6  6\v ("E\r\0  6  6\v  \0Ar6 \0 j \x006\0  \x07G\r\0A\x987 \x006\0\v \0A\xFFM@ \0A\xF8qA\xB87j!\x7FA\x907(\0"A \0Avt"\0qE@A\x907 \0 r6\0 \f\v (\b\v!\0  6\b \0 6\f  6\f  \x006\b\vA! \0A\xFF\xFF\xFF\x07M@ \0A& \0A\bvg"kvAq AtrA>s!\v  6 B\x007 AtA\xC09j!\x7F@\x7FA\x947(\0"A t"qE@A\x947  r6\0  6\0A!A\b\f\v \0A AvkA\0 AG\x1Bt! (\0!@ "(Axq \0F\r Av! At!  Aqj"("\r\0\v  6A! !A\b\v!\0 "\f\v (\b" 6\f  6\bA!\0A\b!A\0\v!  j 6\0  6\f \0 j 6\0A\xB07A\xB07(\0Ak"\0A\x7F \0\x1B6\0\v\v\x96\x7F#\0A@j"$\0 \0 \0(\0"A\bk(\0"j!@ Ak(\0"( (F@A\0  \x1B!\0\f\v \0 N@ B\x007 A\x006  6\f  \x006\b  6 B\x007 B\x007$ B\x007, A\x006< B\x81\x80\x80\x80\x80\x80\x80\x8074  Aj  AA\0 (\0(\0 (\r\v B\x007 A\x006 A\xB0/6\f  \x006\b  6 B\x007 B\x007$ B\x007, B\x007\x003 A\x006< A:\0;  Aj AA\0 (\0(\0A\0!\0@@ ((\0\v (A\0 ($AF\x1BA\0 ( AF\x1BA\0 (,AF\x1B!\0\f\v (AG@ (,\r ( AG\r ($AG\r\v (!\0\v A@k$\0 \0\v;\x7FA \0 \0AM\x1B!@@ "\0\r\0A\x80;(\0"E\r\0 \0\f\v\v \0E@%\0\v \0\v\xEB	\x7F}{  \0(\b" \0("kAuM@ \0 \x7F  At"j!\0 *\0!\f@@ Ak"A\fI@ !\f\v  AvAj"A\xFC\xFF\xFF\xFF\x07q"Atj! \f\xFD!\rA\0!@  Atj \r\xFD\v\0 Aj" G\r\0\v  F\r\v@  \f8\0 Aj" \0G\r\0\v\v \0 \v6\v@  \0(\0"k"Au"	 j"A\x80\x80\x80\x80I@A\xFF\xFF\xFF\xFF  k"Au"\x07   \x07I\x1B A\xFC\xFF\xFF\xFF\x07O\x1B"\x7F A\x80\x80\x80\x80O\r AtA\0\v"\n j" At"\bj!\x07 *\0!\f !@ \bAk"A\fO@  AvAj"\vA\xFC\xFF\xFF\xFF\x07q"\bAtj! \f\xFD!\rA\0!@  Atj \r\xFD\v\0 Aj" \bG\r\0\v \b \vF\r\v@  \f8\0 Aj" \x07G\r\0\v\v  	Atk! @   \xFC\n\0\0\v \0 \n Atj6\b \0 \x076 \0 6\0 @ \v\v+\0\v*\0\vt\x7F E@ \0( (F\v \0 F@A\v ("-\0\0!@ \0("-\0\0"\0E\r\0 \0 G\r\0@ -\0! -\0"\0E\r Aj! Aj! \0 F\r\0\v\v \0 F\vT\x7F~@A\xF46(\0"\xAD \0\xADB\x07|B\xF8\xFF\xFF\xFF\x83|"B\xFF\xFF\xFF\xFFX@ \xA7"\0?\0AtM\r \0\r\r\vA\x8C7A06\0A\x7F\vA\xF46 \x006\0 \v\x83\x07\x7F  \0(\b" \0("kAuM@ \0 \x7F At"\0@ A\0 \0\xFC\v\0\v \0 j \v6\v@  \0(\0"k"Au" j"A\x80\x80\x80\x80I@A\xFF\xFF\xFF\xFF  k"Au"\b   \bI\x1B A\xFC\xFF\xFF\xFF\x07O\x1B"@ A\x80\x80\x80\x80O\r At!\x07\v  \x07j! At"@ A\0 \xFC\v\0\v  Atk! @   \xFC\n\0\0\v \0 \x07 Atj6\b \0  j6 \0 6\0 @ \v\v+\0\v*\0\v\0 \0\v\x99| \0 \0\xA2"  \xA2\xA2 D|\xD5\xCFZ:\xD9\xE5=\xA2D\xEB\x9C+\x8A\xE6\xE5Z\xBE\xA0\xA2  D}\xFE\xB1W\xE3\xC7>\xA2D\xD5a\xC1\xA0*\xBF\xA0\xA2D\xA6\xF8\x81?\xA0\xA0! \0 \xA2! E@   \xA2DIUUUUU\xC5\xBF\xA0\xA2 \0\xA0\v \0  D\0\0\0\0\0\0\xE0?\xA2  \xA2\xA1\xA2 \xA1 DIUUUUU\xC5?\xA2\xA0\xA1\v\x92|D\0\0\0\0\0\0\xF0? \0 \0\xA2"D\0\0\0\0\0\0\xE0?\xA2"\xA1"D\0\0\0\0\0\0\xF0? \xA1 \xA1    D\x90\xCB\xA0\xFA>\xA2DwQ\xC1l\xC1V\xBF\xA0\xA2DLUUUUU\xA5?\xA0\xA2  \xA2" \xA2  D\xD48\x88\xBE\xE9\xFA\xA8\xBD\xA2D\xC4\xB1\xB4\xBD\x9E\xEE!>\xA0\xA2D\xADR\x9C\x80O~\x92\xBE\xA0\xA2\xA0\xA2 \0 \xA2\xA1\xA0\xA0\v\xC1\'\v\x7F#\0Ak"\n$\0@@@@@@@@@@ \0A\xF4M@A\x907(\0"A \0A\vjA\xF8q \0A\vI\x1B"Av"\0v"Aq@@ A\x7FsAq \0j"At"A\xB87j"\0 (\xC07"(\b"F@A\x907 A~ wq6\0\f\v  \x006\f \0 6\b\v A\bj!\0  Ar6  j" (Ar6\f\v\v A\x987(\0"\bM\r @@A \0t"A\0 kr  \0tqh"At"A\xB87j" (\xC07"\0(\b"F@A\x907 A~ wq"6\0\f\v  6\f  6\b\v \0 Ar6 \0 j"\x07  k"Ar6 \0 j 6\0 \b@ \bAxqA\xB87j!A\xA47(\0!\x7F A \bAvt"qE@A\x907  r6\0 \f\v (\b\v!  6\b  6\f  6\f  6\b\v \0A\bj!\0A\xA47 \x076\0A\x987 6\0\f\v\vA\x947(\0"\vE\r \vhAt(\xC09"(Axq k! !@@ ("\0E@ ("\0E\r\v \0(Axq k"   I"\x1B! \0  \x1B! \0!\f\v\v (!	  (\f"\0G@ (\b" \x006\f \0 6\b\f\n\v ("\x7F Aj ("E\r Aj\v!@ !\x07 "\0Aj! \0("\r\0 \0Aj! \0("\r\0\v \x07A\x006\0\f	\vA\x7F! \0A\xBF\x7FK\r\0 \0A\vj"Axq!A\x947(\0"\x07E\r\0A!\bA\0 k! \0A\xF4\xFF\xFF\x07M@ A& A\bvg"\0kvAq \0AtkA>j!\b\v@@@ \bAt(\xC09"E@A\0!\0\f\vA\0!\0 A \bAvkA\0 \bAG\x1Bt!@@ (Axq k" O\r\0 ! "\r\0A\0! !\0\f\v \0 ("   AvAqj("F\x1B \0 \x1B!\0 At! \r\0\v\v \0 rE@A\0!A \bt"\0A\0 \0kr \x07q"\0E\r \0hAt(\xC09!\0\v \0E\r\v@ \0(Axq k" I!   \x1B! \0  \x1B! \0("\x7F  \0(\v"\0\r\0\v\v E\r\0 A\x987(\0 kO\r\0 (!\b  (\f"\0G@ (\b" \x006\f \0 6\b\f\b\v ("\x7F Aj ("E\r Aj\v!@ ! "\0Aj! \0("\r\0 \0Aj! \0("\r\0\v A\x006\0\f\x07\v A\x987(\0"M@A\xA47(\0!\0@  k"AO@ \0 j" Ar6 \0 j 6\0 \0 Ar6\f\v \0 Ar6 \0 j" (Ar6A\0!A\0!\vA\x987 6\0A\xA47 6\0 \0A\bj!\0\f	\v A\x9C7(\0"I@A\x9C7  k"6\0A\xA87A\xA87(\0"\0 j"6\0  Ar6 \0 Ar6 \0A\bj!\0\f	\vA\0!\0 A/j"\x7FA\xE8:(\0@A\xF0:(\0\f\vA\xF4:B\x7F7\0A\xEC:B\x80\xA0\x80\x80\x80\x807\0A\xE8: \nA\fjApqA\xD8\xAA\xD5\xAAs6\0A\xFC:A\x006\0A\xCC:A\x006\0A\x80 \v"j"A\0 k"\x07q" M\r\bA\xC8:(\0"@A\xC0:(\0"\b j"	 \bM\r	  	I\r	\v@A\xCC:-\0\0AqE@@@@@A\xA87(\0"@A\xD0:!\0@ \0(\0"\b M@  \b \0(jI\r\v \0(\b"\0\r\0\v\vA\0"A\x7FF\r !A\xEC:(\0"\0Ak" q@  k  jA\0 \0kqj!\v  M\rA\xC8:(\0"\0@A\xC0:(\0" j"\x07 M\r \0 \x07I\r\v "\0 G\r\f\v  k \x07q"" \0(\0 \0(jF\r !\0\v \0A\x7FF\r A0j M@ \0!\f\vA\xF0:(\0"  kjA\0 kq"A\x7FF\r  j! \0!\f\v A\x7FG\r\vA\xCC:A\xCC:(\0Ar6\0\v !A\0!\0 A\x7FF\r \0A\x7FF\r \0 M\r \0 k" A(jM\r\vA\xC0:A\xC0:(\0 j"\x006\0A\xC4:(\0 \0I@A\xC4: \x006\0\v@A\xA87(\0"@A\xD0:!\0@  \0(\0" \0("jF\r \0(\b"\0\r\0\v\f\vA\xA07(\0"\0A\0 \0 M\x1BE@A\xA07 6\0\vA\0!\0A\xD4: 6\0A\xD0: 6\0A\xB07A\x7F6\0A\xB47A\xE8:(\x006\0A\xDC:A\x006\0@ \0At" A\xB87j"6\xC07  6\xC47 \0Aj"\0A G\r\0\vA\x9C7 A(k"\0Ax kA\x07q"k"6\0A\xA87  j"6\0  Ar6 \0 jA(6A\xAC7A\xF8:(\x006\0\f\v  M\r  K\r \0(\fA\bq\r \0  j6A\xA87 Ax kA\x07q"\0j"6\0A\x9C7A\x9C7(\0 j" \0k"\x006\0  \0Ar6  jA(6A\xAC7A\xF8:(\x006\0\f\vA\0!\0\f\vA\0!\0\f\vA\xA07(\0 K@A\xA07 6\0\v  j!A\xD0:!\0@@  \0(\0"G@ \0(\b"\0\r\f\v\v \0-\0\fA\bqE\r\vA\xD0:!\0@@ \0(\0" M@   \0(j"I\r\v \0(\b!\0\f\v\vA\x9C7 A(k"\0Ax kA\x07q"k"\x076\0A\xA87  j"6\0  \x07Ar6 \0 jA(6A\xAC7A\xF8:(\x006\0  A\' kA\x07qjA/k"\0 \0 AjI\x1B"A\x1B6 A\xD8:)\x007 A\xD0:)\x007\bA\xD8: A\bj6\0A\xD4: 6\0A\xD0: 6\0A\xDC:A\x006\0 Aj!\0@ \0A\x076 \0A\bj \0Aj!\0 I\r\0\v  F\r\0  (A~q6   k"Ar6  6\0\x7F A\xFFM@ A\xF8qA\xB87j!\0\x7FA\x907(\0"A Avt"qE@A\x907  r6\0 \0\f\v \0(\b\v! \0 6\b  6\fA\f!A\b\f\vA!\0 A\xFF\xFF\xFF\x07M@ A& A\bvg"\0kvAq \0AtrA>s!\0\v  \x006 B\x007 \0AtA\xC09j!@@A\x947(\0"A \0t"qE@A\x947  r6\0  6\0\f\v A \0AvkA\0 \0AG\x1Bt!\0 (\0!@ "(Axq F\r \0Av! \0At!\0  Aqj"("\r\0\v  6\v  6A\b! "!\0A\f\f\v (\b"\0 6\f  6\b  \x006\bA\0!\0A!A\f\v j 6\0  j \x006\0\vA\x9C7(\0"\0 M\r\0A\x9C7 \0 k"6\0A\xA87A\xA87(\0"\0 j"6\0  Ar6 \0 Ar6 \0A\bj!\0\f\vA\x8C7A06\0A\0!\0\f\v \0 6\0 \0 \0( j6 Ax kA\x07qj"\b Ar6 Ax kA\x07qj"  \bj"k!\x07@A\xA87(\0 F@A\xA87 6\0A\x9C7A\x9C7(\0 \x07j"\x006\0  \0Ar6\f\vA\xA47(\0 F@A\xA47 6\0A\x987A\x987(\0 \x07j"\x006\0  \0Ar6 \0 j \x006\0\f\v ("\0AqAF@ \0Axq!	 (\f!@ \0A\xFFM@ (\b" F@A\x907A\x907(\0A~ \0Avwq6\0\f\v  6\f  6\b\f\v (!@  G@ (\b"\0 6\f  \x006\b\f\v@ ("\0\x7F Aj ("\0E\r Aj\v!@ ! \0"Aj! \0("\0\r\0 Aj! ("\0\r\0\v A\x006\0\f\vA\0!\v E\r\0@ ("\0At"(\xC09 F@ A\xC09j 6\0 \rA\x947A\x947(\0A~ \0wq6\0\f\v@  (F@  6\f\v  6\v E\r\v  6 ("\0@  \x006 \0 6\v ("\0E\r\0  \x006 \0 6\v \x07 	j!\x07  	j"(!\0\v  \0A~q6  \x07Ar6  \x07j \x076\0 \x07A\xFFM@ \x07A\xF8qA\xB87j!\0\x7FA\x907(\0"A \x07Avt"qE@A\x907  r6\0 \0\f\v \0(\b\v! \0 6\b  6\f  \x006\f  6\b\f\vA! \x07A\xFF\xFF\xFF\x07M@ \x07A& \x07A\bvg"\0kvAq \0AtrA>s!\v  6 B\x007 AtA\xC09j!\0@@A\x947(\0"A t"qE@A\x947  r6\0 \0 6\0\f\v \x07A AvkA\0 AG\x1Bt! \0(\0!@ "\0(Axq \x07F\r Av! At! \0 Aqj"("\r\0\v  6\v  \x006  6\f  6\b\f\v \0(\b" 6\f \0 6\b A\x006  \x006\f  6\b\v \bA\bj!\0\f\v@ \bE\r\0@ ("At"(\xC09 F@ A\xC09j \x006\0 \0\rA\x947 \x07A~ wq"\x076\0\f\v@  \b(F@ \b \x006\f\v \b \x006\v \0E\r\v \0 \b6 ("@ \0 6  \x006\v ("E\r\0 \0 6  \x006\v@ AM@   j"\0Ar6 \0 j"\0 \0(Ar6\f\v  Ar6  j" Ar6  j 6\0 A\xFFM@ A\xF8qA\xB87j!\0\x7FA\x907(\0"A Avt"qE@A\x907  r6\0 \0\f\v \0(\b\v! \0 6\b  6\f  \x006\f  6\b\f\vA!\0 A\xFF\xFF\xFF\x07M@ A& A\bvg"\0kvAq \0AtrA>s!\0\v  \x006 B\x007 \0AtA\xC09j!@@ \x07A \0t"qE@A\x947  \x07r6\0  6\0  6\f\v A \0AvkA\0 \0AG\x1Bt!\0 (\0!@ "(Axq F\r \0Av! \0At!\0  Aqj"\x07("\r\0\v \x07 6  6\v  6\f  6\b\f\v (\b"\0 6\f  6\b A\x006  6\f  \x006\b\v A\bj!\0\f\v@ 	E\r\0@ ("At"(\xC09 F@ A\xC09j \x006\0 \0\rA\x947 \vA~ wq6\0\f\v@  	(F@ 	 \x006\f\v 	 \x006\v \0E\r\v \0 	6 ("@ \0 6  \x006\v ("E\r\0 \0 6  \x006\v@ AM@   j"\0Ar6 \0 j"\0 \0(Ar6\f\v  Ar6  j" Ar6  j 6\0 \b@ \bAxqA\xB87j!\0A\xA47(\0!\x7FA \bAvt"\x07 qE@A\x907  \x07r6\0 \0\f\v \0(\b\v! \0 6\b  6\f  \x006\f  6\b\vA\xA47 6\0A\x987 6\0\v A\bj!\0\v \nAj$\0 \0\v\xA8\0@ A\x80\bN@ \0D\0\0\0\0\0\0\xE0\x7F\xA2!\0 A\xFFI@ A\xFF\x07k!\f\v \0D\0\0\0\0\0\0\xE0\x7F\xA2!\0A\xFD  A\xFDO\x1BA\xFEk!\f\v A\x81xJ\r\0 \0D\0\0\0\0\0\0`\xA2!\0 A\xB8pK@ A\xC9\x07j!\f\v \0D\0\0\0\0\0\0`\xA2!\0A\xF0h  A\xF0hM\x1BA\x92j!\v \0 A\xFF\x07j\xADB4\x86\xBF\xA2\v\xBC|\x7F#\0Ak"$\0| \0\xBDB \x88\xA7A\xFF\xFF\xFF\xFF\x07q"A\xFB\xC3\xA4\xFFM@D\0\0\0\0\0\0\xF0? A\x9E\xC1\x9A\xF2I\r \0D\0\0\0\0\0\0\0\0\f\v \0 \0\xA1 A\x80\x80\xC0\xFF\x07O\r\0 \0 (! +\b!\0 +\0!@@@@ AqAk\0\v  \0\f\v  \0A\x9A\f\v  \0\x9A\f\v  \0A\v Aj$\0\v5\x7F  \0("Auj! \0(\0!\0  Aq\x7F (\0 \0j(\0 \0\v\0\v\v\0 \0 \0\v6\x7F \0A\x8066\0 \0("Ak" (\0Ak"6\0 A\0H@ A\fk\v \0\v\x9A\0 \0A:\x005@  \0(G\r\0 \0A:\x004@ \0("E@ \0A6$ \0 6 \0 6 AG\r \0(0AF\r\f\v  F@ \0("AF@ \0 6 !\v \0(0AG\r AF\r\f\v \0 \0($Aj6$\v \0A:\x006\v\vP\x7F@ E\r\0 A\xA41"E\r\0 (\b \0(\bA\x7Fsq\r\0 \0(\f( (\f(G\r\0 \0(( ((F!\v \vv\x7F \0($"E@ \0 6 \0 6 \0A6$ \0 \0(86\v@@ \0( \0(8G\r\0 \0( G\r\0 \0(AG\r \0 6\v \0A:\x006 \0A6 \0 Aj6$\v\v\0\v\0 \0\v\0 \0A\xD0\0jA\xD0\0j\v\0\f\0\v}\x7F@@ \0"AqE\r\0 -\0\0E@A\0\v@ Aj"AqE\r -\0\0\r\0\v\f\v@ "Aj!A\x80\x82\x84\b (\0"k rA\x80\x81\x82\x84xqA\x80\x81\x82\x84xF\r\0\v@ "Aj! -\0\0\r\0\v\v  \0k\v\x85}\x7F \0\xBC"AvA\xFFq"A\x95M} A\xFD\0M@ \0C\0\0\0\0\x94\v} \0\x8B"\0C\0\0\0K\x92C\0\0\0\xCB\x92 \0\x93"C\0\0\0?^@ \0 \x92C\0\0\x80\xBF\x92\f\v \0 \x92"\0 C\0\0\0\xBF_E\r\0 \0C\0\0\x80?\x92\v"\0\x8C \0 A\0H\x1B \0\v\v\xD2\x7F|~#\0A0k"	$\0@@@ \0\xBD"B \x88\xA7"A\xFF\xFF\xFF\xFF\x07q"A\xFA\xD4\xBD\x80M@ A\xFF\xFF?qA\xFB\xC3$F\r A\xFC\xB2\x8B\x80M@ B\0Y@  \0D\0\0@T\xFB!\xF9\xBF\xA0"\0D1cba\xB4\xD0\xBD\xA0"9\0  \0 \xA1D1cba\xB4\xD0\xBD\xA09\bA!\f\v  \0D\0\0@T\xFB!\xF9?\xA0"\0D1cba\xB4\xD0=\xA0"9\0  \0 \xA1D1cba\xB4\xD0=\xA09\bA\x7F!\f\v B\0Y@  \0D\0\0@T\xFB!	\xC0\xA0"\0D1cba\xB4\xE0\xBD\xA0"9\0  \0 \xA1D1cba\xB4\xE0\xBD\xA09\bA!\f\v  \0D\0\0@T\xFB!	@\xA0"\0D1cba\xB4\xE0=\xA0"9\0  \0 \xA1D1cba\xB4\xE0=\xA09\bA~!\f\v A\xBB\x8C\xF1\x80M@ A\xBC\xFB\xD7\x80M@ A\xFC\xB2\xCB\x80F\r B\0Y@  \0D\0\x000\x7F|\xD9\xC0\xA0"\0D\xCA\x94\x93\xA7\x91\xE9\xBD\xA0"9\0  \0 \xA1D\xCA\x94\x93\xA7\x91\xE9\xBD\xA09\bA!\f\v  \0D\0\x000\x7F|\xD9@\xA0"\0D\xCA\x94\x93\xA7\x91\xE9=\xA0"9\0  \0 \xA1D\xCA\x94\x93\xA7\x91\xE9=\xA09\bA}!\f\v A\xFB\xC3\xE4\x80F\r B\0Y@  \0D\0\0@T\xFB!\xC0\xA0"\0D1cba\xB4\xF0\xBD\xA0"9\0  \0 \xA1D1cba\xB4\xF0\xBD\xA09\bA!\f\v  \0D\0\0@T\xFB!@\xA0"\0D1cba\xB4\xF0=\xA0"9\0  \0 \xA1D1cba\xB4\xF0=\xA09\bA|!\f\v A\xFA\xC3\xE4\x89K\r\v \0D\x83\xC8\xC9m0_\xE4?\xA2D\0\0\0\0\0\x008C\xA0D\0\0\0\0\0\x008\xC3\xA0"\xFC!@ \0 D\0\0@T\xFB!\xF9\xBF\xA2\xA0" D1cba\xB4\xD0=\xA2"\xA1"D-DT\xFB!\xE9\xBFc@ Ak! D\0\0\0\0\0\0\xF0\xBF\xA0"D1cba\xB4\xD0=\xA2! \0 D\0\0@T\xFB!\xF9\xBF\xA2\xA0!\f\v D-DT\xFB!\xE9?dE\r\0 Aj! D\0\0\0\0\0\0\xF0?\xA0"D1cba\xB4\xD0=\xA2! \0 D\0\0@T\xFB!\xF9\xBF\xA2\xA0!\v   \xA1"\x009\0@ Av" \0\xBDB4\x88\xA7A\xFFqkAH\r\0   D\0\0`a\xB4\xD0=\xA2"\0\xA1" Dsp.\x8A\xA3;\xA2  \xA1 \0\xA1\xA1"\xA1"\x009\0  \0\xBDB4\x88\xA7A\xFFqkA2H@ !\f\v   D\0\0\0.\x8A\xA3;\xA2"\0\xA1" D\xC1I %\x9A\x83{9\xA2  \xA1 \0\xA1\xA1"\xA1"\x009\0\v   \0\xA1 \xA19\b\f\v A\x80\x80\xC0\xFF\x07O@  \0 \0\xA1"\x009\0  \x009\bA\0!\f\v 	Aj"A\br! B\xFF\xFF\xFF\xFF\xFF\xFF\xFF\x07\x83B\x80\x80\x80\x80\x80\x80\x80\xB0\xC1\0\x84\xBF!\0A!@  \0\xFC\xB7"9\0 \0 \xA1D\0\0\0\0\0\0pA\xA2!\0 A\0! !\r\0\v 	 \x009 A!@ "Ak! 	Aj"\r Atj+\0D\0\0\0\0\0\0\0\0a\r\0\vA\0!#\0A\xB0k"$\0 AvA\x96\bk"AkAm"\bA\0 \bA\0J\x1B"\x07Ahl j!\vA\x94(\0"\b Aj"Ak"\njA\0N@ \b j! \x07 \nk!@ A\xC0j Atj A\0H|D\0\0\0\0\0\0\0\0 At(\xA0\xB7\v9\0 Aj! Aj" G\r\0\v\v \vAk!A\0! \bA\0 \bA\0J\x1B! A\0L!\f@@ \f@D\0\0\0\0\0\0\0\0!\0\f\v  \nj!A\0!D\0\0\0\0\0\0\0\0!\0@ \r Atj+\0 A\xC0j  kAtj+\0\xA2 \0\xA0!\0 Aj" G\r\0\v\v  Atj \x009\0  F Aj!E\r\0\vA/ \vk!A0 \vk! \x07AtA\xA0j! \b!@@  Atj+\0!\0A\0! ! A\0J@@ A\xE0j Atj \0D\0\0\0\0\0\0p>\xA2\xFC\xB7"D\0\0\0\0\0\0p\xC1\xA2 \0\xA0\xFC6\0  AtjA\bk+\0 \xA0!\0 Ak! Aj" G\r\0\v\v \0 "\0 \0D\0\0\0\0\0\0\xC0?\xA2\x9CD\0\0\0\0\0\0 \xC0\xA2\xA0"\0 \0\xFC"\f\xB7\xA1!\0@@@\x7F A\0L"E@ At j" (\xDC"  u" tk"6\xDC  \fj!\f  u\f\v \r At j(\xDCAu\v"\nA\0L\r\f\vA!\n \0D\0\0\0\0\0\0\xE0?f\r\0A\0!\n\f\vA\0!A\0!\x07A! A\0J@@ A\xE0j Atj"(\0!\x7F@  \x07\x7FA\xFF\xFF\xFF\x07 E\rA\x80\x80\x80\b\v k6\0A!\x07A\0\f\vA\0!\x07A\v! Aj" G\r\0\v\v@ \r\0A\xFF\xFF\xFF!@@ Ak\0\vA\xFF\xFF\xFF!\v At j"\x07 \x07(\xDC q6\xDC\v \fAj!\f \nAG\r\0D\0\0\0\0\0\0\xF0? \0\xA1!\0A!\n \r\0 \0D\0\0\0\0\0\0\xF0? \xA1!\0\v \0D\0\0\0\0\0\0\0\0a@A\0! !@  \bL\r\0@ A\xE0j Ak"Atj(\0 r!  \bJ\r\0\v E\r\0@ Ak! A\xE0j Ak"Atj(\0E\r\0\v\f\vA!@ "Aj! A\xE0j \b kAtj(\0E\r\0\v  j!@ A\xC0j  j"\x07Atj  Aj"Atj(\0\xB79\0A\0!D\0\0\0\0\0\0\0\0!\0 A\0J@@ \r Atj+\0 A\xC0j \x07 kAtj+\0\xA2 \0\xA0!\0 Aj" G\r\0\v\v  Atj \x009\0  H\r\0\v !\f\v\v@ \0A \vk"\0D\0\0\0\0\0\0pAf@ A\xE0j Atj \0D\0\0\0\0\0\0p>\xA2\xFC"\xB7D\0\0\0\0\0\0p\xC1\xA2 \0\xA0\xFC6\0 Aj! \v!\f\v \0\xFC!\v A\xE0j Atj 6\0\vD\0\0\0\0\0\0\xF0? !\0 A\0N@ !@  "Atj \0 A\xE0j Atj(\0\xB7\xA29\0 Ak! \0D\0\0\0\0\0\0p>\xA2!\0 \r\0\v !\x07@@ \b  \x07k"  \bJ\x1B"A\0H@D\0\0\0\0\0\0\0\0!\0\f\v  \x07Atj!\vA\0!D\0\0\0\0\0\0\0\0!\0@ At"\r+\xF0. \v \rj+\0\xA2 \0\xA0!\0  G Aj!\r\0\v\v A\xA0j Atj \x009\0 \x07A\0J \x07Ak!\x07\r\0\v\vD\0\0\0\0\0\0\0\0!\0 A\0N@ !@ "Ak! \0 A\xA0j Atj+\0\xA0!\0 \r\0\v\v 	 \0\x9A \0 \n\x1B9\0 +\xA0 \0\xA1!\0A! A\0J@@ \0 A\xA0j Atj+\0\xA0!\0  G Aj!\r\0\v\v 	 \0\x9A \0 \n\x1B9\b A\xB0j$\0 \fA\x07q! 	+\0!\0 B\0S@  \0\x9A9\0  	+\b\x9A9\bA\0 k!\f\v  \x009\0  	+\b9\b\v 	A0j$\0 \v\xDA\0A\xB02A\xBB\n\vA\xC02A\xAF	AA\0\nA\xCC2A\xDC\bAA\x80\x7FA\xFF\0A\xE42A\xD5\bAA\x80\x7FA\xFF\0A\xD82A\xD3\bAA\0A\xFFA\xF02A\x89\bAA\x80\x80~A\xFF\xFFA\xFC2A\x80\bAA\0A\xFF\xFFA\x883A\x98\bAA\x80\x80\x80\x80xA\xFF\xFF\xFF\xFF\x07A\x943A\x8F\bAA\0A\x7FA\xA03A\xE5	AA\x80\x80\x80\x80xA\xFF\xFF\xFF\xFF\x07A\xAC3A\xDC	AA\0A\x7FA\xB83A\xD2	A\bB\x80\x80\x80\x80\x80\x80\x80\x80\x80\x7FB\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\0A\xC43A\xC9	A\bB\0B\x7FA\xD03A\xA2\bAA\xDC3A\xA1\nA\bA\xD8A\xF7		A\xA0AA\xEA	A\xE8AA\x83\nA\xB4AA\x92\nA\xBCA\x80A\0A\x97\0A\xA8A\0A\xDC\0A\xD0AA\xB5\0A\xF8AA\xE4\n\0A\xA0AA\x83\v\0A\xC8AA\xAB\v\0A\xF0AA\xC8\v\0A\x98AA\x81\0A\xC0AA\x9F\0A\xA8A\0A\xAE\f\0A\xD0AA\x8D\f\0A\xF8AA\xF0\f\0A\xA0AA\xCE\f\0A\xC8AA\xF6\r\0A\xF0AA\xD4\r\0A\xE8A\bA\xB3\r\0A\x90A	A\x91\r\0A\xB8AA\xEE\v\0A\xE0A\x07A\xC6\0\v\x7FA$"\0A\x9056\0 \0A\xD05A\0\vf\x7FA\b$"A\x8066\0A\xB2\b&"A\rj"\0A\x006\b \0 6 \0 6\0 \0A\fj!\0 Aj"@ \0A\xB2\b \xFC\n\0\0\v  \x006 A\xB066\0 A\xBC6A\0\v\x9E\x7FA\xE8A\xFCA\x98A\0A\xB5AA\xB8A\0A\xB8A\0A\xB9\bA\xBAA\bA\xE8AA\xC0A\xC4AA\x07A\b"\0A\x006 \0A6\0A\xE8A\x9C\bAA\xC8A\xD0A \0A\0A\0A\0A\b"\0A\x006 \0A\x076\0A\xE8A\xA8\nA\x07A\xE0A\xFCA\b \0A\0A\0A\0A\x88A\xA4A\xC8A\0A\xECA	A\xB8A\0A\xB8A\0A\xC3\bA\xEFA\n\bA\x88AA\xF4A\xFCA\vA\f\x07A\b"\0A\x006 \0A\r6\0A\x88A\x9C\bAA\x80A\x88A \0A\0A\0A\0A\b"\0A\x006 \0A6\0A\x88A\xA1	A\bA\x90A\xB0A \0A\0A\0A\0\v?\x7F  \0("\x07Auj! \0(\0!\0       \x07Aq\x7F (\0 \0j(\0 \0\v\n\0\v\xA6\n\x7F}{ A\0L@A\0\v C\0\0\x80? C\0\0\x80?^\x1BC\0\0\x80\xBF\x92C\0\0|B\x94\'! \0(\0A? \xFC\0"A\0 A\0J\x1B" A?N\x1BAtj"\vA\x80j!\f \0*\f!A !\b@C\0\0\x80? C\0\0\0D\x94" \xFC\0"\xB2\x93"\x93! \fA\xFE  A\xFEN\x1BA\btj!\r \v A\btj!A`!\xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0!A\0!\n@  \r \nAt"\x07j"*\x94! \x07 j"\x07* \x94  *\0\x94! \x07*\0 \x94!{\xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0 "\x07 \bj"A\0H\r\0\xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0  L\r\0  Atj\xFD]\0\v! \x92!  \x92!C\0\0\0\0!@ A\x7FH@C\0\0\0\0!\f\vC\0\0\0\0! Aj" N\r\0  Atj"*! *\0!\v  \xFD \xFD  \xFD   \xFD  \xFD \xFD\xE6\xFD\xE4! \nAj!\n \x07Aj! \x07AH\r\0\v  	Atj   \xFD\r\b	\n\v\f\r\0\0\xFD\xE4\xFD[\0\0 \0  \0*\f\x92" \xFC\0"\xB2\x93"8\f  \bj!\b 	Aj"	 G\r\0\v \bA k\v	\0 \0A\x006\f\v\x07\0 \0(\v\0A\xB4	\v\0 \0 (\b @    \v\v7\0 \0 (\b @    \v \0(\b"\0      \0(\0(\0\v\xA4\0@ \0 (\b @  (G\r (AF\r  6\v \0 (\0 E\r\0@ ( G@  (G\r\v AG\r A6 \v  6  6   ((Aj6(@ ($AG\r\0 (AG\r\0 A:\x006\v A6,\v\v\x9E\v\b|	\x7F{A"\xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\xFD\v\0 A\x80\x80\x80@ At!D\0\0\0\0\0\0\xF0? \xB8D\0\0\0\0\0\x80O@\xA3D\0\0\0\0\0\0\xF0?\xA0"\xA3!A\0!\f@A\0!	A\x80"\vA\0A\x80\xFC\v\0 \f\xB8D\0\0\0\0\0\0`?\xA2!A`!\bD\0\0\0\0\0\0\0\0!@@ \b\xB7 \xA1\x99 \xA3"D\0\0\0\0\0\0\0\0a@ \v 	Atj 9\0  \xA0!\f\v D\0\0\0\0\0\0@@cE\r\0#\0Ak"\n$\0@ D-DT\xFB!	@\xA2"\x07"\0\xBDB \x88\xA7A\xFF\xFF\xFF\xFF\x07q"\rA\xFB\xC3\xA4\xFFM@ \rA\x80\x80\xC0\xF2I\r \0D\0\0\0\0\0\0\0\0A\0!\0\f\v \rA\x80\x80\xC0\xFF\x07O@ \0 \0\xA1!\0\f\v \0 \n(!\r \n+\b!\0 \n+\0!@@@@ \rAqAk\0\v  \0A!\0\f\v  \0!\0\f\v  \0A\x9A!\0\f\v  \0\x9A!\0\v \nAj$\0 \v 	Atj \0 \x07\xA3@D\0\0\0\0\0\0\xF0? D\0\0\0\0\0\0\xA0?\xA2"\0 \0\xA2\xA1\x9FD\0\0\0\0\0\0"@\xA2"\0 \0\xA2D\0\0\0\0\0\0\xD0?\xA2" D\0\0\0\0\0\0\xF0?\xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\0\xD0?\xA2\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\0"@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\0\xB0?\xA2\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\x009@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\0B@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\x80H@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\0\x90?\xA2\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0@T@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\0Y@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0@^@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\0b@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0 e@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\x80h@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0 l@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\0p?\xA2\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0r@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0@t@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0  D\0\0\0\0\0\x90v@\xA3\xA2" \0 \xA0"\0D\xEA-\x81\x99\x97q=\xA2c\r\0 \0  D\0\0\0\0\0\0y@\xA3\xA2\xA0!\0\v \0D\xD2\xE2\x9AyZ\x91@\xA3\xA2 \xA3"\x009\0  \0\xA0!\v \bAj!\b 	Aj"	A\xC0\0G\r\0\v D\0\0\0\0\0\0\0\0d@ (\0 j \fA\btj!	 \xFD!A\0!\b@ 	 \bAtj \v \bAtj\xFD\0\0 \xFD\xF3"\xFD!\0\xB6\xFD \xFD!\xB6\xFD \xFD[\0\0 	 \bAr"\nAtj \v \nAtj\xFD\0\0 \xFD\xF3"\xFD!\0\xB6\xFD \xFD!\xB6\xFD \xFD[\0\0 \bAj"\bA\xC0\0G\r\0\v\v \v \fAj"\fA\x80G\r\0\v Aj"A\xC0\0G\r\0\v \v\x88\0@ \0 (\b @  (G\r (AF\r  6\v \0 (\0 @@ ( G@  (G\r\v AG\r A6 \v  6 @ (,AF\r\0 A\0;4 \0(\b"\0   A  \0(\0(\0 -\x005AF@ A6, -\x004E\r\f\v A6,\v  6  ((Aj6( ($AG\r (AG\r A:\x006\v \0(\b"\0     \0(\0(\0\v\v\xBE\x7F#\0A@j"$\0@@@ (A\xBA2F@ A\x006\0\f\v@ \0  \0-\0\bAq\x7FA E\r A\x900"E\r -\0\bAqA\0G\v!\v @A! (\0"\0E\r  \0(\x006\0\f\v A\xC00"E\rA\0! (\0"@  (\0"6\0\v (\b"\x07 \0(\b"A\x7FsqA\x07q\r \x07A\x7Fs qA\xE0\0q\r \0(\f"\x07(" (\f"\0(G\r\vA!\f\v A\xB82F@ \0A\xF00E!\f\vA\0! \x07A\xC00"@ AqE\r\x7F !A\0!@@A\0 \0E\r \0A\xC00"\0E\r \0(\b (\b"A\x7Fsq\rA (\f"( \0(\f"\0(F\r AqE\r A\xC00"\r\0\v A\xA41"E\r\0  \0 !\v \v!\f\v \x07A\xA41"@ AqE\r  \0 !\f\v \x07A\xE0/"E\r\0 \0A\xE0/"\0E\r\0 A\bjA\0A8\xFC\v\0  A\0G:\0; A\x7F6  6\f  \x006 A64 \0 Aj A \0(\0(\0 ("\0AF@  (A\0 \x1B6\0\v \0AF!\v A@k$\0 \v4\0 \0( (\b(F@   !\v \0(\b"\0    \0(\0(\0\v\x1B\0 \0( (\b(F@   !\v\v\xC2\x7F#\0A\xD0\0k"$\0@\x7FA \0( (F\r\0A\0 A\xE0/"E\r\0 (\0"E\r AjA\0A8\xFC\v\0 A:\0K A\x7F6   \x006  6 A6D  Aj A (\0(\0 (,"\0AF@  ($6\0\v \0AF\v A\xD0\0j$\0\v A\xC0\n6\b A\xE76 A\xE1\b6\0%\0\v\x07\0 \0\v\0\v\r\0 \0( (F\v(\x7F \0@ \0(\0"@ \0 6 \0(\b \v \0\v\v\xA7\x7F \0("&Aj""\0\x7F\x7F A\x80O@ @ \0  \xFC\n\0\0\v \0\f\v \0 j!@ \0 sAqE@@ \0AqE@ \0!\f\v E@ \0!\f\v \0!@  -\0\0:\0\0 Aj! Aj"AqE\r  I\r\0\v\v A|q!@ A\xC0\0I\r\0  A@j"K\r\0@  (\x006\0  (6  (\b6\b  (\f6\f  (6  (6  (6  (6  ( 6   ($6$  ((6(  (,6,  (060  (464  (868  (<6< A@k! A@k" M\r\0\v\v  O\r@  (\x006\0 Aj! Aj" I\r\0\v\f\v AI@ \0!\f\v AI@ \0!\f\v Ak! \0!@  -\0\0:\0\0  -\0:\0  -\0:\0  -\0:\0 Aj! Aj" M\r\0\v\v  I@@  -\0\0:\0\0 Aj! Aj" G\r\0\v\v \0\vA\0\v\v\0A\xE8\vA\x7F  \0("\bAuj! \0(\0!\0       \x07 \bAq\x7F (\0 \0j(\0 \0\v\f\0\v\x84\x7F{|}@ \0"\x07("\f j"\b \x07(\b \x07("\rkAu"\0L\r\0@ \0 \bA\x80@k"\bI@ \x07Aj \b \0k \x07(!\f\f\v \0 \bM\r\0 \x07 \r \bAtj6\b\v  \fjA\x80@k"\0 \x07( \x07("\rkAu"\bK@ \x07Aj \0 \bk \x07(!\f\f\v \0 \bO\r\0 \x07 \r \0Atj6\v@ A\0L\r\0 \x07(!\r \x07(!	A\0!\0@ AI\r\0 	 \fAt"\bj"\n \r  \fjAt"j"I \b \rj"\b 	 j"Iq\r\0  I \n  Atj"Iq\r\0  I \b Iq\r\0 A\xFC\xFF\xFF\xFF\x07q!\0A\0!\b@ 	 \b \fjAt"\nj  \bAtj"\xFD\0\0" \xFD\0"\xFD\r\0\b	\n\v\x1B\xFD\v\0 \n \rj  \xFD\r\x07\f\r\xFD\v\0 \bAj"\b \0G\r\0\v \0 F\r\v \0Ar!\b Aq@ 	 \0 \fjAt"\nj  \0Atj"\0*\x008\0 \n \rj \0*8\0 \b!\0\v  \bF\r\0@ 	 \0 \fjAt"\bj  \0Atj"\n*\x008\0 \b \rj \n*8\0 	 \f \0Aj"\bjAt"\nj  \bAtj"\b*\x008\0 \n \rj \b*8\0 \0Aj"\0 G\r\0\v\v \x07  \fj6A\x80 "A\0A\x80 \xFC\v\0A\x80 "\fA\0A\x80 \xFC\v\0@ \x07(8"\r N\r\0 \x07A,j! \x07A j! A\x80 j\xFD! \fA\x80 j"\xFD!! C\0\0\x80D\x94\xBB!$ \f\xFD!" \xFD!  \x07+x!#@ \x07( #\xFC"A\x80jH\r@ \x07-\0\x80AF@ \x07A\0:\0\x80 \x07(`! \x07(T!\0 \x07(! \x07(!\f\v \x07(`! \x07(T!\0 \x07(! \x07(!A\x80  A\x80L\x1BA\x80k"\b A\x80j"\nJ\r\0 A\x80 j!\v \0A\x80 j!C\xCA\xF2I\xF1!@  \bAt"j!  j!A\0!\xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0!@   At"	j\xFD\0\0\0 	 j\xFD\0\0\0\xFD\xE6\xFD\xE4 	 \vj\xFD\0\0\0 	 j\xFD\0\0\0\xFD\xE6\xFD\xE4! A\xFC\x07I Aj!\r\0\v \xFD \xFD \xFD\0 \xFD\x92\x92\x92"%   %]"\x1B! \b  \x1B! \b \nG \bAj!\b\r\0\v\v A\x80\bj!\x1BA\0!@@   ! \x07(<"\bA\x80 j"\v\xFD \x07(H"	A\x80 j"\xFD \0A\x80@k"\xFD\xFD:   A\x80@k"\xFD  At"j"A\x80@k"\xFD \x07(l"\nA\x80@k"\xFD  j"A\x80@k"\xFD\xFD:\xFD\r\0\b	\f\r " \b\xFD 	\xFD \0\xFD \xFD: \xFD \xFD \n\xFD \xFD \xFD:\xFD\r\0\b	\f\r\xFDN\xFDS\r\0 \b I \v \fKq\r\0 \f I 	 Iq\r\0 \f I \0 Iq\r\0  I \f Iq\r\0 \f I  Iq\r\0 \f I \n Iq\r\0 \f I  Iq\r\0 \b I 	 \vIq\r\0 \b I \0 \vIq\r\0 \b I  \vIq\r\0 \b I \v Kq\r\0 \b I \n \vIq\r\0 \b I \v Kq\r\0 	 I \0 Iq\r\0 	 I  Iq\r\0 	 I  Kq\r\0 	 I \n Iq\r\0 	 I  Kq\r\0 \0 I  Iq\r\0 \0 I  Kq\r\0 \0 I \n Iq\r\0 \0 I  Kq\r\0  I  Kq\r\0  I \n Iq\r\0  I  Kq\r\0@  At"\vj   jAt"j"\xFD\0\0 \n \vj\xFD\0\0"\xFD\xE6 \b \vj"\xFD\0\0\xFD\xE4\xFD\v\0 \v \fj   j"\xFD\0\0\xFD\xE6 	 \vj"\xFD\0\0\xFD\xE4\xFD\v\0    \x1BjAt"j"\xFD\0\0 \n \vA\x80 r"j\xFD\0\0"\xFD\xE6\xFD\v\0    j"\xFD\0\0\xFD\xE6\xFD\v\0 \0 \vj \xFD\0\0\xFD\v\0  \vj \xFD\0\0\xFD\v\0 \0 j \xFD\0\0\xFD\v\0  j \xFD\0\0\xFD\v\0 Aj"A\x80\bG\r\0\v\f\v@  At"\vj   jAt"j"*\0 \n \vj*\0"\x94 \b \vj"*\0\x928\0 \v \fj   j"*\0\x94 	 \vj"*\0\x928\0    \x1BjAt"j"*\0 \n \vA\x80 r"j"*\0\x948\0   j"*\0 *\0\x948\0 \0 \vj *\x008\0  \vj *\x008\0 \0 j *\x008\0  j *\x008\0 Aj"A\x80\bG\r\0\v\v@ \x07($ \x07( "kAu"\0 \rA\x80\bjN\r\0@ \0 \rA\x80\xC8\0j"I@   \0k \x07(8"\rA\x80\xC8\0j!\f\v \0 M\r\0 \x07  Atj6$\v \x07(0 \x07(,"kAu"\0 I@   \0k \x07(8!\r\f\v \0 M\r\0 \x07  Atj60\v \x07(  \rAtj A\x80 \xFC\n\0\0 \x07(, \x07(8Atj \fA\x80 \xFC\n\0\0 \x07 \x07(8A\x80\bj"\r68 \x07 \x07+x $\xA0"#9x  \rJ\r\0\v\v@ \r   \rJ\x1B"\bA\0L\r\0 \x07(,!	 \x07( !\nA\0!@ \bAI\r\0 \n  \bAtj"I \n \bAt"\0j Kq\r\0  	K \0 	j Kq\r\0 \bA\xFC\xFF\xFF\xFF\x07q!A\0!@  Atj"\0 \n At"j\xFD\0\0" 	 j\xFD\0\0"\xFD\r\b	\n\v\x1B\f\r\xFD\v \0  \xFD\r\0\x07\xFD\v\0 Aj" G\r\0\v  \bF\r\v Ar!\0 \bAq@  Atj" \n At"j*\x008\0   	j*\x008 \0!\v \0 \bF\r\0@  Atj"\0 \n At"j*\x008\0 \0  	j*\x008  Aj"\0Atj" \n \0At"\0j*\x008\0  \0 	j*\x008 Aj" \bG\r\0\v\v@  \rL\r\0  \bkAt"\0E\r\0  \bAtjA\0 \0\xFC\v\0\v \bA\0J@@ \r \bk"\0A\0L\r\0 \bAt! \0At"E"E@ \x07( "  j \xFC\n\0\0\v \r\0 \x07(,"  j \xFC\n\0\0\v \x07 \x0068\v \x07+x"#\xFC"\0A\x81N@ \x07( \0A\x80k"\0k"A\0J@ \0At! At"E"E@ \x07("\r  \rj \xFC\n\0\0\v E@ \x07("  j \xFC\n\0\0\v \x07+x!#\v \x07 6 \x07 # \0\xB8\xA19x\v \f   \b\xB2\x94\'\xFC\0\v\xB5\x7F \0A\x0068 \0A\x006@ \0(@ \0(<"k"A\0L\r\0 E\r\0 A\0 \xFC\v\0\v@ \0(L \0(H"k"A\0L\r\0 E\r\0 A\0 \xFC\v\0\v@ \0(X \0(T"k"A\0L\r\0 E\r\0 A\0 \xFC\v\0\v@ \0(d \0(`"k"A\0L\r\0 E\r\0 A\0 \xFC\v\0\v \0A:\0\x80 \0B\x007x\v\xF5\n\f\x7F{A\x88! \0(\0!#\0Ak"\0$\0 B\x007  6\0 \xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\xFD\v\f B\x007  \xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\xFD\v( B\x007< \xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\xFD\vD \xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\xFD\vT \xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\xFD\vdA\0! A\x006t A\xEC\0jA\x80 A\xE0\0j! A\xD4\0j!\v A\xC8\0j! A<j! A,j! A j!\x07 Aj!\b Aj!	 (l!\n\xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\0!@ \n Atj\xFD\f\0\0\0\0\0\0\xF0?\0\0\0\0\0\0\xF0? \xFD\xFE\xFD\f-DT\xFB!@-DT\xFB!@\xFD\xF2\xFD\f\0\0\0\0\0\xFC\x9F@\0\0\0\0\0\xFC\x9F@\xFD\xF3"\r\xFD!\0\x1B\xFD \r\xFD!\x1B\xFD"\xFD\xF1\xFD\f\0\0\0\0\0\0\xE0?\0\0\0\0\0\0\xE0?\xFD\xF2"\r\xFD!\0\xB6\xFD \r\xFD!\xB6\xFD \xFD\f\0\0\0\0\0\0\xF0?\0\0\0\0\0\0\xF0?  \xFD\r\b	\n\v\f\r\0\0\xFD\xFE\xFD\f-DT\xFB!@-DT\xFB!@\xFD\xF2\xFD\f\0\0\0\0\0\xFC\x9F@\0\0\0\0\0\xFC\x9F@\xFD\xF3"\r\xFD!\0\x1B\xFD \r\xFD!\x1B\xFD"\xFD\xF1\xFD\f\0\0\0\0\0\0\xE0?\0\0\0\0\0\0\xE0?\xFD\xF2"\r\xFD!\0\xB6\xFD  \r\xFD!\xB6\xFD \xFD\v\0 \xFD\f\0\0\0\0\0\0\0\0\0\0\0\0\xFD\xAE! Aj"A\x80G\r\0\v \0A\x006\f@ (\b ("k"\nAu"\fA\xFF\xFFM@ 	A\x80\x80 \fk \0A\fj\f\v \nA\x80\x80F\r\0  A\x80\x80j6\b\v \0A\x006\f@ ( ("k"	Au"\nA\xFF\xFFM@ \bA\x80\x80 \nk \0A\fj\f\v 	A\x80\x80F\r\0  A\x80\x80j6\v \0A\x006\f@ ($ ( "k"\bAu"	A\xFF\xFF\0M@ \x07A\x80\x80 	k \0A\fj\f\v \bA\x80\x80F\r\0  A\x80\x80j6$\v \0A\x006\f@ (0 (,"k"\x07Au"\bA\xFF\xFF\0M@ A\x80\x80 \bk \0A\fj\f\v \x07A\x80\x80F\r\0  A\x80\x80j60\v \0A\x006\f@ (@ (<"k"Au"\x07A\xFF\x07M@ A\x80\b \x07k \0A\fj\f\v A\x80 F\r\0  A\x80 j6@\v \0A\x006\f@ (L (H"k"Au"A\xFF\x07M@ A\x80\b k \0A\fj\f\v A\x80 F\r\0  A\x80 j6L\v \0A\x006\f@ (X (T"k"Au"A\xFFM@ \vA\x80 k \0A\fj\f\v A\x80\xC0\0F\r\0  A\x80@k6X\v \0A\x006\f@ (d (`"k"\vAu"A\xFFM@ A\x80 k \0A\fj\f\v \vA\x80\xC0\0F\r\0  A\x80@k6d\v A\x0068 A\x006@ (@ (<"k"A\0L\r\0 E\r\0 A\0 \xFC\v\0\v@ (L (H"k"A\0L\r\0 E\r\0 A\0 \xFC\v\0\v@ (X (T"k"A\0L\r\0 E\r\0 A\0 \xFC\v\0\v@ (d (`"k"A\0L\r\0 E\r\0 A\0 \xFC\v\0\v A:\0\x80 B\x007x \0Aj$\0 \v%\x7F#\0Ak"$\0  6\f A\fj \0\0\0 Aj$\0\v\x80\x7F \0@ \0(l"@ \0 6p \0(t \v \0(`"@ \0 6d \0(h \v \0(T"@ \0 6X \0(\\ \v \0(H"@ \0 6L \0(P \v \0(<"@ \0 6@ \0(D \v \0(,"@ \0 60 \0(4 \v \0( "@ \0 6$ \0(( \v \0("@ \0 6 \0( \v \0("@ \0 6\b \0(\f \v \0\v\v\0A\x88\vP\0A\xF86A6\0A\xFC6A\x006\0,A\xFC6A\x807(\x006\0A\x807A\xF866\0A\x847A6\0A\x887A\x006\0)A\x887A\x807(\x006\0A\x807A\x8476\0\v\v\xF3.\0A\x80\b\v\xD3\bunsigned short\0unsigned int\0reset\0float\0%s:%d: %s\0vector\0Resampler\0BungeeStretcher\0unsigned char\0/emsdk/emscripten/system/lib/libcxxabi/src/private_typeinfo.cpp\0process_audio\0bool\0bad_array_new_length\0unsigned long long\0unsigned long\0std::wstring\0std::string\0std::u16string\0std::u32string\0double\0process_audio_simd\0void\0catching a class without an object?\0emscripten::memory_view<short>\0emscripten::memory_view<unsigned short>\0emscripten::memory_view<int>\0emscripten::memory_view<unsigned int>\0emscripten::memory_view<float>\0emscripten::memory_view<uint8_t>\0emscripten::memory_view<int8_t>\0emscripten::memory_view<uint16_t>\0emscripten::memory_view<int16_t>\0emscripten::memory_view<uint64_t>\0emscripten::memory_view<int64_t>\0emscripten::memory_view<uint32_t>\0emscripten::memory_view<int32_t>\0emscripten::memory_view<char>\0emscripten::memory_view<unsigned char>\0emscripten::memory_view<signed char>\0emscripten::memory_view<long>\0emscripten::memory_view<unsigned long>\0emscripten::memory_view<double>\0\0\0\xF0\0\0\xF0\x07\0\x009Resampler\0\0t\0\0\f\b\0\0\0\0\0\0\xE8\x07\0\0P9Resampler\0t\0\0(\b\0\0\0\0\0\xE8\x07\0\0PK9Resampler\0pp\0v\0vp\0\0\0\0\xFC\x07\0\0pp\0\x000\0\0\xFC\x07\0\0vpp\0A\xE0\v\xA6\b\x88\0\0\xFC\x07\0\0\xAC\0\0\x88\0\0\xAC\0\0\x88\0\0\xD0\0\0ippiiiif\0\0\0\0\xF0\0\0\x90\b\0\x0015BungeeStretcher\0\0\0t\0\0\xB4\b\0\0\0\0\0\0\x88\b\0\0P15BungeeStretcher\0\0t\0\0\xD8\b\0\0\0\0\0\x88\b\0\0PK15BungeeStretcher\0pp\0vp\0\0\0\xA4\b\0\0\x88\0\0ppi\x000\0\0\xA4\b\0\0vpp\0\0\0\0\0\x88\0\0\xA4\b\0\0\xAC\0\0\x88\0\0\xAC\0\0\x88\0\0\xD0\0\0\xD0\0\0ippiiiiff\0\0\0\xF0\0\0D	\0\0N10emscripten3valE\0\0\xF0\0\0`	\0\0NSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEE\0\0\xF0\0\0\xA8	\0\0NSt3__212basic_stringIwNS_11char_traitsIwEENS_9allocatorIwEEEE\0\0\xF0\0\0\xF0	\0\0NSt3__212basic_stringIDsNS_11char_traitsIDsEENS_9allocatorIDsEEEE\0\0\0\xF0\0\0<\n\0\0NSt3__212basic_stringIDiNS_11char_traitsIDiEENS_9allocatorIDiEEEE\0\0\0\xF0\0\0\x88\n\0\0N10emscripten11memory_viewIcEE\0\0\xF0\0\0\xB0\n\0\0N10emscripten11memory_viewIaEE\0\0\xF0\0\0\xD8\n\0\0N10emscripten11memory_viewIhEE\0\0\xF0\0\0\0\v\0\0N10emscripten11memory_viewIsEE\0\0\xF0\0\0(\v\0\0N10emscripten11memory_viewItEE\0\0\xF0\0\0P\v\0\0N10emscripten11memory_viewIiEE\0\0\xF0\0\0x\v\0\0N10emscripten11memory_viewIjEE\0\0\xF0\0\0\xA0\v\0\0N10emscripten11memory_viewIlEE\0\0\xF0\0\0\xC8\v\0\0N10emscripten11memory_viewImEE\0\0\xF0\0\0\xF0\v\0\0N10emscripten11memory_viewIxEE\0\0\xF0\0\0\f\0\0N10emscripten11memory_viewIyEE\0\0\xF0\0\0@\f\0\0N10emscripten11memory_viewIfEE\0\0\xF0\0\0h\f\0\0N10emscripten11memory_viewIdEE\0A\x90\v\xD7\0\0\0\0\0\0\0\0\0\0\0\0\x83\xF9\xA2\0DNn\0\xFC)\0\xD1W\'\0\xDD4\xF5\0b\xDB\xC0\0<\x99\x95\0A\x90C\0cQ\xFE\0\xBB\xDE\xAB\0\xB7a\xC5\0:n$\0\xD2MB\0I\xE0\0	\xEA.\0\x92\xD1\0\xEB\xFE\0)\xB1\0\xE8>\xA7\0\xF55\x82\0D\xBB.\0\x9C\xE9\x84\0\xB4&p\0A~_\0\xD6\x919\0S\x839\0\x9C\xF49\0\x8B_\x84\0(\xF9\xBD\0\xF8;\0\xDE\xFF\x97\0\x98\0/\xEF\0\nZ\x8B\0mm\0\xCF~6\0	\xCB\'\0FO\xB7\0\x9Ef?\0-\xEA_\0\xBA\'u\0\xE5\xEB\xC7\0={\xF1\0\xF79\x07\0\x92R\x8A\0\xFBk\xEA\0\xB1_\0\b]\x8D\x000V\0{\xFCF\0\xF0\xABk\0 \xBC\xCF\x006\xF4\x9A\0\xE3\xA9\0^a\x91\0\b\x1B\xE6\0\x85\x99e\0\xA0_\0\x8D@h\0\x80\xD8\xFF\0\'sM\01\0\xCAV\0\xC9\xA8s\0{\xE2`\0k\x8C\xC0\0\xC4G\0\xCDg\xC3\0	\xE8\xDC\0Y\x83*\0\x8Bv\xC4\0\xA6\x96\0D\xAF\xDD\0W\xD1\0\xA5>\0\x07\xFF\x003~?\0\xC22\xE8\0\x98O\xDE\0\xBB}2\0&=\xC3\0k\xEF\0\x9F\xF8^\x005:\0\x7F\xF2\xCA\0\xF1\x87\0|\x90!\0j$|\0\xD5n\xFA\x000-w\0;C\0\xB5\xC6\0\xC3\x9D\0\xAD\xC4\xC2\0,MA\0\f\0]\0\x86}F\0\xE3q-\0\x9B\xC6\x9A\x003b\0\0\xB4\xD2|\0\xB4\xA7\x97\x007U\xD5\0\xD7>\xF6\0\xA3\0Mv\xFC\0d\x9D*\0p\xD7\xAB\0c|\xF8\0z\xB0W\0\xE7\0\xC0IV\0;\xD6\xD9\0\xA7\x848\0$#\xCB\0\xD6\x8Aw\0ZT#\0\0\xB9\0\xF1\n\x1B\0\xCE\xDF\0\x9F1\xFF\0fj\0\x99Wa\0\xAC\xFBG\0~\x7F\xD8\0"e\xB7\x002\xE8\x89\0\xE6\xBF`\0\xEF\xC4\xCD\0l6	\0]?\xD4\0\xDE\xD7\0X;\xDE\0\xDE\x9B\x92\0\xD2"(\0(\x86\xE8\0\xE2XM\0\xC6\xCA2\0\b\xE3\0\xE0}\xCB\0\xC0P\0\xF3\xA7\0\xE0[\0.4\0\x83b\0\x83H\0\xF5\x8E[\0\xAD\xB0\x7F\0\xE9\xF2\0HJC\0g\xD3\0\xAA\xDD\xD8\0\xAE_B\0ja\xCE\0\n(\xA4\0\xD3\x99\xB4\0\xA6\xF2\0\\w\x7F\0\xA3\xC2\x83\0a<\x88\0\x8Asx\0\xAF\x8CZ\0o\xD7\xBD\0-\xA6c\0\xF4\xBF\xCB\0\x8D\x81\xEF\0&\xC1g\0U\xCAE\0\xCA\xD96\0(\xA8\xD2\0\xC2a\x8D\0\xC9w\0&\0F\x9B\0\xC4Y\xC4\0\xC8\xC5D\0M\xB2\x91\0\0\xF3\0\xD4C\xAD\0)I\xE5\0\xFD\xD5\0\0\xBE\xFC\0\x94\xCC\0p\xCE\xEE\0>\xF5\0\xEC\xF1\x80\0\xB3\xE7\xC3\0\xC7\xF8(\0\x93\x94\0\xC1q>\0.	\xB3\0\vE\xF3\0\x88\x9C\0\xAB {\0.\xB5\x9F\0G\x92\xC2\0{2/\0\fUm\0r\xA7\x90\0k\xE7\x001\xCB\x96\0yJ\0Ay\xE2\0\xF4\xDF\x89\0\xE8\x94\x97\0\xE2\xE6\x84\0\x991\x97\0\x88\xEDk\0__6\0\xBB\xFD\0H\x9A\xB4\0g\xA4l\0qrB\0\x8D]2\0\x9F\xB8\0\xBC\xE5	\0\x8D1%\0\xF7t9\x000\0\r\f\0K\bh\0,\xEEX\0G\xAA\x90\0t\xE7\0\xBD\xD6$\0\xF7}\xA6\0nHr\0\x9F\xEF\0\x8E\x94\xA6\0\xB4\x91\xF6\0\xD1SQ\0\xCF\n\xF2\0 \x983\0\xF5K~\0\xB2ch\0\xDD>_\0@]\0\x85\x89\x7F\0UR)\x007d\xC0\0m\xD8\x002H2\0[Lu\0Nq\xD4\0ETn\0\v	\xC1\0*\xF5i\0f\xD5\0\'\x07\x9D\0]P\0\xB4;\xDB\0\xEAv\xC5\0\x87\xF9\0Ik}\0\'\xBA\0\x96i)\0\xC6\xCC\xAC\0\xADT\0\x90\xE2j\0\x88\xD9\x89\0,rP\0\xA4\xBE\0w\x07\x94\0\xF30p\0\0\xFC\'\0\xEAq\xA8\0f\xC2I\0d\xE0=\0\x97\xDD\x83\0\xA3?\x97\0C\x94\xFD\0\r\x86\x8C\x001A\xDE\0\x929\x9D\0\xDDp\x8C\0\xB7\xE7\0\b\xDF;\07+\0\\\x80\xA0\0Z\x80\x93\0\x92\0\xE8\xD8\0l\x80\xAF\0\xDB\xFFK\x008\x90\0Yv\0b\xA5\0a\xCB\xBB\0\xC7\x89\xB9\0@\xBD\0\xD2\xF2\0Iu\'\0\xEB\xB6\xF6\0\xDB"\xBB\0\n\xAA\0\x89&/\0d\x83v\0	;3\0\x94\0Q:\xAA\0\xA3\xC2\0\xAF\xED\xAE\0\\&\0m\xC2M\0-z\x9C\0\xC0V\x97\0?\x83\0	\xF0\xF6\0+@\x8C\0m1\x99\x009\xB4\x07\0\f \0\xD8\xC3[\0\xF5\x92\xC4\0\xC6\xADK\0N\xCA\xA5\0\xA77\xCD\0\xE6\xA96\0\xAB\x92\x94\0\xDDBh\0c\xDE\0v\x8C\xEF\0h\x8BR\0\xFC\xDB7\0\xAE\xA1\xAB\0\xDF1\0\0\xAE\xA1\0\f\xFB\xDA\0dMf\0\xED\xB7\0)e0\0WV\xBF\0G\xFF:\0j\xF9\xB9\0u\xBE\xF3\0(\x93\xDF\0\xAB\x800\0f\x8C\xF6\0\xCB\0\xFA"\0\xD9\xE4\0=\xB3\xA4\0W\x1B\x8F\x006\xCD	\0NB\xE9\0\xBE\xA4\x003#\xB5\0\xF0\xAA\0Oe\xA8\0\xD2\xC1\xA5\0\v?\0[x\xCD\0#\xF9v\0{\x8B\0\x89r\0\xC6\xA6S\0on\xE2\0\xEF\xEB\0\0\x9BJX\0\xC4\xDA\xB7\0\xAAf\xBA\0v\xCF\xCF\0\xD1\0\xB1\xF1-\0\x8C\x99\xC1\0\xC3\xADw\0\x86H\xDA\0\xF7]\xA0\0\xC6\x80\xF4\0\xAC\xF0/\0\xDD\xEC\x9A\0?\\\xBC\0\xD0\xDEm\0\x90\xC7\0*\xDB\xB6\0\xA3%:\0\0\xAF\x9A\0\xADS\x93\0\xB6W\0)-\xB4\0K\x80~\0\xDA\x07\xA7\0v\xAA\0{Y\xA1\0*\0\xDC\xB7-\0\xFA\xE5\xFD\0\x89\xDB\xFE\0\x89\xBE\xFD\0\xE4vl\0\xA9\xFC\0>\x80p\0\x85n\0\xFD\x87\xFF\0(>\x07\0ag3\0*\x86\0M\xBD\xEA\0\xB3\xE7\xAF\0\x8Fmn\0\x95g9\x001\xBF[\0\x84\xD7H\x000\xDF\0\xC7-C\0%a5\0\xC9p\xCE\x000\xCB\xB8\0\xBFl\xFD\0\xA4\0\xA2\0l\xE4\0Z\xDD\xA0\0!oG\0b\xD2\0\xB9\\\x84\0paI\0kV\xE0\0\x99R\0PU7\0\xD5\xB7\x003\xF1\xC4\0n_\0]0\xE4\0\x85.\xA9\0\xB2\xC3\0\xA126\0\b\xB7\xA4\0\xEA\xB1\xD4\0\xF7!\0\x8Fi\xE4\0\'\xFFw\0\f\x80\0\x8D@-\0O\xCD\xA0\0 \xA5\x99\0\xB3\xA2\xD3\0/]\n\0\xB4\xF9B\0\xDA\xCB\0}\xBE\xD0\0\x9B\xDB\xC1\0\xAB\xBD\0\xCA\xA2\x81\0\bj\\\0.U\0\'\0U\0\x7F\xF0\0\xE1\x07\x86\0\vd\0\x96A\x8D\0\x87\xBE\xDE\0\xDA\xFD*\0k%\xB6\0{\x894\0\xF3\xFE\0\xB9\xBF\x9E\0hjO\0J*\xA8\0O\xC4Z\0-\xF8\xBC\0\xD7Z\x98\0\xF4\xC7\x95\0\rM\x8D\0 :\xA6\0\xA4W_\0?\xB1\0\x808\x95\0\xCC \0q\xDD\x86\0\xC9\xDE\xB6\0\xBF`\xF5\0Me\0\x07k\0\x8C\xB0\xAC\0\xB2\xC0\xD0\0QUH\0\xFB\0\x95r\xC3\0\xA3;\0\xC0@5\0\xDC{\0\xE0E\xCC\0N)\xFA\0\xD6\xCA\xC8\0\xE8\xF3A\0|d\xDE\0\x9Bd\xD8\0\xD9\xBE1\0\xA4\x97\xC3\0wX\xD4\0i\xE3\xC5\0\xF0\xDA\0\xBA:<\0FF\0Uu_\0\xD2\xBD\xF5\0n\x92\xC6\0\xAC.]\0D\xED\0>B\0a\xC4\x87\0)\xFD\xE9\0\xE7\xD6\xF3\0"|\xCA\0o\x915\0\b\xE0\xC5\0\xFF\xD7\x8D\0nj\xE2\0\xB0\xFD\xC6\0\x93\b\xC1\0|]t\0k\xAD\xB2\0\xCDn\x9D\0>r{\0\xC6j\0\xF7\xCF\xA9\0)s\xDF\0\xB5\xC9\xBA\0\xB7\0Q\0\xE2\xB2\r\0t\xBA$\0\xE5}`\0t\xD8\x8A\0\r,\0\x81\f\0~f\x94\0)\0\x9Fzv\0\xFD\xFD\xBE\0VE\xEF\0\xD9~6\0\xEC\xD9\0\x8B\xBA\xB9\0\xC4\x97\xFC\x001\xA8\'\0\xF1n\xC3\0\x94\xC56\0\xD8\xA8V\0\xB4\xA8\xB5\0\xCF\xCC\0\x89-\0oW4\0,V\x89\0\x99\xCE\xE3\0\xD6 \xB9\0k^\xAA\0>*\x9C\0_\xCC\0\xFD\vJ\0\xE1\xF4\xFB\0\x8E;m\0\xE2\x86,\0\xE9\xD4\x84\0\xFC\xB4\xA9\0\xEF\xEE\xD1\0.5\xC9\0/9a\x008!D\0\x1B\xD9\xC8\0\x81\xFC\n\0\xFBJj\0/\xD8\0S\xB4\x84\0N\x99\x8C\0T"\xCC\0*U\xDC\0\xC0\xC6\xD6\0\v\x96\0p\xB8\0i\x95d\0&Z`\0?R\xEE\0\x7F\0\xF4\xB5\0\xFC\xCB\xF5\x004\xBC-\x004\xBC\xEE\0\xE8]\xCC\0\xDD^`\0g\x8E\x9B\0\x923\xEF\0\xC9\xB8\0aX\x9B\0\xE1W\xBC\0Q\x83\xC6\0\xD8>\0\xDDqH\0-\xDD\0\xAF\xA1\0!,F\0Y\xF3\xD7\0\xD9z\x98\0\x9ET\xC0\0O\x86\xFA\0V\xFC\0\xE5y\xAE\0\x89"6\x008\xAD"\0g\x93\xDC\0U\xE8\xAA\0\x82&8\0\xCA\xE7\x9B\0Q\r\xA4\0\x993\xB1\0\xA9\xD7\0iH\0e\xB2\xF0\0\x7F\x88\xA7\0\x88L\x97\0\xF9\xD16\0!\x92\xB3\0{\x82J\0\x98\xCF!\0@\x9F\xDC\0\xDCGU\0\xE1t:\0g\xEBB\0\xFE\x9D\xDF\0^\xD4_\0{g\xA4\0\xBA\xACz\0U\xF6\xA2\0+\x88#\0A\xBAU\0Yn\b\0!*\x86\x009G\x83\0\x89\xE3\xE6\0\xE5\x9E\xD4\0I\xFB@\0\xFFV\xE9\0\xCA\0\xC5Y\x8A\0\x94\xFA+\0\xD3\xC1\xC5\0\xC5\xCF\0\xDBZ\xAE\0G\xC5\x86\0\x85Cb\0!\x86;\0,y\x94\0a\x87\0*L{\0\x80,\0C\xBF\0\x88&\x90\0x<\x89\0\xA8\xC4\xE4\0\xE5\xDB{\0\xC4:\xC2\0&\xF4\xEA\0\xF7g\x8A\0\r\x92\xBF\0e\xA3+\0=\x93\xB1\0\xBD|\v\0\xA4Q\xDC\0\'\xDDc\0i\xE1\xDD\0\x9A\x94\0\xA8)\x95\0h\xCE(\0	\xED\xB4\0D\x9F \0N\x98\xCA\0p\x82c\0~|#\0\xB92\0\xA7\xF5\x8E\0V\xE7\0!\xF1\b\0\xB5\x9D*\0o~M\0\xA5Q\0\xB5\xF9\xAB\0\x82\xDF\xD6\0\x96\xDDa\06\0\xC4:\x9F\0\x83\xA2\xA1\0r\xEDm\x009\x8Dz\0\x82\xB8\xA9\0k2\\\0F\'[\0\x004\xED\0\xD2\0w\0\xFC\xF4U\0YM\0\xE0q\x80\0A\xF3.\v\xFD\x07@\xFB!\xF9?\0\0\0\0-Dt>\0\0\0\x80\x98F\xF8<\0\0\0`Q\xCCx;\0\0\0\x80\x83\x1B\xF09\0\0\0@ %z8\0\0\0\x80"\x82\xE36\0\0\0\0\xF3i5\0\0\xBC\0\0\\\x1B\0\0N10__cxxabiv116__shim_type_infoE\0\0\0\0\0\0\xEC\0\0\xB0\0\0N10__cxxabiv117__class_type_infoE\0\0\0\0\0\0\0\xB0\0\0N10__cxxabiv117__pbase_type_infoE\0\0\0\0\0L\0\0\0\0N10__cxxabiv119__pointer_type_infoE\0\0\0|\0\0\xB0\0\0N10__cxxabiv120__function_type_infoE\0\0\0\0\0\0\xB0\0\0\0\0N10__cxxabiv129__pointer_to_member_type_infoE\0\0\0\0\0\0\0\xFC\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\b\0\0\xB0\0\0N10__cxxabiv123__fundamental_type_infoE\0\xE8\0\x008\0\0v\0Dn\0\0\0\0\xE8\0\0H\0\0b\0\0\0\xE8\0\0T\0\0c\0\0\0\xE8\0\0`\0\0h\0\0\0\xE8\0\0l\0\0a\0\0\0\xE8\0\0x\0\0s\0\0\0\xE8\0\0\x84\0\0t\0\0\0\xE8\0\0\x90\0\0i\0\0\0\xE8\0\0\x9C\0\0j\0\0\0\xE8\0\0\xA8\0\0l\0\0\0\xE8\0\0\xB4\0\0m\0\0\0\xE8\0\0\xC0\0\0x\0\0\0\xE8\0\0\xCC\0\0y\0\0\0\xE8\0\0\xD8\0\0f\0\0\0\xE8\0\0\xE4\0\0d\0\0\0\0\0\0\0\xE0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x1B\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x008\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x1B\0\0\0 \0\0\0!\0\0\0"\0\0\0\0\0D\0\0\xE0\0\0N10__cxxabiv120__si_class_type_infoE\0\0\0\0\0\0\0\0@\0\0\0\0\0#\0\0\0\0\0\0\0\0\0$\0\0\0\0\0\0\0\xD0\0\0\0\0\0%\0\0\0&\0\0\0\xF0\0\0\xA4\0\0St9exception\0\0\0\0\0\0\xC0\0\0\x9C\0\0St9bad_alloc\0\0\0\0\0\0\xDC\0\0\xB4\0\0St20bad_array_new_length\0\0\0\0\0\0\0\0\f\x1B\0\0\0\0\0\'\0\0\0(\0\0\0\0\0\x1B\0\0\x9C\0\0St11logic_error\0\0\0\0\0<\x1B\0\0\0\0\0)\0\0\0(\0\0\0\0\0H\x1B\0\0\f\x1B\0\0St12length_error\0\0\0\0\xF0\0\0d\x1B\0\0St9type_info\0A\xF46\v\x90');
  }
  function getBinarySync(file) {
    return file;
  }
  async function getWasmBinary(binaryFile) {
    return getBinarySync(binaryFile);
  }
  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary = await getWasmBinary(binaryFile);
      var instance = await WebAssembly.instantiate(binary, imports);
      return instance;
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`);
      abort(reason);
    }
  }
  async function instantiateAsync(binary, binaryFile, imports) {
    return instantiateArrayBuffer(binaryFile, imports);
  }
  function getWasmImports() {
    var imports = { a: wasmImports };
    return imports;
  }
  async function createWasm() {
    function receiveInstance(instance, module) {
      wasmExports = instance.exports;
      assignWasmExports(wasmExports);
      updateMemoryViews();
      return wasmExports;
    }
    function receiveInstantiationResult(result2) {
      return receiveInstance(result2["instance"]);
    }
    var info = getWasmImports();
    if (Module2["instantiateWasm"]) {
      return new Promise((resolve, reject) => {
        Module2["instantiateWasm"](info, (inst, mod) => {
          resolve(receiveInstance(inst, mod));
        });
      });
    }
    wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
    var exports = receiveInstantiationResult(result);
    return exports;
  }
  class ExitStatus {
    name = "ExitStatus";
    constructor(status) {
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
  }
  var HEAP16;
  var HEAP32;
  var HEAP64;
  var HEAP8;
  var HEAPF32;
  var HEAPF64;
  var HEAPU16;
  var HEAPU32;
  var HEAPU64;
  var HEAPU8;
  var callRuntimeCallbacks = (callbacks) => {
    while (callbacks.length > 0) {
      callbacks.shift()(Module2);
    }
  };
  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.push(cb);
  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.push(cb);
  var noExitRuntime = true;
  class ExceptionInfo {
    constructor(excPtr) {
      this.excPtr = excPtr;
      this.ptr = excPtr - 24;
    }
    set_type(type) {
      HEAPU32[this.ptr + 4 >> 2] = type;
    }
    get_type() {
      return HEAPU32[this.ptr + 4 >> 2];
    }
    set_destructor(destructor) {
      HEAPU32[this.ptr + 8 >> 2] = destructor;
    }
    get_destructor() {
      return HEAPU32[this.ptr + 8 >> 2];
    }
    set_caught(caught) {
      caught = caught ? 1 : 0;
      HEAP8[this.ptr + 12] = caught;
    }
    get_caught() {
      return HEAP8[this.ptr + 12] != 0;
    }
    set_rethrown(rethrown) {
      rethrown = rethrown ? 1 : 0;
      HEAP8[this.ptr + 13] = rethrown;
    }
    get_rethrown() {
      return HEAP8[this.ptr + 13] != 0;
    }
    init(type, destructor) {
      this.set_adjusted_ptr(0);
      this.set_type(type);
      this.set_destructor(destructor);
    }
    set_adjusted_ptr(adjustedPtr) {
      HEAPU32[this.ptr + 16 >> 2] = adjustedPtr;
    }
    get_adjusted_ptr() {
      return HEAPU32[this.ptr + 16 >> 2];
    }
  }
  var uncaughtExceptionCount = 0;
  var ___cxa_throw = (ptr, type, destructor) => {
    var info = new ExceptionInfo(ptr);
    info.init(type, destructor);
    uncaughtExceptionCount++;
    abort();
  };
  var __abort_js = () => abort("");
  var AsciiToString = (ptr) => {
    var str = "";
    while (1) {
      var ch = HEAPU8[ptr++];
      if (!ch) return str;
      str += String.fromCharCode(ch);
    }
  };
  var awaitingDependencies = {};
  var registeredTypes = {};
  var typeDependencies = {};
  var BindingError = class BindingError extends Error {
    constructor(message) {
      super(message);
      this.name = "BindingError";
    }
  };
  var throwBindingError = (message) => {
    throw new BindingError(message);
  };
  function sharedRegisterType(rawType, registeredInstance, options = {}) {
    var name = registeredInstance.name;
    if (!rawType) {
      throwBindingError(`type "${name}" must have a positive integer typeid pointer`);
    }
    if (registeredTypes.hasOwnProperty(rawType)) {
      if (options.ignoreDuplicateRegistrations) {
        return;
      } else {
        throwBindingError(`Cannot register type '${name}' twice`);
      }
    }
    registeredTypes[rawType] = registeredInstance;
    delete typeDependencies[rawType];
    if (awaitingDependencies.hasOwnProperty(rawType)) {
      var callbacks = awaitingDependencies[rawType];
      delete awaitingDependencies[rawType];
      callbacks.forEach((cb) => cb());
    }
  }
  function registerType(rawType, registeredInstance, options = {}) {
    return sharedRegisterType(rawType, registeredInstance, options);
  }
  var integerReadValueFromPointer = (name, width, signed) => {
    switch (width) {
      case 1:
        return signed ? (pointer) => HEAP8[pointer] : (pointer) => HEAPU8[pointer];
      case 2:
        return signed ? (pointer) => HEAP16[pointer >> 1] : (pointer) => HEAPU16[pointer >> 1];
      case 4:
        return signed ? (pointer) => HEAP32[pointer >> 2] : (pointer) => HEAPU32[pointer >> 2];
      case 8:
        return signed ? (pointer) => HEAP64[pointer >> 3] : (pointer) => HEAPU64[pointer >> 3];
      default:
        throw new TypeError(`invalid integer width (${width}): ${name}`);
    }
  };
  var __embind_register_bigint = (primitiveType, name, size, minRange, maxRange) => {
    name = AsciiToString(name);
    const isUnsignedType = minRange === 0n;
    let fromWireType = (value) => value;
    if (isUnsignedType) {
      const bitSize = size * 8;
      fromWireType = (value) => BigInt.asUintN(bitSize, value);
      maxRange = fromWireType(maxRange);
    }
    registerType(primitiveType, { name, fromWireType, toWireType: (destructors, value) => {
      if (typeof value == "number") {
        value = BigInt(value);
      }
      return value;
    }, readValueFromPointer: integerReadValueFromPointer(name, size, !isUnsignedType), destructorFunction: null });
  };
  var __embind_register_bool = (rawType, name, trueValue, falseValue) => {
    name = AsciiToString(name);
    registerType(rawType, { name, fromWireType: function(wt) {
      return !!wt;
    }, toWireType: function(destructors, o) {
      return o ? trueValue : falseValue;
    }, readValueFromPointer: function(pointer) {
      return this.fromWireType(HEAPU8[pointer]);
    }, destructorFunction: null });
  };
  var shallowCopyInternalPointer = (o) => ({ count: o.count, deleteScheduled: o.deleteScheduled, preservePointerOnDelete: o.preservePointerOnDelete, ptr: o.ptr, ptrType: o.ptrType, smartPtr: o.smartPtr, smartPtrType: o.smartPtrType });
  var throwInstanceAlreadyDeleted = (obj) => {
    function getInstanceTypeName(handle) {
      return handle.$$.ptrType.registeredClass.name;
    }
    throwBindingError(getInstanceTypeName(obj) + " instance already deleted");
  };
  var finalizationRegistry = false;
  var detachFinalizer = (handle) => {
  };
  var runDestructor = ($$) => {
    if ($$.smartPtr) {
      $$.smartPtrType.rawDestructor($$.smartPtr);
    } else {
      $$.ptrType.registeredClass.rawDestructor($$.ptr);
    }
  };
  var releaseClassHandle = ($$) => {
    $$.count.value -= 1;
    var toDelete = 0 === $$.count.value;
    if (toDelete) {
      runDestructor($$);
    }
  };
  var attachFinalizer = (handle) => {
    if (!globalThis.FinalizationRegistry) {
      attachFinalizer = (handle2) => handle2;
      return handle;
    }
    finalizationRegistry = new FinalizationRegistry((info) => {
      releaseClassHandle(info.$$);
    });
    attachFinalizer = (handle2) => {
      var $$ = handle2.$$;
      var hasSmartPtr = !!$$.smartPtr;
      if (hasSmartPtr) {
        var info = { $$ };
        finalizationRegistry.register(handle2, info, handle2);
      }
      return handle2;
    };
    detachFinalizer = (handle2) => finalizationRegistry.unregister(handle2);
    return attachFinalizer(handle);
  };
  var deletionQueue = [];
  var flushPendingDeletes = () => {
    while (deletionQueue.length) {
      var obj = deletionQueue.pop();
      obj.$$.deleteScheduled = false;
      obj["delete"]();
    }
  };
  var delayFunction;
  var init_ClassHandle = () => {
    let proto = ClassHandle.prototype;
    Object.assign(proto, { isAliasOf(other) {
      if (!(this instanceof ClassHandle)) {
        return false;
      }
      if (!(other instanceof ClassHandle)) {
        return false;
      }
      var leftClass = this.$$.ptrType.registeredClass;
      var left = this.$$.ptr;
      other.$$ = other.$$;
      var rightClass = other.$$.ptrType.registeredClass;
      var right = other.$$.ptr;
      while (leftClass.baseClass) {
        left = leftClass.upcast(left);
        leftClass = leftClass.baseClass;
      }
      while (rightClass.baseClass) {
        right = rightClass.upcast(right);
        rightClass = rightClass.baseClass;
      }
      return leftClass === rightClass && left === right;
    }, clone() {
      if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.preservePointerOnDelete) {
        this.$$.count.value += 1;
        return this;
      } else {
        var clone = attachFinalizer(Object.create(Object.getPrototypeOf(this), { $$: { value: shallowCopyInternalPointer(this.$$) } }));
        clone.$$.count.value += 1;
        clone.$$.deleteScheduled = false;
        return clone;
      }
    }, delete() {
      if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
        throwBindingError("Object already scheduled for deletion");
      }
      detachFinalizer(this);
      releaseClassHandle(this.$$);
      if (!this.$$.preservePointerOnDelete) {
        this.$$.smartPtr = void 0;
        this.$$.ptr = void 0;
      }
    }, isDeleted() {
      return !this.$$.ptr;
    }, deleteLater() {
      if (!this.$$.ptr) {
        throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
        throwBindingError("Object already scheduled for deletion");
      }
      deletionQueue.push(this);
      if (deletionQueue.length === 1 && delayFunction) {
        delayFunction(flushPendingDeletes);
      }
      this.$$.deleteScheduled = true;
      return this;
    } });
    const symbolDispose = Symbol.dispose;
    if (symbolDispose) {
      proto[symbolDispose] = proto["delete"];
    }
  };
  function ClassHandle() {
  }
  var createNamedFunction = (name, func) => Object.defineProperty(func, "name", { value: name });
  var registeredPointers = {};
  var ensureOverloadTable = (proto, methodName, humanName) => {
    if (void 0 === proto[methodName].overloadTable) {
      var prevFunc = proto[methodName];
      proto[methodName] = function(...args) {
        if (!proto[methodName].overloadTable.hasOwnProperty(args.length)) {
          throwBindingError(`Function '${humanName}' called with an invalid number of arguments (${args.length}) - expects one of (${proto[methodName].overloadTable})!`);
        }
        return proto[methodName].overloadTable[args.length].apply(this, args);
      };
      proto[methodName].overloadTable = [];
      proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
    }
  };
  var exposePublicSymbol = (name, value, numArguments) => {
    if (Module2.hasOwnProperty(name)) {
      if (void 0 === numArguments || void 0 !== Module2[name].overloadTable && void 0 !== Module2[name].overloadTable[numArguments]) {
        throwBindingError(`Cannot register public name '${name}' twice`);
      }
      ensureOverloadTable(Module2, name, name);
      if (Module2[name].overloadTable.hasOwnProperty(numArguments)) {
        throwBindingError(`Cannot register multiple overloads of a function with the same number of arguments (${numArguments})!`);
      }
      Module2[name].overloadTable[numArguments] = value;
    } else {
      Module2[name] = value;
      Module2[name].argCount = numArguments;
    }
  };
  var char_0 = 48;
  var char_9 = 57;
  var makeLegalFunctionName = (name) => {
    name = name.replace(/[^a-zA-Z0-9_]/g, "$");
    var f = name.charCodeAt(0);
    if (f >= char_0 && f <= char_9) {
      return `_${name}`;
    }
    return name;
  };
  function RegisteredClass(name, constructor, instancePrototype, rawDestructor, baseClass, getActualType, upcast, downcast) {
    this.name = name;
    this.constructor = constructor;
    this.instancePrototype = instancePrototype;
    this.rawDestructor = rawDestructor;
    this.baseClass = baseClass;
    this.getActualType = getActualType;
    this.upcast = upcast;
    this.downcast = downcast;
    this.pureVirtualFunctions = [];
  }
  var upcastPointer = (ptr, ptrClass, desiredClass) => {
    while (ptrClass !== desiredClass) {
      if (!ptrClass.upcast) {
        throwBindingError(`Expected null or instance of ${desiredClass.name}, got an instance of ${ptrClass.name}`);
      }
      ptr = ptrClass.upcast(ptr);
      ptrClass = ptrClass.baseClass;
    }
    return ptr;
  };
  var embindRepr = (v) => {
    if (v === null) {
      return "null";
    }
    var t = typeof v;
    if (t === "object" || t === "array" || t === "function") {
      return v.toString();
    } else {
      return "" + v;
    }
  };
  function constNoSmartPtrRawPointerToWireType(destructors, handle) {
    if (handle === null) {
      if (this.isReference) {
        throwBindingError(`null is not a valid ${this.name}`);
      }
      return 0;
    }
    if (!handle.$$) {
      throwBindingError(`Cannot pass "${embindRepr(handle)}" as a ${this.name}`);
    }
    if (!handle.$$.ptr) {
      throwBindingError(`Cannot pass deleted object as a pointer of type ${this.name}`);
    }
    var handleClass = handle.$$.ptrType.registeredClass;
    var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
    return ptr;
  }
  function genericPointerToWireType(destructors, handle) {
    var ptr;
    if (handle === null) {
      if (this.isReference) {
        throwBindingError(`null is not a valid ${this.name}`);
      }
      if (this.isSmartPointer) {
        ptr = this.rawConstructor();
        if (destructors !== null) {
          destructors.push(this.rawDestructor, ptr);
        }
        return ptr;
      } else {
        return 0;
      }
    }
    if (!handle || !handle.$$) {
      throwBindingError(`Cannot pass "${embindRepr(handle)}" as a ${this.name}`);
    }
    if (!handle.$$.ptr) {
      throwBindingError(`Cannot pass deleted object as a pointer of type ${this.name}`);
    }
    if (!this.isConst && handle.$$.ptrType.isConst) {
      throwBindingError(`Cannot convert argument of type ${handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name} to parameter type ${this.name}`);
    }
    var handleClass = handle.$$.ptrType.registeredClass;
    ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
    if (this.isSmartPointer) {
      if (void 0 === handle.$$.smartPtr) {
        throwBindingError("Passing raw pointer to smart pointer is illegal");
      }
      switch (this.sharingPolicy) {
        case 0:
          if (handle.$$.smartPtrType === this) {
            ptr = handle.$$.smartPtr;
          } else {
            throwBindingError(`Cannot convert argument of type ${handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name} to parameter type ${this.name}`);
          }
          break;
        case 1:
          ptr = handle.$$.smartPtr;
          break;
        case 2:
          if (handle.$$.smartPtrType === this) {
            ptr = handle.$$.smartPtr;
          } else {
            var clonedHandle = handle["clone"]();
            ptr = this.rawShare(ptr, Emval.toHandle(() => clonedHandle["delete"]()));
            if (destructors !== null) {
              destructors.push(this.rawDestructor, ptr);
            }
          }
          break;
        default:
          throwBindingError("Unsupported sharing policy");
      }
    }
    return ptr;
  }
  function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
    if (handle === null) {
      if (this.isReference) {
        throwBindingError(`null is not a valid ${this.name}`);
      }
      return 0;
    }
    if (!handle.$$) {
      throwBindingError(`Cannot pass "${embindRepr(handle)}" as a ${this.name}`);
    }
    if (!handle.$$.ptr) {
      throwBindingError(`Cannot pass deleted object as a pointer of type ${this.name}`);
    }
    if (handle.$$.ptrType.isConst) {
      throwBindingError(`Cannot convert argument of type ${handle.$$.ptrType.name} to parameter type ${this.name}`);
    }
    var handleClass = handle.$$.ptrType.registeredClass;
    var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
    return ptr;
  }
  function readPointer(pointer) {
    return this.fromWireType(HEAPU32[pointer >> 2]);
  }
  var downcastPointer = (ptr, ptrClass, desiredClass) => {
    if (ptrClass === desiredClass) {
      return ptr;
    }
    if (void 0 === desiredClass.baseClass) {
      return null;
    }
    var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
    if (rv === null) {
      return null;
    }
    return desiredClass.downcast(rv);
  };
  var registeredInstances = {};
  var getBasestPointer = (class_, ptr) => {
    if (ptr === void 0) {
      throwBindingError("ptr should not be undefined");
    }
    while (class_.baseClass) {
      ptr = class_.upcast(ptr);
      class_ = class_.baseClass;
    }
    return ptr;
  };
  var getInheritedInstance = (class_, ptr) => {
    ptr = getBasestPointer(class_, ptr);
    return registeredInstances[ptr];
  };
  var InternalError = class InternalError extends Error {
    constructor(message) {
      super(message);
      this.name = "InternalError";
    }
  };
  var throwInternalError = (message) => {
    throw new InternalError(message);
  };
  var makeClassHandle = (prototype, record) => {
    if (!record.ptrType || !record.ptr) {
      throwInternalError("makeClassHandle requires ptr and ptrType");
    }
    var hasSmartPtrType = !!record.smartPtrType;
    var hasSmartPtr = !!record.smartPtr;
    if (hasSmartPtrType !== hasSmartPtr) {
      throwInternalError("Both smartPtrType and smartPtr must be specified");
    }
    record.count = { value: 1 };
    return attachFinalizer(Object.create(prototype, { $$: { value: record, writable: true } }));
  };
  function RegisteredPointer_fromWireType(ptr) {
    var rawPointer = this.getPointee(ptr);
    if (!rawPointer) {
      this.destructor(ptr);
      return null;
    }
    var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
    if (void 0 !== registeredInstance) {
      if (0 === registeredInstance.$$.count.value) {
        registeredInstance.$$.ptr = rawPointer;
        registeredInstance.$$.smartPtr = ptr;
        return registeredInstance["clone"]();
      } else {
        var rv = registeredInstance["clone"]();
        this.destructor(ptr);
        return rv;
      }
    }
    function makeDefaultHandle() {
      if (this.isSmartPointer) {
        return makeClassHandle(this.registeredClass.instancePrototype, { ptrType: this.pointeeType, ptr: rawPointer, smartPtrType: this, smartPtr: ptr });
      } else {
        return makeClassHandle(this.registeredClass.instancePrototype, { ptrType: this, ptr });
      }
    }
    var actualType = this.registeredClass.getActualType(rawPointer);
    var registeredPointerRecord = registeredPointers[actualType];
    if (!registeredPointerRecord) {
      return makeDefaultHandle.call(this);
    }
    var toType;
    if (this.isConst) {
      toType = registeredPointerRecord.constPointerType;
    } else {
      toType = registeredPointerRecord.pointerType;
    }
    var dp = downcastPointer(rawPointer, this.registeredClass, toType.registeredClass);
    if (dp === null) {
      return makeDefaultHandle.call(this);
    }
    if (this.isSmartPointer) {
      return makeClassHandle(toType.registeredClass.instancePrototype, { ptrType: toType, ptr: dp, smartPtrType: this, smartPtr: ptr });
    } else {
      return makeClassHandle(toType.registeredClass.instancePrototype, { ptrType: toType, ptr: dp });
    }
  }
  var init_RegisteredPointer = () => {
    Object.assign(RegisteredPointer.prototype, { getPointee(ptr) {
      if (this.rawGetPointee) {
        ptr = this.rawGetPointee(ptr);
      }
      return ptr;
    }, destructor(ptr) {
      this.rawDestructor?.(ptr);
    }, readValueFromPointer: readPointer, fromWireType: RegisteredPointer_fromWireType });
  };
  function RegisteredPointer(name, registeredClass, isReference, isConst, isSmartPointer, pointeeType, sharingPolicy, rawGetPointee, rawConstructor, rawShare, rawDestructor) {
    this.name = name;
    this.registeredClass = registeredClass;
    this.isReference = isReference;
    this.isConst = isConst;
    this.isSmartPointer = isSmartPointer;
    this.pointeeType = pointeeType;
    this.sharingPolicy = sharingPolicy;
    this.rawGetPointee = rawGetPointee;
    this.rawConstructor = rawConstructor;
    this.rawShare = rawShare;
    this.rawDestructor = rawDestructor;
    if (!isSmartPointer && registeredClass.baseClass === void 0) {
      if (isConst) {
        this.toWireType = constNoSmartPtrRawPointerToWireType;
        this.destructorFunction = null;
      } else {
        this.toWireType = nonConstNoSmartPtrRawPointerToWireType;
        this.destructorFunction = null;
      }
    } else {
      this.toWireType = genericPointerToWireType;
    }
  }
  var replacePublicSymbol = (name, value, numArguments) => {
    if (!Module2.hasOwnProperty(name)) {
      throwInternalError("Replacing nonexistent public symbol");
    }
    if (void 0 !== Module2[name].overloadTable && void 0 !== numArguments) {
      Module2[name].overloadTable[numArguments] = value;
    } else {
      Module2[name] = value;
      Module2[name].argCount = numArguments;
    }
  };
  var wasmTableMirror = [];
  var getWasmTableEntry = (funcPtr) => {
    var func = wasmTableMirror[funcPtr];
    if (!func) {
      wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
    }
    return func;
  };
  var embind__requireFunction = (signature, rawFunction, isAsync = false) => {
    signature = AsciiToString(signature);
    function makeDynCaller() {
      var rtn = getWasmTableEntry(rawFunction);
      return rtn;
    }
    var fp = makeDynCaller();
    if (typeof fp != "function") {
      throwBindingError(`unknown function pointer with signature ${signature}: ${rawFunction}`);
    }
    return fp;
  };
  class UnboundTypeError extends Error {
  }
  var getTypeName = (type) => {
    var ptr = ___getTypeName(type);
    var rv = AsciiToString(ptr);
    _free(ptr);
    return rv;
  };
  var throwUnboundTypeError = (message, types) => {
    var unboundTypes = [];
    var seen = {};
    function visit(type) {
      if (seen[type]) {
        return;
      }
      if (registeredTypes[type]) {
        return;
      }
      if (typeDependencies[type]) {
        typeDependencies[type].forEach(visit);
        return;
      }
      unboundTypes.push(type);
      seen[type] = true;
    }
    types.forEach(visit);
    throw new UnboundTypeError(`${message}: ` + unboundTypes.map(getTypeName).join([", "]));
  };
  var whenDependentTypesAreResolved = (myTypes, dependentTypes, getTypeConverters) => {
    myTypes.forEach((type) => typeDependencies[type] = dependentTypes);
    function onComplete(typeConverters2) {
      var myTypeConverters = getTypeConverters(typeConverters2);
      if (myTypeConverters.length !== myTypes.length) {
        throwInternalError("Mismatched type converter count");
      }
      for (var i = 0; i < myTypes.length; ++i) {
        registerType(myTypes[i], myTypeConverters[i]);
      }
    }
    var typeConverters = new Array(dependentTypes.length);
    var unregisteredTypes = [];
    var registered = 0;
    for (let [i, dt] of dependentTypes.entries()) {
      if (registeredTypes.hasOwnProperty(dt)) {
        typeConverters[i] = registeredTypes[dt];
      } else {
        unregisteredTypes.push(dt);
        if (!awaitingDependencies.hasOwnProperty(dt)) {
          awaitingDependencies[dt] = [];
        }
        awaitingDependencies[dt].push(() => {
          typeConverters[i] = registeredTypes[dt];
          ++registered;
          if (registered === unregisteredTypes.length) {
            onComplete(typeConverters);
          }
        });
      }
    }
    if (0 === unregisteredTypes.length) {
      onComplete(typeConverters);
    }
  };
  var __embind_register_class = (rawType, rawPointerType, rawConstPointerType, baseClassRawType, getActualTypeSignature, getActualType, upcastSignature, upcast, downcastSignature, downcast, name, destructorSignature, rawDestructor) => {
    name = AsciiToString(name);
    getActualType = embind__requireFunction(getActualTypeSignature, getActualType);
    upcast &&= embind__requireFunction(upcastSignature, upcast);
    downcast &&= embind__requireFunction(downcastSignature, downcast);
    rawDestructor = embind__requireFunction(destructorSignature, rawDestructor);
    var legalFunctionName = makeLegalFunctionName(name);
    exposePublicSymbol(legalFunctionName, function() {
      throwUnboundTypeError(`Cannot construct ${name} due to unbound types`, [baseClassRawType]);
    });
    whenDependentTypesAreResolved([rawType, rawPointerType, rawConstPointerType], baseClassRawType ? [baseClassRawType] : [], (base) => {
      base = base[0];
      var baseClass;
      var basePrototype;
      if (baseClassRawType) {
        baseClass = base.registeredClass;
        basePrototype = baseClass.instancePrototype;
      } else {
        basePrototype = ClassHandle.prototype;
      }
      var constructor = createNamedFunction(name, function(...args) {
        if (Object.getPrototypeOf(this) !== instancePrototype) {
          throw new BindingError(`Use 'new' to construct ${name}`);
        }
        if (void 0 === registeredClass.constructor_body) {
          throw new BindingError(`${name} has no accessible constructor`);
        }
        var body = registeredClass.constructor_body[args.length];
        if (void 0 === body) {
          throw new BindingError(`Tried to invoke ctor of ${name} with invalid number of parameters (${args.length}) - expected (${Object.keys(registeredClass.constructor_body).toString()}) parameters instead!`);
        }
        return body.apply(this, args);
      });
      var instancePrototype = Object.create(basePrototype, { constructor: { value: constructor } });
      constructor.prototype = instancePrototype;
      var registeredClass = new RegisteredClass(name, constructor, instancePrototype, rawDestructor, baseClass, getActualType, upcast, downcast);
      if (registeredClass.baseClass) {
        registeredClass.baseClass.__derivedClasses ??= [];
        registeredClass.baseClass.__derivedClasses.push(registeredClass);
      }
      var referenceConverter = new RegisteredPointer(name, registeredClass, true, false, false);
      var pointerConverter = new RegisteredPointer(name + "*", registeredClass, false, false, false);
      var constPointerConverter = new RegisteredPointer(name + " const*", registeredClass, false, true, false);
      registeredPointers[rawType] = { pointerType: pointerConverter, constPointerType: constPointerConverter };
      replacePublicSymbol(legalFunctionName, constructor);
      return [referenceConverter, pointerConverter, constPointerConverter];
    });
  };
  var heap32VectorToArray = (count, firstElement) => {
    var array = [];
    for (var i = 0; i < count; i++) {
      array.push(HEAPU32[firstElement + i * 4 >> 2]);
    }
    return array;
  };
  var runDestructors = (destructors) => {
    while (destructors.length) {
      var ptr = destructors.pop();
      var del = destructors.pop();
      del(ptr);
    }
  };
  function usesDestructorStack(argTypes) {
    for (var i = 1; i < argTypes.length; ++i) {
      if (argTypes[i] !== null && argTypes[i].destructorFunction === void 0) {
        return true;
      }
    }
    return false;
  }
  function createJsInvoker(argTypes, isClassMethodFunc, returns, isAsync) {
    var needsDestructorStack = usesDestructorStack(argTypes);
    var argCount = argTypes.length - 2;
    var argsList = [];
    var argsListWired = ["fn"];
    if (isClassMethodFunc) {
      argsListWired.push("thisWired");
    }
    for (var i = 0; i < argCount; ++i) {
      argsList.push(`arg${i}`);
      argsListWired.push(`arg${i}Wired`);
    }
    argsList = argsList.join(",");
    argsListWired = argsListWired.join(",");
    var invokerFnBody = `return function (${argsList}) {
`;
    if (needsDestructorStack) {
      invokerFnBody += "var destructors = [];\n";
    }
    var dtorStack = needsDestructorStack ? "destructors" : "null";
    var args1 = ["humanName", "throwBindingError", "invoker", "fn", "runDestructors", "fromRetWire", "toClassParamWire"];
    if (isClassMethodFunc) {
      invokerFnBody += `var thisWired = toClassParamWire(${dtorStack}, this);
`;
    }
    for (var i = 0; i < argCount; ++i) {
      var argName = `toArg${i}Wire`;
      invokerFnBody += `var arg${i}Wired = ${argName}(${dtorStack}, arg${i});
`;
      args1.push(argName);
    }
    invokerFnBody += (returns || isAsync ? "var rv = " : "") + `invoker(${argsListWired});
`;
    if (needsDestructorStack) {
      invokerFnBody += "runDestructors(destructors);\n";
    } else {
      for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
        var paramName = i === 1 ? "thisWired" : "arg" + (i - 2) + "Wired";
        if (argTypes[i].destructorFunction !== null) {
          invokerFnBody += `${paramName}_dtor(${paramName});
`;
          args1.push(`${paramName}_dtor`);
        }
      }
    }
    if (returns) {
      invokerFnBody += "var ret = fromRetWire(rv);\nreturn ret;\n";
    } else {
    }
    invokerFnBody += "}\n";
    return new Function(args1, invokerFnBody);
  }
  function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc, isAsync) {
    var argCount = argTypes.length;
    if (argCount < 2) {
      throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
    }
    var isClassMethodFunc = argTypes[1] !== null && classType !== null;
    var needsDestructorStack = usesDestructorStack(argTypes);
    var returns = !argTypes[0].isVoid;
    var retType = argTypes[0];
    var instType = argTypes[1];
    var closureArgs = [humanName, throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, retType.fromWireType.bind(retType), instType?.toWireType.bind(instType)];
    for (var i = 2; i < argCount; ++i) {
      var argType = argTypes[i];
      closureArgs.push(argType.toWireType.bind(argType));
    }
    if (!needsDestructorStack) {
      for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
        if (argTypes[i].destructorFunction !== null) {
          closureArgs.push(argTypes[i].destructorFunction);
        }
      }
    }
    let invokerFactory = createJsInvoker(argTypes, isClassMethodFunc, returns, isAsync);
    var invokerFn = invokerFactory(...closureArgs);
    return createNamedFunction(humanName, invokerFn);
  }
  var __embind_register_class_constructor = (rawClassType, argCount, rawArgTypesAddr, invokerSignature, invoker, rawConstructor) => {
    var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
    invoker = embind__requireFunction(invokerSignature, invoker);
    whenDependentTypesAreResolved([], [rawClassType], (classType) => {
      classType = classType[0];
      var humanName = `constructor ${classType.name}`;
      if (void 0 === classType.registeredClass.constructor_body) {
        classType.registeredClass.constructor_body = [];
      }
      if (void 0 !== classType.registeredClass.constructor_body[argCount - 1]) {
        throw new BindingError(`Cannot register multiple constructors with identical number of parameters (${argCount - 1}) for class '${classType.name}'! Overload resolution is currently only performed using the parameter count, not actual type info!`);
      }
      classType.registeredClass.constructor_body[argCount - 1] = () => {
        throwUnboundTypeError(`Cannot construct ${classType.name} due to unbound types`, rawArgTypes);
      };
      whenDependentTypesAreResolved([], rawArgTypes, (argTypes) => {
        argTypes.splice(1, 0, null);
        classType.registeredClass.constructor_body[argCount - 1] = craftInvokerFunction(humanName, argTypes, null, invoker, rawConstructor);
        return [];
      });
      return [];
    });
  };
  var getFunctionName = (signature) => {
    signature = signature.trim();
    const argsIndex = signature.indexOf("(");
    if (argsIndex === -1) return signature;
    return signature.slice(0, argsIndex);
  };
  var __embind_register_class_function = (rawClassType, methodName, argCount, rawArgTypesAddr, invokerSignature, rawInvoker, context, isPureVirtual, isAsync, isNonnullReturn) => {
    var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
    methodName = AsciiToString(methodName);
    methodName = getFunctionName(methodName);
    rawInvoker = embind__requireFunction(invokerSignature, rawInvoker, isAsync);
    whenDependentTypesAreResolved([], [rawClassType], (classType) => {
      classType = classType[0];
      var humanName = `${classType.name}.${methodName}`;
      if (methodName.startsWith("@@")) {
        methodName = Symbol[methodName.substring(2)];
      }
      if (isPureVirtual) {
        classType.registeredClass.pureVirtualFunctions.push(methodName);
      }
      function unboundTypesHandler() {
        throwUnboundTypeError(`Cannot call ${humanName} due to unbound types`, rawArgTypes);
      }
      var proto = classType.registeredClass.instancePrototype;
      var method = proto[methodName];
      if (void 0 === method || void 0 === method.overloadTable && method.className !== classType.name && method.argCount === argCount - 2) {
        unboundTypesHandler.argCount = argCount - 2;
        unboundTypesHandler.className = classType.name;
        proto[methodName] = unboundTypesHandler;
      } else {
        ensureOverloadTable(proto, methodName, humanName);
        proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
      }
      whenDependentTypesAreResolved([], rawArgTypes, (argTypes) => {
        var memberFunction = craftInvokerFunction(humanName, argTypes, classType, rawInvoker, context, isAsync);
        if (void 0 === proto[methodName].overloadTable) {
          memberFunction.argCount = argCount - 2;
          proto[methodName] = memberFunction;
        } else {
          proto[methodName].overloadTable[argCount - 2] = memberFunction;
        }
        return [];
      });
      return [];
    });
  };
  var emval_freelist = [];
  var emval_handles = [0, 1, , 1, null, 1, true, 1, false, 1];
  var __emval_decref = (handle) => {
    if (handle > 9 && 0 === --emval_handles[handle + 1]) {
      var value = emval_handles[handle];
      emval_handles[handle] = void 0;
      emval_freelist.push(handle);
    }
  };
  var Emval = { toValue: (handle) => {
    if (!handle) {
      throwBindingError(`Cannot use deleted val. handle = ${handle}`);
    }
    return emval_handles[handle];
  }, toHandle: (value) => {
    switch (value) {
      case void 0:
        return 2;
      case null:
        return 4;
      case true:
        return 6;
      case false:
        return 8;
      default: {
        const handle = emval_freelist.pop() || emval_handles.length;
        emval_handles[handle] = value;
        emval_handles[handle + 1] = 1;
        return handle;
      }
    }
  } };
  var EmValType = { name: "emscripten::val", fromWireType: (handle) => {
    var rv = Emval.toValue(handle);
    __emval_decref(handle);
    return rv;
  }, toWireType: (destructors, value) => Emval.toHandle(value), readValueFromPointer: readPointer, destructorFunction: null };
  var __embind_register_emval = (rawType) => registerType(rawType, EmValType);
  var floatReadValueFromPointer = (name, width) => {
    switch (width) {
      case 4:
        return function(pointer) {
          return this.fromWireType(HEAPF32[pointer >> 2]);
        };
      case 8:
        return function(pointer) {
          return this.fromWireType(HEAPF64[pointer >> 3]);
        };
      default:
        throw new TypeError(`invalid float width (${width}): ${name}`);
    }
  };
  var __embind_register_float = (rawType, name, size) => {
    name = AsciiToString(name);
    registerType(rawType, { name, fromWireType: (value) => value, toWireType: (destructors, value) => value, readValueFromPointer: floatReadValueFromPointer(name, size), destructorFunction: null });
  };
  var __embind_register_integer = (primitiveType, name, size, minRange, maxRange) => {
    name = AsciiToString(name);
    const isUnsignedType = minRange === 0;
    let fromWireType = (value) => value;
    if (isUnsignedType) {
      var bitshift = 32 - 8 * size;
      fromWireType = (value) => value << bitshift >>> bitshift;
      maxRange = fromWireType(maxRange);
    }
    registerType(primitiveType, { name, fromWireType, toWireType: (destructors, value) => value, readValueFromPointer: integerReadValueFromPointer(name, size, minRange !== 0), destructorFunction: null });
  };
  var __embind_register_memory_view = (rawType, dataTypeIndex, name) => {
    var typeMapping = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array];
    var TA = typeMapping[dataTypeIndex];
    function decodeMemoryView(handle) {
      var size = HEAPU32[handle >> 2];
      var data = HEAPU32[handle + 4 >> 2];
      return new TA(HEAP8.buffer, data, size);
    }
    name = AsciiToString(name);
    registerType(rawType, { name, fromWireType: decodeMemoryView, readValueFromPointer: decodeMemoryView }, { ignoreDuplicateRegistrations: true });
  };
  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
      var u = str.codePointAt(i);
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 192 | u >> 6;
        heap[outIdx++] = 128 | u & 63;
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 224 | u >> 12;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
      } else {
        if (outIdx + 3 >= endIdx) break;
        heap[outIdx++] = 240 | u >> 18;
        heap[outIdx++] = 128 | u >> 12 & 63;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
        i++;
      }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx;
  };
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
  var lengthBytesUTF8 = (str) => {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var c = str.charCodeAt(i);
      if (c <= 127) {
        len++;
      } else if (c <= 2047) {
        len += 2;
      } else if (c >= 55296 && c <= 57343) {
        len += 4;
        ++i;
      } else {
        len += 3;
      }
    }
    return len;
  };
  var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead;
    if (ignoreNul) return maxIdx;
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
    return idx;
  };
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
    if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
      return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
    }
    var str = "";
    while (idx < endPtr) {
      var u0 = heapOrArray[idx++];
      if (!(u0 & 128)) {
        str += String.fromCharCode(u0);
        continue;
      }
      var u1 = heapOrArray[idx++] & 63;
      if ((u0 & 224) == 192) {
        str += String.fromCharCode((u0 & 31) << 6 | u1);
        continue;
      }
      var u2 = heapOrArray[idx++] & 63;
      if ((u0 & 240) == 224) {
        u0 = (u0 & 15) << 12 | u1 << 6 | u2;
      } else {
        u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
      }
      if (u0 < 65536) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 65536;
        str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
      }
    }
    return str;
  };
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "";
  var __embind_register_std_string = (rawType, name) => {
    name = AsciiToString(name);
    var stdStringIsUTF8 = true;
    registerType(rawType, { name, fromWireType(value) {
      var length = HEAPU32[value >> 2];
      var payload = value + 4;
      var str;
      if (stdStringIsUTF8) {
        str = UTF8ToString(payload, length, true);
      } else {
        str = "";
        for (var i = 0; i < length; ++i) {
          str += String.fromCharCode(HEAPU8[payload + i]);
        }
      }
      _free(value);
      return str;
    }, toWireType(destructors, value) {
      if (value instanceof ArrayBuffer) {
        value = new Uint8Array(value);
      }
      var length;
      var valueIsOfTypeString = typeof value == "string";
      if (!(valueIsOfTypeString || ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT == 1)) {
        throwBindingError("Cannot pass non-string to std::string");
      }
      if (stdStringIsUTF8 && valueIsOfTypeString) {
        length = lengthBytesUTF8(value);
      } else {
        length = value.length;
      }
      var base = _malloc(4 + length + 1);
      var ptr = base + 4;
      HEAPU32[base >> 2] = length;
      if (valueIsOfTypeString) {
        if (stdStringIsUTF8) {
          stringToUTF8(value, ptr, length + 1);
        } else {
          for (var i = 0; i < length; ++i) {
            var charCode = value.charCodeAt(i);
            if (charCode > 255) {
              _free(base);
              throwBindingError("String has UTF-16 code units that do not fit in 8 bits");
            }
            HEAPU8[ptr + i] = charCode;
          }
        }
      } else {
        HEAPU8.set(value, ptr);
      }
      if (destructors !== null) {
        destructors.push(_free, base);
      }
      return base;
    }, readValueFromPointer: readPointer, destructorFunction(ptr) {
      _free(ptr);
    } });
  };
  var UTF16Decoder = globalThis.TextDecoder ? new TextDecoder("utf-16le") : void 0;
  var UTF16ToString = (ptr, maxBytesToRead, ignoreNul) => {
    var idx = ptr >> 1;
    var endIdx = findStringEnd(HEAPU16, idx, maxBytesToRead / 2, ignoreNul);
    if (endIdx - idx > 16 && UTF16Decoder) return UTF16Decoder.decode(HEAPU16.subarray(idx, endIdx));
    var str = "";
    for (var i = idx; i < endIdx; ++i) {
      var codeUnit = HEAPU16[i];
      str += String.fromCharCode(codeUnit);
    }
    return str;
  };
  var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
    maxBytesToWrite ??= 2147483647;
    if (maxBytesToWrite < 2) return 0;
    maxBytesToWrite -= 2;
    var startPtr = outPtr;
    var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
    for (var i = 0; i < numCharsToWrite; ++i) {
      var codeUnit = str.charCodeAt(i);
      HEAP16[outPtr >> 1] = codeUnit;
      outPtr += 2;
    }
    HEAP16[outPtr >> 1] = 0;
    return outPtr - startPtr;
  };
  var lengthBytesUTF16 = (str) => str.length * 2;
  var UTF32ToString = (ptr, maxBytesToRead, ignoreNul) => {
    var str = "";
    var startIdx = ptr >> 2;
    for (var i = 0; !(i >= maxBytesToRead / 4); i++) {
      var utf32 = HEAPU32[startIdx + i];
      if (!utf32 && !ignoreNul) break;
      str += String.fromCodePoint(utf32);
    }
    return str;
  };
  var stringToUTF32 = (str, outPtr, maxBytesToWrite) => {
    maxBytesToWrite ??= 2147483647;
    if (maxBytesToWrite < 4) return 0;
    var startPtr = outPtr;
    var endPtr = startPtr + maxBytesToWrite - 4;
    for (var i = 0; i < str.length; ++i) {
      var codePoint = str.codePointAt(i);
      if (codePoint > 65535) {
        i++;
      }
      HEAP32[outPtr >> 2] = codePoint;
      outPtr += 4;
      if (outPtr + 4 > endPtr) break;
    }
    HEAP32[outPtr >> 2] = 0;
    return outPtr - startPtr;
  };
  var lengthBytesUTF32 = (str) => {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var codePoint = str.codePointAt(i);
      if (codePoint > 65535) {
        i++;
      }
      len += 4;
    }
    return len;
  };
  var __embind_register_std_wstring = (rawType, charSize, name) => {
    name = AsciiToString(name);
    var decodeString, encodeString, lengthBytesUTF;
    if (charSize === 2) {
      decodeString = UTF16ToString;
      encodeString = stringToUTF16;
      lengthBytesUTF = lengthBytesUTF16;
    } else {
      decodeString = UTF32ToString;
      encodeString = stringToUTF32;
      lengthBytesUTF = lengthBytesUTF32;
    }
    registerType(rawType, { name, fromWireType: (value) => {
      var length = HEAPU32[value >> 2];
      var str = decodeString(value + 4, length * charSize, true);
      _free(value);
      return str;
    }, toWireType: (destructors, value) => {
      if (!(typeof value == "string")) {
        throwBindingError(`Cannot pass non-string to C++ string type ${name}`);
      }
      var length = lengthBytesUTF(value);
      var ptr = _malloc(4 + length + charSize);
      HEAPU32[ptr >> 2] = length / charSize;
      encodeString(value, ptr + 4, length + charSize);
      if (destructors !== null) {
        destructors.push(_free, ptr);
      }
      return ptr;
    }, readValueFromPointer: readPointer, destructorFunction(ptr) {
      _free(ptr);
    } });
  };
  var __embind_register_void = (rawType, name) => {
    name = AsciiToString(name);
    registerType(rawType, { isVoid: true, name, fromWireType: () => void 0, toWireType: (destructors, o) => void 0 });
  };
  var getHeapMax = () => 2147483648;
  var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
  var growMemory = (size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength;
    var pages = (size - oldHeapSize + 65535) / 65536 | 0;
    try {
      wasmMemory.grow(pages);
      updateMemoryViews();
      return 1;
    } catch (e) {
    }
  };
  var _emscripten_resize_heap = (requestedSize) => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize) {
      return false;
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
      var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
      var replacement = growMemory(newSize);
      if (replacement) {
        return true;
      }
    }
    return false;
  };
  init_ClassHandle();
  init_RegisteredPointer();
  {
    if (Module2["noExitRuntime"]) noExitRuntime = Module2["noExitRuntime"];
    if (Module2["print"]) out = Module2["print"];
    if (Module2["printErr"]) err = Module2["printErr"];
    if (Module2["wasmBinary"]) wasmBinary = Module2["wasmBinary"];
    if (Module2["arguments"]) arguments_ = Module2["arguments"];
    if (Module2["thisProgram"]) thisProgram = Module2["thisProgram"];
    if (Module2["preInit"]) {
      if (typeof Module2["preInit"] == "function") Module2["preInit"] = [Module2["preInit"]];
      while (Module2["preInit"].length > 0) {
        Module2["preInit"].shift()();
      }
    }
  }
  var ___getTypeName, _malloc, _free, memory, __indirect_function_table, wasmMemory, wasmTable;
  function assignWasmExports(wasmExports2) {
    ___getTypeName = wasmExports2["s"];
    _malloc = Module2["_malloc"] = wasmExports2["t"];
    _free = Module2["_free"] = wasmExports2["u"];
    memory = wasmMemory = Module2["wasmMemory"] = wasmExports2["p"];
    __indirect_function_table = wasmTable = wasmExports2["r"];
  }
  var wasmImports = { g: ___cxa_throw, m: __abort_js, f: __embind_register_bigint, k: __embind_register_bool, i: __embind_register_class, h: __embind_register_class_constructor, c: __embind_register_class_function, o: __embind_register_emval, e: __embind_register_float, b: __embind_register_integer, a: __embind_register_memory_view, j: __embind_register_std_string, d: __embind_register_std_wstring, l: __embind_register_void, n: _emscripten_resize_heap };
  function run() {
    preRun();
    function doRun() {
      Module2["calledRun"] = true;
      if (ABORT) return;
      initRuntime();
      readyPromiseResolve?.(Module2);
      Module2["onRuntimeInitialized"]?.();
      postRun();
    }
    if (Module2["setStatus"]) {
      Module2["setStatus"]("Running...");
      setTimeout(() => {
        setTimeout(() => Module2["setStatus"](""), 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
  }
  var wasmExports;
  wasmExports = await createWasm();
  run();
  if (runtimeInitialized) {
    moduleRtn = Module2;
  } else {
    moduleRtn = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
  }
  ;
  return moduleRtn;
}
var audio_processor_default = Module;

// public/worklets/track-processor.js
if (typeof URL === "undefined") {
  globalThis.URL = class URL {
    constructor() {
    }
  };
}
var WorkletSharedRingBuffer = class {
  constructor(capacity, sab) {
    this.capacity = capacity;
    this.sab = sab;
    this.state = new Int32Array(sab, 0, 2);
    this.buffer = new Float32Array(sab, 8, capacity);
    this.WRITE_PTR = 0;
    this.READ_PTR = 1;
  }
  getAvailableRead() {
    const writePtr = Atomics.load(this.state, this.WRITE_PTR);
    const readPtr = Atomics.load(this.state, this.READ_PTR);
    return writePtr - readPtr;
  }
  pull(output) {
    const writePtr = Atomics.load(this.state, this.WRITE_PTR);
    const readPtr = Atomics.load(this.state, this.READ_PTR);
    const available = writePtr - readPtr;
    if (available <= 0) return 0;
    const toRead = Math.min(output.length, available);
    const readIndex = readPtr % this.capacity;
    const firstChunk = Math.min(toRead, this.capacity - readIndex);
    output.set(this.buffer.subarray(readIndex, readIndex + firstChunk), 0);
    if (firstChunk < toRead) {
      output.set(this.buffer.subarray(0, toRead - firstChunk), firstChunk);
    }
    Atomics.store(this.state, this.READ_PTR, readPtr + toRead);
    return toRead;
  }
};
var TrackProcessor = class extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = null;
    this.playhead = 0;
    this.playing = false;
    this.playbackRate = 1;
    this.keyLock = false;
    this.framesSinceLastReport = 0;
    this.wasmModule = null;
    this.resampler = null;
    this.bungee = null;
    this.inputPtr = null;
    this.outputPtr = null;
    this.inputCapacity = 0;
    this.outputCapacity = 0;
    this.inputHeap = null;
    this.outputHeap = null;
    this.bufferLength = 0;
    this.trackSampleRate = sampleRate;
    this.ringBuffer = null;
    this.localBuffer = null;
    this.localCapacity = 4194304;
    this.localMask = this.localCapacity - 1;
    this.expectedPullFrame = 0;
    this.isStreaming = false;
    this.fullBuffer = null;
    this.nudgeTarget = 0;
    this.seekId = 0;
    this.isSeekingStream = false;
    this.port.onmessage = async (e) => {
      if (e.data.type === "INIT_WASM") {
        try {
          this.wasmModule = await audio_processor_default();
          this.resampler = new this.wasmModule.Resampler();
          this.bungee = new this.wasmModule.BungeeStretcher(sampleRate);
          this.port.postMessage({ type: "WASM_READY" });
        } catch (err) {
          console.error("Failed to initialize WASM module in track-processor:", err);
          this.port.postMessage({ type: "WASM_ERROR", error: err.message });
        }
      } else if (e.data.type === "LOAD_TRACK") {
        this.isStreaming = true;
        this.fullBuffer = null;
        this.ringBuffer = new WorkletSharedRingBuffer(e.data.capacity, e.data.sharedBuffer);
        this.bufferLength = e.data.bufferLength || 0;
        this.trackSampleRate = e.data.trackSampleRate || sampleRate;
        this.localBuffer = new Float32Array(this.localCapacity * 2);
        this.playhead = 0;
        this.expectedPullFrame = 0;
        this.isSeekingStream = false;
        if (this.bungee) {
          this.bungee.reset();
          this.bungeeFramesToFeed = void 0;
          this.bungeeReadPointer = void 0;
        }
        console.log("TrackProcessor: LOAD_TRACK stream connected.");
      } else if (e.data.type === "LOAD_TRACK_FULL") {
        this.isStreaming = false;
        this.ringBuffer = null;
        this.localBuffer = null;
        this.fullBuffer = [e.data.leftChannel, e.data.rightChannel];
        this.bufferLength = e.data.bufferLength || 0;
        this.trackSampleRate = e.data.trackSampleRate || sampleRate;
        this.playhead = 0;
        this.isSeekingStream = false;
        if (this.bungee) {
          this.bungee.reset();
          this.bungeeFramesToFeed = void 0;
          this.bungeeReadPointer = void 0;
        }
        console.log("TrackProcessor: LOAD_TRACK_FULL static buffer connected.");
      } else if (e.data.type === "PLAY") {
        this.playing = true;
      } else if (e.data.type === "STOP") {
        this.playing = false;
      } else if (e.data.type === "SEEK") {
        if (this.isStreaming && this.ringBuffer) {
          this.seekId = (this.seekId || 0) + 1;
          this.isSeekingStream = true;
          this.playhead = e.data.value * this.trackSampleRate;
          this.expectedPullFrame = this.playhead;
          Atomics.store(this.ringBuffer.state, this.ringBuffer.WRITE_PTR, 0);
          Atomics.store(this.ringBuffer.state, this.ringBuffer.READ_PTR, 0);
          this.port.postMessage({ type: "SEEK_STREAM", frame: this.playhead, seekId: this.seekId });
          if (this.bungee) {
            this.bungee.reset();
            this.bungeeFramesToFeed = void 0;
          }
          if (this.resampler) this.resampler.reset();
        } else if (!this.isStreaming && this.fullBuffer) {
          this.playhead = e.data.value * this.trackSampleRate;
          if (this.bungee) {
            this.bungee.reset();
            this.bungeeFramesToFeed = void 0;
          }
          if (this.resampler) this.resampler.reset();
        }
      } else if (e.data.type === "SEEK_ACK") {
        if (this.seekId === e.data.seekId) {
          this.isSeekingStream = false;
        }
      } else if (e.data.path === "/faust/pitch") {
        this.playbackRate = e.data.value;
      } else if (e.data.type === "SET_KEY_LOCK") {
        if (this.keyLock !== e.data.value) {
          this.keyLock = e.data.value;
          if (this.bungee) {
            this.bungee.reset();
            this.bungeeFramesToFeed = void 0;
            this.bungeeReadPointer = void 0;
          }
        }
      } else if (e.data.type === "NUDGE") {
        this.nudgeTarget += e.data.frames;
      }
    };
  }
  ensureWasmBuffers(inputFrames, outputFrames) {
    if (!this.wasmModule) return false;
    let recreateInputHeap = false;
    let recreateOutputHeap = false;
    const requiredInputBytes = inputFrames * 2 * 4;
    if (!this.inputPtr || this.inputCapacity < requiredInputBytes) {
      if (this.inputPtr) this.wasmModule._free(this.inputPtr);
      this.inputPtr = this.wasmModule._malloc(requiredInputBytes);
      this.inputCapacity = requiredInputBytes;
      recreateInputHeap = true;
    }
    const requiredOutputBytes = outputFrames * 2 * 4;
    if (!this.outputPtr || this.outputCapacity < requiredOutputBytes) {
      if (this.outputPtr) this.wasmModule._free(this.outputPtr);
      this.outputPtr = this.wasmModule._malloc(requiredOutputBytes);
      this.outputCapacity = requiredOutputBytes;
      recreateOutputHeap = true;
    }
    const memoryBuffer = this.wasmModule.HEAPF32 ? this.wasmModule.HEAPF32.buffer : this.wasmModule.wasmMemory.buffer;
    if (recreateInputHeap || !this.inputHeap || this.inputHeap.buffer !== memoryBuffer) {
      this.inputHeap = new Float32Array(memoryBuffer, this.inputPtr, this.inputCapacity / 4);
    }
    if (recreateOutputHeap || !this.outputHeap || this.outputHeap.buffer !== memoryBuffer) {
      this.outputHeap = new Float32Array(memoryBuffer, this.outputPtr, this.outputCapacity / 4);
    }
    return true;
  }
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !this.wasmModule) return true;
    const channelCount = output.length;
    if (!this.playing || !this.isStreaming && !this.fullBuffer || this.isStreaming && !this.ringBuffer || channelCount === 0 || !this.resampler && !this.bungee) {
      for (let channel = 0; channel < channelCount; channel++) {
        output[channel].fill(0);
      }
      return true;
    }
    const bufferLength = this.bufferLength;
    const outputFrames = output[0].length;
    if (this.playhead >= bufferLength) {
      this.playing = false;
      for (let channel = 0; channel < channelCount; channel++) {
        output[channel].fill(0);
      }
      return true;
    }
    if (this.isStreaming && !this.isSeekingStream) {
      const maxAhead = this.localCapacity - 8192;
      const framesAhead = this.expectedPullFrame - this.playhead;
      let maxPullFrames = 4096;
      if (framesAhead + maxPullFrames > maxAhead) {
        maxPullFrames = Math.max(0, Math.floor(maxAhead - framesAhead));
      }
      if (maxPullFrames > 0) {
        const tempBuffer = new Float32Array(maxPullFrames * 2);
        const pulledSamples = this.ringBuffer.pull(tempBuffer);
        const pulledFrames = pulledSamples / 2;
        for (let i = 0; i < pulledFrames; i++) {
          const globalFrame = Math.floor(this.expectedPullFrame + i);
          const idx = (globalFrame & this.localMask) * 2;
          this.localBuffer[idx] = tempBuffer[i * 2];
          this.localBuffer[idx + 1] = tempBuffer[i * 2 + 1];
        }
        this.expectedPullFrame += pulledFrames;
      }
    }
    const getFrame = (idx) => {
      idx = Math.floor(idx);
      if (idx < 0 || idx >= bufferLength) return [0, 0];
      if (this.isStreaming) {
        if (idx < this.expectedPullFrame - this.localCapacity || idx >= this.expectedPullFrame) return [0, 0];
        const lidx = (idx & this.localMask) * 2;
        return [this.localBuffer[lidx], this.localBuffer[lidx + 1]];
      } else {
        return [this.fullBuffer[0][idx], this.fullBuffer[1][idx]];
      }
    };
    let ratio = Math.max(0.1, this.playbackRate);
    const sampleRateRatio = (this.trackSampleRate || sampleRate) / sampleRate;
    ratio *= sampleRateRatio;
    if (this.nudgeTarget !== 0) {
      const nudgeRate = 0.05 * ratio;
      const maxNudgeFramesPerBlock = outputFrames * nudgeRate;
      if (this.nudgeTarget > 0) {
        const framesToAbsorb = Math.min(this.nudgeTarget, maxNudgeFramesPerBlock);
        ratio += framesToAbsorb / outputFrames;
        this.nudgeTarget -= framesToAbsorb;
      } else {
        const framesToAbsorb = Math.min(-this.nudgeTarget, maxNudgeFramesPerBlock);
        if (ratio - framesToAbsorb / outputFrames >= 0.1) {
          ratio -= framesToAbsorb / outputFrames;
          this.nudgeTarget += framesToAbsorb;
        } else {
          const allowedAbsorb = (ratio - 0.1) * outputFrames;
          ratio = 0.1;
          this.nudgeTarget += allowedAbsorb;
        }
      }
      if (Math.abs(this.nudgeTarget) < 1e-3) this.nudgeTarget = 0;
    }
    if (this.keyLock && this.bungee) {
      if (this.bungeeFramesToFeed === void 0) {
        this.bungeeFramesToFeed = 2048 + 512 + Math.ceil(outputFrames * ratio);
        this.bungeeReadPointer = this.playhead;
      }
      let framesAvailable = Math.floor(bufferLength - this.bungeeReadPointer);
      const inputFrames = Math.min(this.bungeeFramesToFeed, framesAvailable);
      const framesToPush = Math.max(0, inputFrames);
      if (framesToPush > 0) {
        this.ensureWasmBuffers(framesToPush, outputFrames);
        for (let i = 0; i < framesToPush; i++) {
          const idx = Math.floor(this.bungeeReadPointer) + i;
          const frame = getFrame(idx);
          this.inputHeap[i * 2] = frame[0];
          this.inputHeap[i * 2 + 1] = frame[1];
        }
      } else {
        this.ensureWasmBuffers(0, outputFrames);
      }
      const consumed = this.bungee.process_audio(this.inputPtr, framesToPush, this.outputPtr, outputFrames, ratio, 1);
      this.bungeeFramesToFeed = consumed;
      this.bungeeReadPointer += framesToPush;
      for (let i = 0; i < outputFrames; i++) {
        if (channelCount > 0) {
          let val = this.outputHeap[i * 2];
          if (val !== val) val = 0;
          else if (val > 1) val = 1;
          else if (val < -1) val = -1;
          output[0][i] = val;
        }
        if (channelCount > 1) {
          let val = this.outputHeap[i * 2 + 1];
          if (val !== val) val = 0;
          else if (val > 1) val = 1;
          else if (val < -1) val = -1;
          output[1][i] = val;
        }
      }
      this.playhead = Math.floor(this.playhead) + consumed;
    } else if (this.resampler) {
      const CROSSINGS = 32;
      const baseFrames = Math.ceil(outputFrames * ratio);
      const inputFramesNeeded = baseFrames + CROSSINGS * 2;
      if (this.playhead >= bufferLength) return true;
      this.ensureWasmBuffers(inputFramesNeeded, outputFrames);
      let startIdx = Math.floor(this.playhead) - CROSSINGS;
      for (let i = 0; i < inputFramesNeeded; i++) {
        const idx = startIdx + i;
        const frame = getFrame(idx);
        this.inputHeap[i * 2] = frame[0];
        this.inputHeap[i * 2 + 1] = frame[1];
      }
      const consumed = this.resampler.process_audio_simd(this.inputPtr, inputFramesNeeded, this.outputPtr, outputFrames, ratio);
      for (let i = 0; i < outputFrames; i++) {
        if (channelCount > 0) {
          let val = this.outputHeap[i * 2];
          if (val !== val || val > 10 || val < -10) val = 0;
          output[0][i] = val;
        }
        if (channelCount > 1) {
          let val = this.outputHeap[i * 2 + 1];
          if (val !== val || val > 10 || val < -10) val = 0;
          output[1][i] = val;
        }
      }
      this.playhead = Math.floor(this.playhead) + consumed;
    }
    this.framesSinceLastReport += outputFrames;
    if (this.framesSinceLastReport >= sampleRate / 120) {
      this.port.postMessage({ type: "TIME_UPDATE", value: this.playhead / this.trackSampleRate });
      this.framesSinceLastReport = 0;
    }
    return true;
  }
};
registerProcessor("track-processor", TrackProcessor);
