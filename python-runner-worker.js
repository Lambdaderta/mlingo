let pyodideReady = null;

async function ensurePyodide(sources) {
  if (pyodideReady) return pyodideReady;

  pyodideReady = (async () => {
    let lastError = null;
    for (const source of sources) {
      try {
        importScripts(source.scriptUrl);
        if (typeof loadPyodide !== "function") {
          throw new Error("loadPyodide is not available after script import");
        }
        return await loadPyodide({ indexURL: source.indexUrl });
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`Pyodide is unavailable: ${lastError?.message || lastError || "unknown error"}`);
  })();

  return pyodideReady;
}

self.addEventListener("message", async (event) => {
  const { id, code, setup, tests, packages, sources } = event.data || {};
  let phase = "loading";

  try {
    const pyodide = await ensurePyodide(sources || []);
    phase = "packages";
    if (packages?.length) await pyodide.loadPackage(packages);

    phase = "execution";
    pyodide.globals.set("__mlingo_setup_code", setup || "");
    pyodide.globals.set("__mlingo_user_code", code || "");
    pyodide.globals.set("__mlingo_test_code", tests || "");

    await pyodide.runPythonAsync(`
import io
import sys

__mlingo_ns = {"__name__": "__main__"}
__mlingo_stdout_buffer = io.StringIO()
__mlingo_old_stdout = sys.stdout

try:
    sys.stdout = __mlingo_stdout_buffer
    exec(__mlingo_setup_code, __mlingo_ns)
    exec(__mlingo_user_code, __mlingo_ns)
    exec(__mlingo_test_code, __mlingo_ns)
finally:
    sys.stdout = __mlingo_old_stdout

__mlingo_stdout = __mlingo_stdout_buffer.getvalue()
`);

    self.postMessage({
      id,
      ok: true,
      stdout: pyodide.globals.get("__mlingo_stdout") || "",
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      phase,
      error: error?.message || String(error),
    });
  }
});
