// register-sw.js for VR Explorer Pro
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: '/Explorer6/' });
      console.log('VR Explorer Pro: serviceWorker registered.', reg);
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            console.log('VR Explorer Pro: SW state changed to', newWorker.state);
          });
        }
      });
    } catch (err) {
      console.error('VR Explorer Pro: SW registration failed:', err);
    }
  });
}
