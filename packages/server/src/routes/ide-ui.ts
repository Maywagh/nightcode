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
        value: `// Welcome to Yuktiio Web IDE\nfunction hello() {\n  console.log('Hello, Yuktiio!');\n}\n\nhello();`,
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

    });
  </script>
</body>
</html>`;

  return c.html(html);
});

export default app;
