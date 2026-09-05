import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Yuktiio — Web IDE</title>
  <style>
    html,body,#container { height: 100%; margin: 0; background: #0b0b0f; color: #fff; }
    #toolbar { height: 48px; display:flex; align-items:center; gap:12px; padding:8px; background: linear-gradient(90deg, #0a0a0f, #07070b); }
    button { background: #3b82f6; color: white; border: none; padding:8px 12px; border-radius:6px; cursor:pointer; }
    #status { margin-left: auto; opacity: 0.8; }
    input { background: #0e0e12; color: #fff; border: 1px solid #222; padding:4px 6px; border-radius:4px }
  </style>
</head>
<body>
  <div id="container">
    <div id="toolbar">
      <button id="btn-complete">Complete (Ctrl+Space)</button>
      <button id="btn-run">Run (console)</button>
      <button id="btn-save">Save</button>
      <div id="status">Model: sarvam-105b</div>
    </div>
    <div style="display:flex; height: calc(100% - 56px);">
      <div id="sidebar" style="width:280px; border-right:1px solid #111; padding:8px; box-sizing:border-box; overflow:auto;">
        <div style="font-weight:bold; margin-bottom:8px">Explorer</div>
        <div id="file-list"></div>
      </div>
      <div style="flex:1; display:flex; flex-direction:column;">
        <div id="editor" style="flex:1;"></div>
        <div id="bottom" style="height:120px; border-top:1px solid #111; padding:8px; box-sizing:border-box; display:flex; gap:8px;">
          <div style="flex:1">
            <div style="font-weight:bold">PR Assistant / Code Actions</div>
            <div style="display:flex; gap:8px; margin-top:6px;"><button id="btn-pr">Suggest Fixes</button><button id="btn-apply">Apply Patch</button><button id="btn-accept">Accept Suggestion</button></div>
            <pre id="pr-output" style="background:#08080a; color:#bdbdbd; padding:6px; height:64px; overflow:auto; margin-top:8px;"></pre>
          </div>
          <div style="width:300px">
            <div style="font-weight:bold">Suggestion Preview</div>
            <pre id="suggestion" style="background:#08080a; color:#9bd; padding:6px; height:100%; overflow:auto;"></pre>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs/loader.js"></script>
  <script>
    // Monaco loader
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.41.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
      const editor = monaco.editor.create(document.getElementById('editor'), {
        value: "// Welcome to Yuktiio Web IDE\\nfunction hello() {\\n  console.log('Hello, Yuktiio!');\\n}\\n\\nhello();",
        language: 'javascript',
        theme: 'vs-dark',
        automaticLayout: true,
      });

      const DEFAULT_MODEL = 'sarvam-105b';

      // File explorer
      async function loadFileList(path = '.') {
        const res = await fetch(`/ide/files/list?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        const container = document.getElementById('file-list');
        container.innerHTML = '';
        if (data.items) {
          data.items.forEach((it) => {
            const el = document.createElement('div');
            el.textContent = it.name + (it.isDirectory ? '/' : '');
            el.style.cursor = 'pointer';
            el.style.padding = '4px 0';
            el.addEventListener('click', async () => {
              if (it.isDirectory) { loadFileList(it.path); return; }
              const f = await fetch(`/ide/files/file?path=${encodeURIComponent(it.path)}`);
              const body = await f.json();
              if (body.content !== undefined) {
                editor.getModel().setValue(body.content);
                editor.__currentPath = it.path;
                document.getElementById('status').textContent = 'Model: sarvam-105b • ' + it.path;
              } else {
                alert('Failed to open file: ' + JSON.stringify(body));
              }
            });
            container.appendChild(el);
          });
        }
      }

      // Streamed completion with suggestion preview (non-destructive)
      let liveSuggestion = '';
      async function streamCompletion(prompt, context) {
        liveSuggestion = '';
        document.getElementById('suggestion').textContent = '';
        try {
          const res = await fetch('/ide/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, context, model: DEFAULT_MODEL }),
          });

          if (!res.ok) {
            const text = await res.text();
            alert('Completion failed: ' + text);
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let done = false;
          while (!done) {
            const { value, done: rdone } = await reader.read();
            done = rdone;
            if (value) {
              const chunk = decoder.decode(value);
              liveSuggestion += chunk;
              // update suggestion preview box
              document.getElementById('suggestion').textContent = liveSuggestion;
            }
          }
        } catch (err) {
          console.error('Completion error', err);
          alert('Completion error: ' + err.message);
        }
      }

      document.getElementById('btn-complete').addEventListener('click', async () => {
        const selection = editor.getModel().getValueInRange(editor.getSelection());
        const context = editor.getModel().getValue();
        const prompt = selection || '// Complete the following code';
        streamCompletion(prompt, context);
      });

      // Accept suggestion: insert suggestion at cursor
      document.getElementById('btn-accept').addEventListener('click', () => {
        if (!liveSuggestion) return alert('No suggestion available');
        const sel = editor.getSelection();
        editor.executeEdits('accept-suggestion', [
          { range: new monaco.Range(sel.endLineNumber, sel.endColumn, sel.endLineNumber, sel.endColumn), text: liveSuggestion, forceMoveMarkers: true }
        ]);
        document.getElementById('suggestion').textContent = '';
        liveSuggestion = '';
      });

      // Save file
      document.getElementById('btn-save').addEventListener('click', async () => {
        const path = editor.__currentPath;
        if (!path) return alert('Open a file first');
        const content = editor.getValue();
        const res = await fetch('/ide/files/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }) });
        const j = await res.json();
        if (j.ok) {
          alert('Saved');
          loadFileList('.');
        } else { alert('Save failed: ' + JSON.stringify(j)); }
      });

      // PR assistant -> request code actions for current file
      document.getElementById('btn-pr').addEventListener('click', async () => {
        const code = editor.getValue();
        const res = await fetch('/ide/code-actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, model: DEFAULT_MODEL }) });
        if (!res.ok) { document.getElementById('pr-output').textContent = 'Request failed'; return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let out = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          out += decoder.decode(value);
          document.getElementById('pr-output').textContent = out;
        }
      });

      // Apply patch: attempt to parse JSON from PR output and apply patch field
      document.getElementById('btn-apply').addEventListener('click', () => {
        const text = document.getElementById('pr-output').textContent;
        try {
          const obj = JSON.parse(text);
          if (obj.patch) {
            // naive: replace whole document with patched text
            editor.getModel().setValue(obj.patch);
          } else {
            alert('No patch found in assistant output');
          }
        } catch (err) {
          alert('Failed to apply patch: ' + err.message);
        }
      });

      // Ctrl+Space to trigger completion
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
        document.getElementById('btn-complete').click();
      });

      // Run button - evaluate in sandboxed iframe console
      document.getElementById('btn-run').addEventListener('click', () => {
        const code = editor.getValue();
        // Simple eval in a sandboxed iframe
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        iframe.contentWindow.console.log = (...args) => {
          console.log(...args);
          alert('Console: ' + args.join(' '));
        };
        iframe.contentWindow.eval(code);
        setTimeout(() => document.body.removeChild(iframe), 1000);
      });

      // initial load
      loadFileList('.');

      // Trigger background reindex for better context
      try {
        fetch('/ide/index/reindex', { method: 'POST' }).then(r => r.json()).then(j => { console.log('Reindex result', j); });
      } catch (e) { console.warn('Reindex failed', e); }

      // Settings saved in localStorage
      const defaultSettings = { model: DEFAULT_MODEL, debounceMs: 150, cacheTtlMs: 30000 };
      const settings = Object.assign({}, defaultSettings, JSON.parse(localStorage.getItem('yuktiio.settings') || '{}'));
      document.getElementById('status').textContent = `Model: ${settings.model}`;

      function saveSettings() { localStorage.setItem('yuktiio.settings', JSON.stringify(settings)); }

      // Simple cache for inline completions
      const inlineCache = new Map(); // key -> { ts, items }

      function cacheGet(key) {
        const v = inlineCache.get(key);
        if (!v) return null;
        if (Date.now() - v.ts > settings.cacheTtlMs) { inlineCache.delete(key); return null; }
        return v.items;
      }
      function cacheSet(key, items) { inlineCache.set(key, { ts: Date.now(), items }); }

      // Simple string hash
      function hashString(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
        return h >>> 0;
      }

      async function fetchInlineCandidates(code, offset) {
        const key = `${hashString(code)}:${offset}:${settings.model}`;
        const cached = cacheGet(key);
        if (cached) return cached;

        const res = await fetch('/ide/inline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, cursor: offset, model: settings.model }) });
        if (!res.ok) return [];
        const json = await res.json();
        cacheSet(key, json.items || []);
        return json.items || [];
      }

      // Debounce timers per key
      const debounceTimers = {};

      const debouncedFetchInline = (code, offset) => {
        const key = `${hashString(code)}:${offset}:${settings.model}`;
        return new Promise((resolve) => {
          const cached = cacheGet(key);
          if (cached) return resolve(cached);
          if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
          debounceTimers[key] = setTimeout(async () => {
            const items = await fetchInlineCandidates(code, offset);
            resolve(items);
            delete debounceTimers[key];
          }, settings.debounceMs);
        });
      };

      // Register Monaco inline completion provider (calls server /ide/inline)
      monaco.languages.registerCompletionItemProvider('javascript', {
        triggerCharacters: ['.', '\\n', '\\t', ' '],
        provideCompletionItems: async (model, position) => {
          try {
            const code = editor.getModel().getValue();
            const offset = model.getOffsetAt(position);

            // include top symbols as context
            const ctxPrefix = code.slice(Math.max(0, offset - 200), offset);
            let symbols = [];
            try {
              const sres = await fetch(`/ide/index/search?q=${encodeURIComponent(ctxPrefix.split(/\\W+/).slice(-2).join(' '))}`);
              const sjson = await sres.json();
              symbols = sjson.items || [];
            } catch (e) { symbols = []; }

            const items = await debouncedFetchInline(code, offset);
            const mapped = (items || []).map((it) => ({
              label: it.label || it.insertText.slice(0, 40),
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: it.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            }));

            return { suggestions: mapped };
          } catch (err) {
            console.error('Inline completion failed', err);
            return { suggestions: [] };
          }
        }
      });

      // Simple settings UI in toolbar (append inputs)
      const toolbar = document.getElementById('toolbar');
      const modelInput = document.createElement('input'); modelInput.value = settings.model; modelInput.style.width = '200px';
      modelInput.addEventListener('change', (e) => { settings.model = e.target.value; saveSettings(); document.getElementById('status').textContent = `Model: ${settings.model}`; });
      const debounceInput = document.createElement('input'); debounceInput.type = 'number'; debounceInput.value = settings.debounceMs; debounceInput.style.width = '80px'; debounceInput.addEventListener('change', (e) => { settings.debounceMs = Number(e.target.value); saveSettings(); });
      const cacheInput = document.createElement('input'); cacheInput.type = 'number'; cacheInput.value = settings.cacheTtlMs; cacheInput.style.width = '80px'; cacheInput.addEventListener('change', (e) => { settings.cacheTtlMs = Number(e.target.value); saveSettings(); });
      const labels = document.createElement('div'); labels.style.display='flex'; labels.style.gap='8px'; labels.style.alignItems='center'; labels.style.marginLeft='12px';
      labels.appendChild(document.createTextNode('Model:')); labels.appendChild(modelInput);
      labels.appendChild(document.createTextNode('Debounce(ms):')); labels.appendChild(debounceInput);
      labels.appendChild(document.createTextNode('CacheTTL(ms):')); labels.appendChild(cacheInput);
      toolbar.appendChild(labels);

      // initial load of inline completions cache
      loadFileList('.');

    });
  </script>
</body>
</html>`;

  return c.html(html);
});

export default app;