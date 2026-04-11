const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cpmAPI", {
  processFiles:         (filePaths) => ipcRenderer.invoke("process-files",          filePaths),
  agentDetectProjects:  (payload)   => ipcRenderer.invoke("agent-detect-projects",  payload),
  agentAnalyze:         (payload)   => ipcRenderer.invoke("agent-analyze",          payload),
  agentComplete:        (payload)   => ipcRenderer.invoke("agent-complete",         payload),
  generateDocument:     (payload)   => ipcRenderer.invoke("generate-document",      payload),
  openFile:             (filePath)  => ipcRenderer.invoke("open-file",              filePath),
  onBackendLog: (cb) => ipcRenderer.on("backend-log", (event, data) => cb(data)),
});