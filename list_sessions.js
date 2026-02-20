const fs = require('fs');
const path = require('path');

function walk(dir) {
  let r = [];
  try {
    for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) r = r.concat(walk(p));
      else if (e.name.endsWith('.jsonl')) r.push(p);
    }
  } catch(e){}
  return r;
}

const files = walk('C:/Users/HP/.codex/sessions');
const results = [];
for (const f of files) {
  try {
    const fd = fs.openSync(f, 'r');
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    const s = buf.toString('utf8', 0, n);
    if (s.indexOf('session_meta') === -1) continue;
    if (s.indexOf('"source":"cli"') === -1) continue;
    const id = s.match(/"id":"([^"]+)"/);
    const ts = s.match(/"timestamp":"([^"]+)"/);
    const cwd = s.match(/"cwd":"([^"]+)"/);
    const prov = s.match(/"model_provider":"([^"]+)"/);
    const ver = s.match(/"cli_version":"([^"]+)"/);
    results.push({
      id: id?id[1]:'?', ts: ts?ts[1]:'?',
      cwd: cwd?cwd[1].replace(/\\\\/g,'\\'):'?',
      p: prov?prov[1]:'?', v: ver?ver[1]:'?'
    });
  } catch(e){ console.error('ERR:', f, e.message); }
}
results.sort((a,b)=>b.ts.localeCompare(a.ts));
console.log('=== Interactive CLI Sessions ===');
console.log('');
for (const r of results) {
  console.log(r.ts.replace('T',' ').substring(0,19) + ' | ' + r.id);
  console.log('  CWD: ' + r.cwd + ' | Provider: ' + r.p + ' | CLI: ' + r.v);
  console.log('  -> codex resume ' + r.id);
  console.log('');
}
console.log('Total:', results.length);
process.exit(0);
