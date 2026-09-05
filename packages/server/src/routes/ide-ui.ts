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
      <div id="status">Model: sarvam-105b</div>
    </div>
    <div id="editor" style="height: calc(100% - 56px);"></div>
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

      async function streamCompletion(prompt, context) {
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
          let completion = '';
          while (!done) {
            const { value, done: rdone } = await reader.read();
            done = rdone;
            if (value) {
              const chunk = decoder.decode(value);
              // Append chunk to completion
              completion += chunk;
              // Show live preview: insert at cursor as suggestion (non-destructive)
              // For simplicity, set model value + preview at end
              // Here we append to current selection
              const sel = editor.getSelection();
              const id = { major: 1, minor: 1 };
              editor.executeEdits('completion', [
                { range: new monaco.Range(sel.endLineNumber, sel.endColumn, sel.endLineNumber, sel.endColumn), text: chunk, forceMoveMarkers: true }
              ]);
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
