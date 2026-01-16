const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'main', 'preload.js');
const destDir = path.join(__dirname, '..', 'dist', 'main');
const dest = path.join(destDir, 'preload.js');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('preload.js copied');
