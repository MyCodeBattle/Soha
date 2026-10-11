import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve('@playwright/cli/package.json')),
  'playwright-cli.js'
);
const clientRoot = fileURLToPath(new URL('../', import.meta.url));
const artifacts = await mkdtemp(join(tmpdir(), 'soha-card-layout-'));
const session = `soha-layout-${process.pid}`;
const exec = promisify(execFile);
const fixtureHtml = (await readFile(join(clientRoot, 'index.html'), 'utf8'))
  .replace('/src/main.tsx', '/card-layout-fixture.js')
  .replace(
    '</head>',
    '<style>* { animation: none !important; transition: none !important; }</style></head>'
  );

// The fixture imports production components and CSS through Vite. It is only
// served by this test process; no fixture route ships in the app.
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CardView } from '/src/components/CardView.tsx';
import { ShowdownStage } from '/src/components/ShowdownStage.tsx';
import { Table } from '/src/components/Table.tsx';
import '/src/index.css';
const root = createRoot(document.getElementById('root'));
const card = (suit, rank) => ({ id: suit + '-' + rank, suit, rank });
const hands = [
  [card('diamonds', 2), card('spades', 2), card('hearts', 2), card('clubs', 10), card('hearts', 7)],
  [card('spades', 12), card('clubs', 12), card('clubs', 11), card('hearts', 9), card('hearts', 8)],
  [card('clubs', 14), card('spades', 13), card('clubs', 9), card('spades', 8), card('diamonds', 3)],
  [card('hearts', 14), card('hearts', 13), card('diamonds', 9), card('diamonds', 8), card('clubs', 3)],
  [card('diamonds', 14), card('diamonds', 13), card('hearts', 11), card('spades', 9), card('clubs', 8)],
  [card('spades', 14), card('clubs', 13), card('diamonds', 11), card('clubs', 7), card('spades', 3)],
];
window.roomEvents = [];
window.renderLayoutFixture = ({ kind, size, count = 6, token, status = 'SUMMARY', phase, otherTurn, singleWinner, tie }) => {
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
  } else if (kind === 'room') {
    const roomHands = tie ? hands.map((hand, i) => i < 2
      ? [14, 13, 9, 8, 3].map(rank => card(i === 0 ? 'spades' : 'hearts', rank)) : hand) : hands;
    const players = roomHands.slice(0, count).map((hand, i) => ({
      id: 'p' + i, name: i === 1 ? 'Stitch' : '电脑·阿星' + i, isBot: i !== 1,
      chips: 1000, isReady: true, isFolded: !!singleWinner && i !== 0, isAllIn: false, isOnline: true,
      currentStreetBet: status === 'PLAYING' ? 100 : 0, totalHandBet: 200,
      holeCard: status === 'WAITING' ? undefined : i !== 1 && (singleWinner || status === 'PLAYING' || status === 'DEALING' || phase === 'DEAL_UP' || (phase === 'FLIP_HOLE' && i !== 0)) ? { isHidden: true } : hand[0],
      upcards: status === 'WAITING' ? [] : status === 'DEALING' ? hand.slice(1, 2) : hand.slice(1),
    }));
    const noop = () => {};
    content = React.createElement(Table, {
      roomView: {
        roomId: '28', inviteToken: 'test-invite', hostId: 'p1', ante: 10,
        status, street: status === 'SUMMARY' ? 'HAND_ENDED' : 'ROUND_4', players,
        handId: 'layout-hand', pot: status === 'SUMMARY' || phase === 'AWARD' ? 0 : 1200, effectiveCap: 1000,
        currentStreetMaxBet: 100,
        presentation: phase ? { phase, sequence: phase === 'AWARD' ? 2 : 1, playerId: 'p0' } : undefined,
        winners: status === 'SUMMARY' || phase === 'AWARD' ? (tie
          ? [{ playerId: 'p0', amount: 600 }, { playerId: 'p1', amount: 600 }]
          : [{ playerId: 'p0', amount: 1200 }]) : undefined,
        activePlayerId: otherTurn ? 'p0' : 'p1', initiativePlayerId: 'p0',
        actionDeadline: status === 'PLAYING' ? Date.now() + 15000 : undefined,
        actionOptions: status === 'PLAYING' ? {
          canCheck: false, canCall: true, canBet: false, canRaise: true, canAllIn: true,
          canFold: true, callAmount: 100, minRaise: 200, maxRaise: 1000, minBet: 100, maxBet: 1000,
        } : undefined,
      },
      myPlayerId: 'p1', onAction: action => window.roomEvents.push(action),
      onToggleReady: ready => window.roomEvents.push({ ready }), onAddBot: noop,
      onRemoveBot: noop, onResetChips: noop, onStartGame: noop, onLeaveRoom: noop,
    });
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
  plugins: [
    {
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
            const html = await vite.transformIndexHtml(req.url, fixtureHtml);
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
});

async function runCli(...args) {
  try {
    const { stdout } = await exec(
      process.execPath,
      [cli, `-s=${session}`, ...args],
      {
        cwd: artifacts,
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      }
    );
    return stdout;
  } catch (error) {
    throw new Error(error.stdout || error.stderr || error.message);
  }
}

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  if (process.argv.includes('--preview')) {
    console.log(
      `Layout preview: http://127.0.0.1:${address.port}/__card-layout`
    );
    await new Promise((resolve) => process.once('SIGINT', resolve));
  } else {
    await runCli('open', `http://127.0.0.1:${address.port}/__card-layout`);
    const result = await runCli(
      'run-code',
      `async page => {
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
    const inspectRoom = () => {
      const errors = [];
      if (document.documentElement.scrollHeight > innerHeight + 1) errors.push('room needs vertical scrolling');
      const visible = element => element.getBoundingClientRect().width > 0 && !element.closest('[aria-hidden="true"]');
      for (const element of [...document.querySelectorAll('.poker-card, main button, footer button, footer input')].filter(visible)) {
        const rect = element.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > innerHeight + 1 || rect.left < 0 || rect.right > innerWidth + 1) {
          errors.push('offscreen: ' + element.textContent);
        }
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          const bounds = parent.getBoundingClientRect();
          if (['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowY) &&
              (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) {
            errors.push('vertically clipped: ' + element.textContent);
            break;
          }
          if (['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowX) &&
              (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) {
            errors.push('horizontally clipped: ' + element.textContent);
            break;
          }
        }
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!element.contains(hit)) errors.push('covered: ' + element.textContent);
      }
      for (const face of [...document.querySelectorAll('[data-card-face]')].filter(visible)) {
        const bounds = face.getBoundingClientRect();
        for (const text of face.querySelectorAll('span')) {
          const rect = text.getBoundingClientRect();
          if (rect.top < bounds.top || rect.bottom > bounds.bottom || rect.left < bounds.left || rect.right > bounds.right) {
            errors.push('clipped rank/suit: ' + text.textContent);
          }
        }
        const indicator = face.querySelector('.hole-card-indicator');
        if (indicator) {
          const rect = indicator.getBoundingClientRect();
          if ([...face.querySelectorAll('span')].some(text => {
            const glyph = text.getBoundingClientRect();
            return glyph.left < rect.right && glyph.right > rect.left && glyph.top < rect.bottom && glyph.bottom > rect.top;
          })) errors.push('hole indicator covers rank/suit');
        }
      }
      for (const element of document.querySelectorAll('main, footer')) {
        if (element.scrollHeight > element.clientHeight + 1) errors.push('content exceeds ' + element.tagName);
      }
      return errors;
    };
    const roomScenarios = [
      { status: 'WAITING' }, { status: 'PLAYING' }, { status: 'PLAYING', otherTurn: true },
      { status: 'DEALING' }, { status: 'REVEALING', phase: 'DEAL_UP' },
      { status: 'REVEALING', phase: 'FLIP_HOLE' }, { status: 'REVEALING', phase: 'COMPARE' },
      { status: 'REVEALING', phase: 'AWARD' }, { status: 'SUMMARY' },
      { status: 'SUMMARY', count: 2 }, { status: 'SUMMARY', tie: true },
      { status: 'SUMMARY', singleWinner: true },
    ];
    const touchPage = await page.context().browser().newPage({ hasTouch: true, isMobile: true });
    await touchPage.goto(page.url());
    await touchPage.waitForFunction(() => typeof window.renderLayoutFixture === 'function');
    for (const target of [page, touchPage]) {
      for (const viewport of [
        { width: 320, height: 568 }, { width: 390, height: 844 },
        { width: 551, height: 375 }, { width: 560, height: 375 },
        { width: 567, height: 375 }, { width: 667, height: 375 },
        { width: 844, height: 390 },
        { width: 1024, height: 600 }, { width: 1280, height: 720 },
      ]) {
        await target.setViewportSize(viewport);
        for (const scenario of roomScenarios) {
          const token = String(++cases);
          await target.evaluate(options => window.renderLayoutFixture(options), { kind: 'room', token, ...scenario });
          await target.locator('[data-layout-token="' + token + '"] main').waitFor();
          const roomErrors = await target.evaluate(inspectRoom);
          if (roomErrors.length) failures.push({ ...viewport, touch: target === touchPage, ...scenario, errors: roomErrors });
        }
      }
    }
    await touchPage.setViewportSize({ width: 390, height: 844 });
    await touchPage.evaluate(() => window.renderLayoutFixture({ kind: 'room', token: 'callbacks', status: 'PLAYING' }));
    await touchPage.getByRole('button', { name: '满底池', exact: true }).click();
    await touchPage.getByRole('button', { name: '加注至 $1000', exact: true }).click();
    await touchPage.getByRole('button', { name: '最小', exact: true }).click();
    await touchPage.getByRole('button', { name: '加注至 $200', exact: true }).click();
    const actions = await touchPage.evaluate(() => window.roomEvents);
    if (JSON.stringify(actions) !== JSON.stringify([{ type: 'RAISE', amount: 1000 }, { type: 'RAISE', amount: 200 }])) {
      failures.push({ kind: 'actions', actions });
    }
    await touchPage.getByRole('button', { name: '隐藏底牌', exact: true }).click();
    await touchPage.getByRole('button', { name: '显示底牌', exact: true }).waitFor();
    const peek = touchPage.locator('[data-peek-surface="true"]');
    const box = await peek.boundingBox();
    await touchPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await touchPage.mouse.down();
    await peek.locator('[data-card-face]').waitFor();
    await touchPage.mouse.up();
    await peek.locator('[data-card-face]').waitFor({ state: 'hidden' });
    await touchPage.evaluate(() => window.renderLayoutFixture({ kind: 'room', token: 'transition', status: 'REVEALING', phase: 'COMPARE', tie: true }));
    await touchPage.getByRole('heading', { name: '摊牌比大小', exact: true }).waitFor();
    await touchPage.setViewportSize({ width: 844, height: 390 });
    await touchPage.evaluate(() => window.renderLayoutFixture({ kind: 'room', token: 'transition', status: 'REVEALING', phase: 'AWARD', tie: true }));
    await touchPage.getByRole('heading', { name: '本局胜负', exact: true }).waitFor();
    if (await touchPage.getByRole('button', { name: '准备下一局', exact: true }).count()) failures.push({ kind: 'early-ready' });
    if (!(await touchPage.getByText('2 人平分底池', { exact: true }).count())) failures.push({ kind: 'tie-result' });
    if (!(await touchPage.getByText('$1200', { exact: true }).count())) failures.push({ kind: 'awarded-pot' });
    await touchPage.evaluate(() => window.renderLayoutFixture({ kind: 'room', token: 'transition', status: 'SUMMARY', tie: true }));
    await touchPage.getByRole('button', { name: '准备下一局', exact: true }).click();
    if (!(await touchPage.evaluate(() => window.roomEvents.at(-1)?.ready))) failures.push({ kind: 'next-hand' });
    await touchPage.evaluate(() => window.renderLayoutFixture({ kind: 'room', token: 'single-winner', singleWinner: true }));
    await touchPage.getByText('其他玩家弃牌 · 无需摊牌', { exact: true }).waitFor();
    if (await touchPage.locator('[data-card-face]').count()) failures.push({ kind: 'single-winner-exposes-cards' });
    await touchPage.close();
    if (failures.length) throw new Error('Card layout regression: ' + JSON.stringify(failures));
    return 'PASS: ' + cases + ' card and room layout scenarios';
  }`
    );
    const pass = result.match(/PASS: \d+ card and room layout scenarios/);
    assert(pass, result);
    console.log(pass[0]);
  }
} finally {
  await runCli('close').catch(() => {});
  await server.close();
  await rm(artifacts, { recursive: true, force: true });
}
