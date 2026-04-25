const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cpmAPI", {
  processFiles:         (filePaths) => ipcRenderer.invoke("process-files",          filePaths),
  agentDetectProjects:  (payload)   => ipcRenderer.invoke("agent-detect-projects",  payload),
  agentAnalyze:         (payload)   => ipcRenderer.invoke("agent-analyze",          payload),
  agentComplete:        (payload)   => ipcRenderer.invoke("agent-complete",         payload),
  agentAutofill:        (payload)   => ipcRenderer.invoke("agent-autofill",         payload),
  generateDocument:     (payload)   => ipcRenderer.invoke("generate-document",      payload),
  openFile:             (filePath)  => ipcRenderer.invoke("open-file",              filePath),
  openReleasePage:      (url)       => ipcRenderer.invoke("open-release-page",      url),
  showOpenDialog:       ()          => ipcRenderer.invoke("show-open-dialog"),
  onBackendLog:         (cb)        => ipcRenderer.on("backend-log",      (_, d) => cb(d)),
  onUpdateAvailable:    (cb)        => ipcRenderer.on("update-available", (_, d) => cb(d)),
});


