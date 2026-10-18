#!/usr/bin/env node
// Replaces the embedded asar header hash in an Electron exe (Windows keeps it as
// a 64-char hex string inside the INTEGRITY/ELECTRONASAR resource). Same length,
// so the PE layout is untouched.
//
// usage: node exe-hash.js <in.exe> <out.exe> <old-hash> <new-hash>
// exit 3 if the old hash is not present (nothing is written).
'use strict';
const fs = require('fs');

const [inPath, outPath, oldHash, newHash] = process.argv.slice(2);
if (!inPath || !outPath || !/^[0-9a-f]{64}$/i.test(oldHash || '') || !/^[0-9a-f]{64}$/i.test(newHash || '')) {
    console.error('usage: exe-hash.js <in.exe> <out.exe> <old-hash> <new-hash>');
    process.exit(2);
}

const buf = fs.readFileSync(inPath);
let count = 0;
// Electron writes lowercase hex; check uppercase too, keeping the case it found.
for (const [from, to] of [[oldHash.toLowerCase(), newHash.toLowerCase()], [oldHash.toUpperCase(), newHash.toUpperCase()]]) {
    const needle = Buffer.from(from, 'latin1');
    const repl = Buffer.from(to, 'latin1');
    let i = 0;
    while ((i = buf.indexOf(needle, i)) !== -1) {
        repl.copy(buf, i);
        i += needle.length;
        count++;
    }
}
if (!count) {
    console.error('old asar hash not found in ' + inPath);
    process.exit(3);
}
fs.writeFileSync(outPath, buf);
console.log('replaced ' + count + ' occurrence(s)');
