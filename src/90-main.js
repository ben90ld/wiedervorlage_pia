/* Wiedervorlage – Start */
(function (root) {
  'use strict';
  var WV = root.WV, doc = root.document;

  async function boot() {
    WV.ui.applyTheme();
    // Einbettung in fremde Seiten verhindern
    if (root.top !== root.self) {
      doc.body.textContent = 'Die Wiedervorlage kann nicht eingebettet verwendet werden.';
      return;
    }
    if (!WV.crypto.available()) {
      // ohne Web Crypto keine verschlüsselte Sicherung – App bleibt nutzbar, Hinweis in den Einstellungen
      WV.state.fatal = 'Dieser Browser stellt keine Verschlüsselungsfunktionen bereit. Sicherungen sind hier nicht möglich.';
    }
    try {
      await WV.db.open();
    } catch (e) {
      WV.state.fatal = 'Der lokale Speicher des Browsers ist nicht verfügbar. Aufgaben können auf diesem Gerät nicht gespeichert werden.';
      WV.ui.init();
      WV.ui.render();
      return;
    }
    await WV.ui.loadState();
    await WV.backupCtl.init();
    WV.ui.init();
    WV.ui.render();
    WV.ui.focusQuick();
    WV.db.requestPersist().then(function (p) { WV.state.persisted = p; });
    WV.ui.initSW();
    // Ungesicherte Änderungen vom letzten Mal nachholen (ohne Dialog)
    setTimeout(function () { WV.backupCtl.runAuto(); }, 1500);
    doc.documentElement.setAttribute('data-ready', '1');
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : self);
