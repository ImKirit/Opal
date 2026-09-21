// Kleine, sichere Bruecke: die Seite erfaehrt nur, dass sie in der Desktop-App laeuft.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('opalDesktop', {
  isDesktop: true,
  platform: process.platform,
});
