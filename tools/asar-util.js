#!/usr/bin/env node
// Small helpers for Patch-ClaudeRTL.ps1 (kept out of `node -e` because Windows
// PowerShell 5.1 mangles quotes in native-command arguments).
//   node asar-util.js hash <app.asar>          -> SHA256 of the asar header
//   node asar-util.js contains <file> <text>   -> exit 0 if found, 1 if not
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const [cmd, file, text] = process.argv.slice(2);
if (cmd === 'hash') {
    const fd = fs.openSync(file, 'r');
    const pre = Buffer.alloc(16);
    fs.readSync(fd, pre, 0, 16, 0);
    const len = pre.readUInt32LE(12);
    const header = Buffer.alloc(len);
    fs.readSync(fd, header, 0, len, 16);
    console.log(crypto.createHash('sha256').update(header).digest('hex'));
} else if (cmd === 'contains') {
    process.exit(fs.readFileSync(file).includes(text) ? 0 : 1);
} else {
    console.error('usage: asar-util.js hash <asar> | contains <file> <text>');
    process.exit(2);
}
