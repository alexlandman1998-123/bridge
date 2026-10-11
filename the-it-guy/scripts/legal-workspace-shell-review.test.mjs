import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { withoutLegalShell } from './legal-workspace-shell-review.mjs';
const root=new URL('../../',import.meta.url);
const baseline=JSON.parse(readFileSync(new URL('the-it-guy/docs/conveyancing-preservation-baseline.json',root),'utf8'));
for(const path of ['the-it-guy/src/App.jsx','the-it-guy/src/components/Sidebar.jsx'])test(`reviewed Legal edits preserve original ${path}`,()=>{
 const source=readFileSync(new URL(path,root),'utf8');
 const original=withoutLegalShell(path,source);
 assert.ok(original);assert.equal(createHash('sha256').update(original).digest('hex'),baseline.reviewFiles.find(f=>f.path===path).sha256);
 assert.notEqual(createHash('sha256').update(withoutLegalShell(path,source+'\n// unexpected change')).digest('hex'),baseline.reviewFiles.find(f=>f.path===path).sha256);
 assert.equal(withoutLegalShell('protected.js',source),null);
});

test('DEV preview deferral cannot conceal production loading or route drift', () => {
 const path='the-it-guy/src/App.jsx'; const source=readFileSync(new URL(path,root),'utf8');
 assert.ok(source.includes('const LocalClientTransactionPreviewPage = import.meta.env.DEV'));
 const unapproved=withoutLegalShell(path,source.replace('const LocalClientTransactionPreviewPage = import.meta.env.DEV','const LocalClientTransactionPreviewPage = true'));
 assert.ok(!unapproved || createHash('sha256').update(unapproved).digest('hex') !== baseline.reviewFiles.find(f=>f.path===path).sha256);
 const changed=withoutLegalShell(path,source.replace('preview={localPreview}','preview={{}}'));
 assert.equal(changed,null);
});
