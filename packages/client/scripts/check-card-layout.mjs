import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('@playwright/cli/package.json')), 'playwright-cli.js');
const clientRoot = fileURLToPath(new URL('../', import.meta.url));
const artifacts = await mkdtemp(join(tmpdir(), 'soha-card-layout-'));
const session = `soha-layout-${process.pid}`;
const exec = promisify(execFile);

// The fixture imports production components and CSS through Vite. It is only
// served by this test process; no fixture route ships in the app.
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CardView } from '/src/components/CardView.tsx';
import { ShowdownStage } from '/src/components/ShowdownStage.tsx';
import '/src/index.css';
const root = createRoot(document.getElementById('root'));
const card = (suit, rank) => ({ id: suit + '-' + rank, suit, rank });
const hands = [
  [card('diamonds', 2), card('spades', 2), card('hearts', 2), card('clubs', 10), card('hearts', 7)],
  [card('spades', 12), card('clubs', 12), card('clubs', 11), card('hearts', 9), card('hearts', 8)],
  [card('clubs', 14), card('spades', 13), card('clubs', 9), card('spades', 8), card('diamonds', 3)],
];
window.renderLayoutFixture = ({ kind, size, count, token }) => {
  let content;
  if (kind === 'cards') {
    content = React.createElement('div', {
      style: { display: 'flex', flexWrap: 'wrap', gap: 20, padding: 20 },
    }, ['clubs', 'diamonds', 'hearts', 'spades'].flatMap(suit =>
      [10, 14].flatMap(rank => [
        {}, { highlight: true, elevated: true }, { isHole: true, dimmed: true },
      ].map((props, variant) => React.createElement(CardView, {
        key: suit + rank + variant, card: card(suit, rank), size, ...props,
      })))
    ));
  } else {
    const players = hands.slice(0, count).map((hand, i) => ({
      id: 'p' + i, name: i === 0 ? '电脑·阿星' : '测试', isBot: i !== 1,
      isFolded: false, holeCard: hand[0], upcards: hand.slice(1),
    }));
    content = React.createElement(ShowdownStage, {
      players, pot: 100, isSummary: true, myPlayerId: 'p1',
    });
  }
  root.render(React.createElement('div', { key: token, 'data-layout-token': token }, content));
};
`;

const server = await createServer({
  root: clientRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false },
  plugins: [{
    name: 'card-layout-fixture',
    resolveId(id) {
      if (id === '/card-layout-fixture.js') return '\0card-layout-fixture.js';
    },
    load(id) {
      if (id === '\0card-layout-fixture.js') return fixture;
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__card-layout') return next();
        try {
          const html = await vite.transformIndexHtml(req.url, `<!doctype html>
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>* { animation: none !important; transition: none !important; }</style></head>
            <body><div id="root"></div><script type="module" src="/card-layout-fixture.js"></script></body></html>`);
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
  }],
});

async function runCli(...args) {
  try {
    const { stdout } = await exec(process.execPath, [cli, `-s=${session}`, ...args], {
      cwd: artifacts, timeout: 60_000, maxBuffer: 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    throw new Error(error.stdout || error.stderr || error.message);
  }
}

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  await runCli('open', `http://127.0.0.1:${address.port}/__card-layout`);
  const result = await runCli('run-code', `async page => {
    await page.waitForFunction(() => typeof window.renderLayoutFixture === 'function');
    const failures = [];
    let cases = 0;
    for (const width of [320, 375, 640, 1000]) {
      await page.setViewportSize({ width, height: 700 });
      const scenarios = [
        ...['xs', 'sm', 'md', 'lg'].map(size => ({ kind: 'cards', size })),
        { kind: 'showdown', count: 2 }, { kind: 'showdown', count: 3 },
      ];
      for (const scenario of scenarios) {
        const token = String(++cases);
        await page.evaluate(options => window.renderLayoutFixture(options), { ...scenario, token });
        await page.locator('[data-layout-token="' + token + '"] [data-card-face]').first().waitFor();
        const errors = await page.evaluate(() => {
          const errors = [];
          const faces = [...document.querySelectorAll('[data-card-face]')];
          const within = (inner, outer) => inner.top >= outer.top + 0.5
            && inner.bottom <= outer.bottom - 0.5 && inner.left >= outer.left + 0.5
            && inner.right <= outer.right - 0.5;
          for (const [index, face] of faces.entries()) {
            const bounds = face.getBoundingClientRect();
            const text = [...face.querySelectorAll('span')];
            if (text.length !== 4) errors.push('card ' + index + ': missing rank/suit');
            for (const span of text) {
              if (!within(span.getBoundingClientRect(), bounds)) {
                errors.push('card ' + index + ': clipped ' + span.textContent);
              }
            }
            const indicator = face.querySelector('.hole-card-indicator');
            if (indicator) {
              const rect = indicator.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0 || rect.top < bounds.top - 0.5
                || rect.bottom > bounds.bottom + 0.5 || rect.right > bounds.right + 0.5) {
                errors.push('card ' + index + ': clipped hole indicator');
              }
              if (text.some(span => {
                const glyph = span.getBoundingClientRect();
                return glyph.left < rect.right - 0.5 && glyph.right > rect.left + 0.5
                  && glyph.top < rect.bottom - 0.5 && glyph.bottom > rect.top + 0.5;
              })) errors.push('card ' + index + ': hole indicator covers rank/suit');
            }
          }
          return { errors, count: faces.length };
        });
        const expected = scenario.kind === 'cards' ? 24 : scenario.count * 5;
        if (errors.count !== expected) failures.push({ width, ...scenario, count: errors.count, expected });
        if (errors.errors.length) failures.push({ width, ...scenario, errors: errors.errors });
      }
    }
    if (failures.length) throw new Error('Card layout regression: ' + JSON.stringify(failures));
    return 'PASS: ' + cases + ' card and showdown layout scenarios';
  }`);
  const pass = result.match(/PASS: \d+ card and showdown layout scenarios/);
  assert(pass, result);
  console.log(pass[0]);
} finally {
  await runCli('close').catch(() => {});
  await server.close();
  await rm(artifacts, { recursive: true, force: true });
}
