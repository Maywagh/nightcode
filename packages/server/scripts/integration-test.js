(async function(){
  const base = 'http://localhost:3000';
  console.log('Testing /ide/inline');
  try {
    const r = await fetch(base + '/ide/inline', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ code: "function add(a,b){return a + b\n}", cursor: 25, model: 'sarvam-105b' }) });
    console.log('status', r.status);
    const j = await r.json();
    console.log('inline items', j.items && j.items.length);
  } catch (e) { console.error('inline failed', e); }

  console.log('Testing /ide/lsp (complete)');
  try {
    const r2 = await fetch(base + '/ide/lsp', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'complete', code: 'function greet(){ console.log("hi")\n}', cursor: 10, model: 'sarvam-105b' }) });
    console.log('status', r2.status);
    if (r2.body) {
      const reader = r2.body.getReader();
      const dec = new TextDecoder();
      let out='';
      while(true){
        const { value, done } = await reader.read(); if (done) break; out += dec.decode(value);
      }
      console.log('lsp stream length', out.length);
    } else {
      const j2 = await r2.json(); console.log('lsp response', j2);
    }
  } catch (e) { console.error('lsp failed', e); }
})();
