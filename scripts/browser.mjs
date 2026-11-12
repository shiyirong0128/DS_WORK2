import { spawn } from 'node:child_process';

export async function startBrowser(profile) {
  const process = spawn(globalThis.process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-extensions',
    '--disable-default-apps', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let ws;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let log = '';
      const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000);
      process.stderr.on('data', chunk => {
        log += chunk;
        const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      process.on('error', error => { clearTimeout(timer); reject(error); });
      process.on('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited: ${code}`)); });
    });
    const target = await (await fetch(`http://${new URL(endpoint).host}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    let id = 0;
    const pending = new Map();
    const errors = [], requests = [];
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      clearTimeout(task.timer);
      message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(key, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const navigate = async url => {
      // A hash-only Page.navigate can keep the old document and skip startup scripts.
      // Each verification navigation models opening the file afresh.
      await call('Page.navigate', { url: 'about:blank' });
      await call('Page.navigate', { url });
      const expected = new URL(url);
      if (expected.pathname.endsWith('/complete.html')) expected.pathname = expected.pathname.replace(/complete.html$/, 'index.html');
      const deadline = Date.now() + 5000;
      let ready = false;
      while (Date.now() < deadline) {
        try {
          ready = await evaluate(`location.pathname === ${JSON.stringify(expected.pathname)} && document.readyState === 'complete' && !!document.querySelector('.console') && (!document.body.dataset.interactive || !document.querySelector('.actions [data-action="restart"]').disabled)`);
          if (ready) break;
        } catch { /* Navigation may replace the execution context. */ }
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      if (!ready) throw new Error(`Navigation not ready: ${url}`);
      await evaluate('document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))');
    };
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    return {
      call, evaluate, navigate, errors, requests,
      close: async () => {
        try { await call('Browser.close'); } catch { /* Already closed. */ }
        ws.close();
        if (process.exitCode === null) process.kill();
      },
    };
  } catch (error) {
    if (ws) ws.close();
    process.kill();
    throw error;
  }
}
