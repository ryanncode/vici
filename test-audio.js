import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.text()}`);
  });

  try {
    await page.goto('http://localhost:5173/dsp-test.html', { waitUntil: 'networkidle0' });
    
    // We have dsp-test.html. Let's see if it works.
    await page.evaluate(async () => {
      // Create audio context
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule('/worklets/track-processor.bundle.js');
      
      const node = new AudioWorkletNode(ctx, 'track-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      
      node.port.postMessage({ type: 'INIT_WASM' });
      
      await new Promise(r => setTimeout(r, 500));
      
      // Load a static buffer
      const left = new Float32Array(44100);
      const right = new Float32Array(44100);
      for(let i=0; i<44100; i++) { left[i] = 1.0; right[i] = 1.0; } // DC offset
      
      node.port.postMessage({
        type: 'LOAD_TRACK_FULL',
        leftChannel: left,
        rightChannel: right,
        bufferLength: 44100,
        trackSampleRate: 44100
      });
      
      node.port.postMessage({ type: 'PLAY' });
      
      // analyze output
      const analyzer = ctx.createAnalyser();
      node.connect(analyzer);
      analyzer.connect(ctx.destination);
      
      await ctx.resume();
      
      await new Promise(r => setTimeout(r, 500));
      
      const data = new Float32Array(analyzer.fftSize);
      analyzer.getFloatTimeDomainData(data);
      
      let hasAudio = false;
      for(let i=0; i<data.length; i++) {
        if(Math.abs(data[i]) > 0.01) { hasAudio = true; break; }
      }
      console.log("TEST RESULT HAS AUDIO: " + hasAudio);
      console.log("FIRST SAMPLES: " + data[0] + ", " + data[1] + ", " + data[2]);
    });
    
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
