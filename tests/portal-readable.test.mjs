import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Portal loads the readability stylesheet after every other stylesheet', () => {
  const html = fs.readFileSync('portal.html', 'utf8');
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].map(m => m[1]);
  assert.equal(sheets.at(-1), 'portal-readable.css');
});

test('Readability rules keep body text at 16px and controls at least 44px tall', () => {
  const css = fs.readFileSync('portal-readable.css', 'utf8');
  assert.match(css, /body\[data-interface="portal"\]\{font-size:16px/);
  assert.match(css, /\.btn\{font-size:15px;min-height:44px\}/);
  assert.match(css, /\.badge\.not-issued\{color:#4b5262\}/);
});

test('Assistant uses SVG icons, not emoji', () => {
  const js = fs.readFileSync('portal-assistant.js', 'utf8');
  assert.doesNotMatch(js, /[\u{1F300}-\u{1FAFF}]/u);
  assert.match(js, /<svg class="va-ico" aria-hidden="true"/);
});
