import { ipcMain, BrowserWindow } from "electron";

export function registerWindowHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.on("window:minimize", () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });

  ipcMain.on("window:maximize", () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
  });

  ipcMain.on("window:close", () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });

  console.log("[IPC] Registered window handlers");
}

export function setupWindowListeners(mainWindow: BrowserWindow): void {
  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window:maximized", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window:maximized", false);
  });

  mainWindow.on("enter-full-screen", () => {
    mainWindow.webContents.send("window:fullscreen", true);
  });

  mainWindow.on("leave-full-screen", () => {
    mainWindow.webContents.send("window:fullscreen", false);
  });
}
