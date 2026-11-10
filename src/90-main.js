/* Wiedervorlage – Start */
(function (root) {
  'use strict';
  var WV = root.WV, doc = root.document;

  // Rückkehr von Google sofort auswerten und das Token aus der Adresszeile entfernen
  var authReturn = null;
  try { authReturn = WV.auth.handleReturn(); } catch (e) { authReturn = { error: 'state_mismatch' }; }

  async function boot() {
    WV.ui.applyTheme();
    // Einbettung in fremde Seiten verhindern
    if (root.top !== root.self) {
      doc.body.textContent = 'Die Wiedervorlage kann nicht eingebettet verwendet werden.';
      return;
    }
    if (!WV.crypto.available()) {
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
    await WV.sync.init();
    WV.ui.init();
    WV.ui.initSync();
    WV.ui.render();
    WV.ui.focusQuick();
    WV.db.requestPersist().then(function (p) { WV.state.persisted = p; });
    WV.ui.initSW();
    doc.documentElement.setAttribute('data-ready', '1');
    // Synchronisation bzw. Rückkehr von Google
    WV.ui.handleAuthReturn(authReturn);
    // Ungesicherte Änderungen vom letzten Mal nachholen (ohne Dialog)
    setTimeout(function () { WV.backupCtl.runAuto(); }, 1500);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : self);
