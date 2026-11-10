// Lädt die reinen Logik-Module (ohne DOM) in Node
const path = require('path');
const fs = require('fs');
const src = path.join(__dirname, '..', '..', 'src');
['00-base.js', '10-dates.js', '20-model.js', '30-merge.js', '40-crypto.js', '45-format.js'].forEach((f) => {
  require(path.join(src, f));
});
module.exports = globalThis.WV;
module.exports._srcFiles = fs.readdirSync(src);
