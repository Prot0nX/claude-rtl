#!/usr/bin/env node
// Rewrites an Electron app.asar, prepending a payload to selected files.
// No dependencies. Unpacked entries are kept as-is (their data lives in
// app.asar.unpacked). File integrity blocks are recomputed for changed files.
//
// usage: node asar-inject.js <in.asar> <out.asar> <payload.js> <file-in-asar>...
//   e.g. node asar-inject.js app.asar out.asar claude-rtl.js .vite/build/mainView.js
// Prints the SHA256 of the new header (what Electron's asar integrity checks).
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const MARK_START = '// --- CLAUDE PERSIAN RTL (VAZIRMATN) START ---';
const MARK_END = '// --- CLAUDE PERSIAN RTL (VAZIRMATN) END ---';
const BLOCK = 4 * 1024 * 1024;

function readAsar(path) {
    const fd = fs.openSync(path, 'r');
    const pre = Buffer.alloc(8);
    fs.readSync(fd, pre, 0, 8, 0);
    const headerPickleSize = pre.readUInt32LE(4);
    const hp = Buffer.alloc(headerPickleSize);
    fs.readSync(fd, hp, 0, headerPickleSize, 8);
    const strLen = hp.readUInt32LE(4);
    const header = JSON.parse(hp.subarray(8, 8 + strLen).toString('utf8'));
    return { fd, header, dataStart: 8 + headerPickleSize };
}

function integrity(buf) {
    const blocks = [];
    for (let i = 0; i < buf.length; i += BLOCK) {
        blocks.push(crypto.createHash('sha256').update(buf.subarray(i, i + BLOCK)).digest('hex'));
    }
    if (!blocks.length) blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
    return {
        algorithm: 'SHA256',
        hash: crypto.createHash('sha256').update(buf).digest('hex'),
        blockSize: BLOCK,
        blocks,
    };
}

// Remove any earlier copy of our payload so re-running never stacks it.
function stripPayload(text) {
    const s = text.indexOf(MARK_START);
    if (s === -1) return text;
    const e = text.indexOf(MARK_END, s);
    if (e === -1) throw new Error('payload start marker without end marker');
    let rest = text.slice(e + MARK_END.length).replace(/^\r?\n/, '');
    let head = text.slice(0, s).replace(/"use strict";\r?\n$/, '');
    return head + rest;
}

function main() {
    const [inPath, outPath, payloadPath, ...targets] = process.argv.slice(2);
    if (!inPath || !outPath || !payloadPath || !targets.length) {
        console.error('usage: asar-inject.js <in.asar> <out.asar> <payload.js> <file>...');
        process.exit(2);
    }
    const payload = fs.readFileSync(payloadPath, 'utf8').trim();
    const want = new Set(targets.map(t => t.replace(/\\/g, '/').replace(/^\/+/, '')));
    const src = readAsar(inPath);

    // Walk entries in header order, collecting packed files and their new data.
    const files = [];
    (function walk(node, prefix) {
        for (const name of Object.keys(node.files)) {
            const entry = node.files[name];
            const p = prefix ? prefix + '/' + name : name;
            if (entry.files) walk(entry, p);
            else if (!entry.unpacked && !entry.link) files.push({ p, entry });
        }
    })(src.header, '');

    let offset = 0;
    const injected = [];
    for (const f of files) {
        const buf = Buffer.alloc(f.entry.size);
        if (f.entry.size) fs.readSync(src.fd, buf, 0, f.entry.size, src.dataStart + Number(f.entry.offset));
        f.data = buf;
        if (want.has(f.p)) {
            const original = stripPayload(buf.toString('utf8'));
            f.data = Buffer.from('"use strict";\n' + payload + '\n' + original, 'utf8');
            f.entry.integrity = integrity(f.data);
            injected.push(f.p);
            want.delete(f.p);
        }
        f.entry.size = f.data.length;
        f.entry.offset = String(offset);
        offset += f.data.length;
    }
    fs.closeSync(src.fd);
    if (want.size) {
        console.error('not found in asar: ' + [...want].join(', '));
        process.exit(1);
    }

    const json = JSON.stringify(src.header);
    const strBuf = Buffer.from(json, 'utf8');
    const padded = Math.ceil((4 + strBuf.length) / 4) * 4;
    const headerPickle = Buffer.alloc(4 + padded);
    headerPickle.writeUInt32LE(padded, 0);
    headerPickle.writeUInt32LE(strBuf.length, 4);
    strBuf.copy(headerPickle, 8);
    const sizePickle = Buffer.alloc(8);
    sizePickle.writeUInt32LE(4, 0);
    sizePickle.writeUInt32LE(headerPickle.length, 4);

    const out = fs.openSync(outPath, 'w');
    fs.writeSync(out, sizePickle);
    fs.writeSync(out, headerPickle);
    for (const f of files) if (f.data.length) fs.writeSync(out, f.data);
    fs.closeSync(out);

    for (const p of injected) console.error('injected: ' + p);
    console.log(crypto.createHash('sha256').update(json).digest('hex'));
}

main();
