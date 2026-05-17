let intervalId: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e) => {
  if (e.data === 'start') {
    if (!intervalId) {
      intervalId = setInterval(() => {
        self.postMessage('tick');
      }, 50);
    }
  } else if (e.data === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
