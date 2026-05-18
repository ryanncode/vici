import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });
  
  page.on('pageerror', err => {
    console.error(`[Browser Page Error] ${err.toString()}`);
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    
    // Evaluate loadTrack
    await page.evaluate(async () => {
      document.body.click();
      await new Promise(r => setTimeout(r, 100)); // wait for init
      try {
        const url = 'https://raw.githubusercontent.com/mdn/webaudio-examples/master/audio-analyser/viper.mp3';
        // wait for AudioEngine to be ready
        await window.AudioEngine?.getInstance().init();
        await window.AudioEngine?.getInstance().deckA.loadTrack(url);
        console.log("Track load finished");
      } catch (e) {
        console.error("Track load failed: ", e);
      }
    });
    
    await page.evaluate(() => new Promise(r => setTimeout(r, 2000)));
    
    console.log("Finished waiting");
  } catch (e) {
    console.error("Failed to test page:", e);
  } finally {
    await browser.close();
  }
})();
