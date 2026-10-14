const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "wattwiseDesktop",
  Object.freeze({
    getState: () => ipcRenderer.invoke("wattwise:get-state"),
    command: (action) => ipcRenderer.invoke("wattwise:command", action),
    exportCsv: () => ipcRenderer.invoke("wattwise:export-csv"),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("wattwise:state", listener);
      return () => ipcRenderer.removeListener("wattwise:state", listener);
    },
  }),
);
