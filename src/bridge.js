// Connects the page to the local controller. Only active with ?bridge=1.
const params = new URLSearchParams(location.search);
if (params.get('bridge') === '1' && window.battle) {
  let delay = 500;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n | 0));
  const connect = () => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => { delay = 500; };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }       // treat every payload as untrusted
      if (m?.type === 'spawn' && (m.team === 0 || m.team === 1)) window.battle.spawn(m.team, String(m.name ?? '').slice(0, 32), clamp(m.count, 1, 3));
      else if (m?.type === 'support') window.battle.support(3);
    };
    ws.onclose = () => { setTimeout(connect, delay); delay = Math.min(delay * 2, 10000); };
  };
  connect();
}
