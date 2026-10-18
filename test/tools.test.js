// Tests for the patch tools. Run: npm test  (Node 18+, no dependencies)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOLS = path.join(ROOT, 'tools');
const PAYLOAD = path.join(ROOT, 'payload', 'claude-rtl.js');

function tmp(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-rtl-test-'));
    return path.join(dir, name);
}

// Minimal asar writer (same layout Electron reads): size pickle, header pickle, data.
function writeAsar(file, entries) {
    const header = { files: {} };
    const blobs = [];
    let offset = 0;
    for (const [p, content] of Object.entries(entries)) {
        const parts = p.split('/');
        let node = header;
        for (const dir of parts.slice(0, -1)) node = (node.files[dir] = node.files[dir] || { files: {} });
        const data = Buffer.from(content);
        node.files[parts[parts.length - 1]] = { size: data.length, offset: String(offset) };
        blobs.push(data);
        offset += data.length;
    }
    // An unpacked entry: listed in the header, data lives outside the archive.
    header.files['native.node'] = { size: 3, unpacked: true };
    const json = Buffer.from(JSON.stringify(header));
    const padded = Math.ceil((4 + json.length) / 4) * 4;
    const hp = Buffer.alloc(4 + padded);
    hp.writeUInt32LE(padded, 0);
    hp.writeUInt32LE(json.length, 4);
    json.copy(hp, 8);
    const sp = Buffer.alloc(8);
    sp.writeUInt32LE(4, 0);
    sp.writeUInt32LE(hp.length, 4);
    fs.writeFileSync(file, Buffer.concat([sp, hp, ...blobs]));
}

function readAsar(file) {
    const b = fs.readFileSync(file);
    const len = b.readUInt32LE(12);
    const json = b.subarray(16, 16 + len).toString();
    const header = JSON.parse(json);
    const dataStart = 8 + b.readUInt32LE(4);
    return {
        header,
        headerHash: crypto.createHash('sha256').update(json).digest('hex'),
        get(p) {
            let n = header;
            for (const k of p.split('/')) n = n.files[k];
            return b.subarray(dataStart + Number(n.offset), dataStart + Number(n.offset) + n.size).toString();
        },
    };
}

const FILES = {
    '.vite/build/mainView.js': '"use strict";console.log("main view");',
    '.vite/build/other.js': '"use strict";console.log("untouched");',
    'package.json': '{"name":"fake"}',
};

function inject(input, output) {
    return execFileSync(process.execPath, [path.join(TOOLS, 'asar-inject.js'), input, output, PAYLOAD,
        '.vite/build/mainView.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('asar-inject prepends the payload and keeps every other file intact', () => {
    const src = tmp('app.asar'), out = tmp('out.asar');
    writeAsar(src, FILES);
    const printedHash = inject(src, out);
    const a = readAsar(out);

    const view = a.get('.vite/build/mainView.js');
    assert.match(view, /CLAUDE PERSIAN RTL \(VAZIRMATN\) START/);
    assert.ok(view.endsWith(FILES['.vite/build/mainView.js']), 'original code kept at the end');
    assert.strictEqual(a.get('.vite/build/other.js'), FILES['.vite/build/other.js']);
    assert.strictEqual(a.get('package.json'), FILES['package.json']);
    assert.ok(a.header.files['native.node'].unpacked, 'unpacked entry preserved');
    assert.strictEqual(printedHash, a.headerHash, 'printed hash is the header hash');

    const integ = a.header.files['.vite'].files.build.files['mainView.js'].integrity;
    assert.strictEqual(integ.hash, crypto.createHash('sha256').update(view).digest('hex'));
});

test('asar-inject is idempotent (re-patching never stacks the payload)', () => {
    const src = tmp('app.asar'), once = tmp('once.asar'), twice = tmp('twice.asar');
    writeAsar(src, FILES);
    const h1 = inject(src, once);
    const h2 = inject(once, twice);
    assert.strictEqual(h1, h2);
    const view = readAsar(twice).get('.vite/build/mainView.js');
    assert.strictEqual(view.split('CLAUDE PERSIAN RTL (VAZIRMATN) START').length, 2);
});

test('asar-inject fails when a target file is missing', () => {
    const src = tmp('app.asar'), out = tmp('out.asar');
    writeAsar(src, FILES);
    const r = spawnSync(process.execPath, [path.join(TOOLS, 'asar-inject.js'), src, out, PAYLOAD, 'nope.js']);
    assert.notStrictEqual(r.status, 0);
});

test('asar-util hash matches the header hash; contains finds text', () => {
    const src = tmp('app.asar');
    writeAsar(src, FILES);
    const h = execFileSync(process.execPath, [path.join(TOOLS, 'asar-util.js'), 'hash', src], { encoding: 'utf8' }).trim();
    assert.strictEqual(h, readAsar(src).headerHash);
    const yes = spawnSync(process.execPath, [path.join(TOOLS, 'asar-util.js'), 'contains', src, 'untouched']);
    const no = spawnSync(process.execPath, [path.join(TOOLS, 'asar-util.js'), 'contains', src, 'absent-text']);
    assert.strictEqual(yes.status, 0);
    assert.strictEqual(no.status, 1);
});

test('exe-hash swaps the embedded hash in place and refuses unknown hashes', () => {
    const oldH = 'a'.repeat(64), newH = 'b'.repeat(64);
    const exe = tmp('fake.exe'), out = tmp('out.exe');
    const body = 'MZ....[{"file":"resources\\\\app.asar","alg":"SHA256","value":"' + oldH + '"}]....';
    fs.writeFileSync(exe, body);
    execFileSync(process.execPath, [path.join(TOOLS, 'exe-hash.js'), exe, out, oldH, newH], { stdio: 'pipe' });
    const res = fs.readFileSync(out, 'latin1');
    assert.strictEqual(res.length, body.length, 'size unchanged');
    assert.ok(res.includes(newH) && !res.includes(oldH));

    const r = spawnSync(process.execPath, [path.join(TOOLS, 'exe-hash.js'), exe, tmp('x.exe'), 'c'.repeat(64), newH]);
    assert.strictEqual(r.status, 3, 'exit 3 when the old hash is absent');
});

test('sources are pure ASCII and the payload parses', () => {
    const files = ['payload/claude-rtl.js', 'Patch-ClaudeRTL.ps1', 'install.cmd', 'uninstall.cmd',
        'tools/asar-inject.js', 'tools/asar-util.js', 'tools/exe-hash.js'];
    for (const f of files) {
        const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
        assert.ok(!/[^\x00-\x7f]/.test(text), f + ' must be ASCII (PowerShell 5.1 / cmd)');
    }
    const r = spawnSync(process.execPath, ['--check', PAYLOAD]);
    assert.strictEqual(r.status, 0, String(r.stderr));
});
