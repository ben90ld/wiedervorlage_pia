/* Wiedervorlage – flache Inline-SVG-Symbole (24×24, Linien in currentColor) */
(function (root) {
  'use strict';
  var WV = root.WV;
  var NS = 'http://www.w3.org/2000/svg';
  var I = WV.icons = {};

  var P = {
    brief: [['path', { d: 'M6 3h8l4 4v14H6z' }], ['path', { d: 'M14 3v4h4' }], ['path', { d: 'M9 12h6M9 16h6' }]],
    bescheinigung: [['circle', { cx: 12, cy: 9, r: 5 }], ['path', { d: 'M9.2 13.2 8 21l4-2 4 2-1.2-7.8' }], ['path', { d: 'm10 9 1.4 1.4L14.2 7.6' }]],
    mail: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ['path', { d: 'm3.5 6.5 8.5 6.5 8.5-6.5' }]],
    rueckruf: [['path', { d: 'M5.5 3.5h3l1.8 4.6-2.3 1.4a10.5 10.5 0 0 0 6.5 6.5l1.4-2.3 4.6 1.8v3a2 2 0 0 1-2.1 2A16 16 0 0 1 3.5 5.6a2 2 0 0 1 2-2.1z' }]],
    rezept: [['path', { d: 'M10.6 20.4a4.9 4.9 0 0 1-7-7l6.8-6.8a4.9 4.9 0 0 1 7 7z' }], ['path', { d: 'm7 10 7 7' }]],
    befund: [['path', { d: 'M9 3h6M10 3v6.2L4.8 18.4A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.6L14 9.2V3' }], ['path', { d: 'M7.4 15h9.2' }]],
    antrag: [['rect', { x: 5, y: 4, width: 14, height: 17, rx: 2 }], ['path', { d: 'M9 4V2.8h6V4' }], ['path', { d: 'm8.8 13 2.2 2.2 4.2-4.4' }]],
    doku: [['path', { d: 'M4.5 19.5h4l10.2-10.2a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4.5 15.5z' }], ['path', { d: 'm13.2 6.8 4 4' }]],
    rs: [['path', { d: 'M3.5 4.5h11v8H8.5l-3 3v-3h-2z' }], ['path', { d: 'M14.5 8.5h6v8h-2v3l-3-3h-4.5v-4' }]],
    piateam: [['circle', { cx: 9, cy: 8, r: 3 }], ['circle', { cx: 17, cy: 9, r: 2.4 }], ['path', { d: 'M3.5 19.5a5.5 5.5 0 0 1 11 0' }], ['path', { d: 'M15 14.6a4.5 4.5 0 0 1 5.5 4.4' }]],
    intervision: [['circle', { cx: 6.5, cy: 7.5, r: 2.5 }], ['circle', { cx: 17.5, cy: 7.5, r: 2.5 }], ['path', { d: 'M2.5 18a4 4 0 0 1 8 0M13.5 18a4 4 0 0 1 8 0' }], ['path', { d: 'M10 5.5h4M12.6 4l1.4 1.5-1.4 1.5' }]],
    vorbereitung: [['path', { d: 'M9.5 6.5h10M9.5 12h10M9.5 17.5h10' }], ['path', { d: 'm3.8 6.5 1.2 1.2 2.2-2.4' }], ['circle', { cx: 5.3, cy: 12, r: 1.3 }], ['circle', { cx: 5.3, cy: 17.5, r: 1.3 }]],
    sonstiges: [['circle', { cx: 6, cy: 12, r: 1.6, fill: 'currentColor' }], ['circle', { cx: 12, cy: 12, r: 1.6, fill: 'currentColor' }], ['circle', { cx: 18, cy: 12, r: 1.6, fill: 'currentColor' }]],
    check: [['path', { d: 'M5 12.5 9.5 17 19 7.5' }]],
    circle: [['circle', { cx: 12, cy: 12, r: 8.5 }]],
    star: [['path', { d: 'M12 3.6 14.5 8.8l5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z' }]],
    starFill: [['path', { d: 'M12 3.6 14.5 8.8l5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z', fill: 'currentColor' }]],
    settings: [['path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }], ['circle', { cx: 15, cy: 7, r: 2 }], ['circle', { cx: 9, cy: 17, r: 2 }]],
    search: [['circle', { cx: 10.5, cy: 10.5, r: 6 }], ['path', { d: 'm15 15 5 5' }]],
    x: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
    trash: [['path', { d: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13' }]],
    download: [['path', { d: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14' }]],
    upload: [['path', { d: 'M12 16V5M7.5 9.5 12 5l4.5 4.5M5 20h14' }]],
    folder: [['path', { d: 'M3 6.5h6l2 2h10V19H3z' }]],
    alert: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7.5v5.5M12 16.5v.01' }]],
    lock: [['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }], ['path', { d: 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3' }]],
    restore: [['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3' }], ['path', { d: 'M4.5 4.5v4h4' }]],
    chevron: [['path', { d: 'm9 6 6 6-6 6' }]],
    calendar: [['rect', { x: 4, y: 5, width: 16, height: 15, rx: 2 }], ['path', { d: 'M4 10h16M8.5 3v4M15.5 3v4' }]],
    flag: [['path', { d: 'M6 21V4M6 4h11l-2.5 4L17 12H6' }]],
    shield: [['path', { d: 'M12 3 5 6v5.5c0 4.4 3 7.9 7 9.5 4-1.6 7-5.1 7-9.5V6z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
    conflict: [['path', { d: 'M12 3 2.8 19.5h18.4z' }], ['path', { d: 'M12 9.5v4.5M12 17v.01' }]]
  };

  I.svg = function (name, cls) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'ico' + (cls ? ' ' + cls : ''));
    (P[name] || P.sonstiges).forEach(function (spec) {
      var el = document.createElementNS(NS, spec[0]);
      Object.keys(spec[1]).forEach(function (k) { el.setAttribute(k, String(spec[1][k])); });
      svg.appendChild(el);
    });
    return svg;
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
