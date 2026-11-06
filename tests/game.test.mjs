import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const source = await readFile(new URL("../game.js", import.meta.url), "utf8");

async function fixture(t, storage = {}) {
  const dom = new JSDOM(html, {
    url: "http://localhost",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new w.Event("close"));
  };
  w.localStorage.setItem(
    "moyu-settings",
    JSON.stringify({ sound: false, motion: true, speed: "fast", duration: 30 }),
  );
  for (const [key, value] of Object.entries(storage))
    w.localStorage.setItem(key, value);
  w.eval(
    source +
      "\nwindow.testApi = { Card, Deck, Player, HandEvaluator, generateAllPatterns };",
  );
  if (w.document.readyState === "loading")
    await new Promise((resolve) =>
      w.document.addEventListener("DOMContentLoaded", resolve, { once: true }),
    );
  const game = w.gameController;
  assert.ok(game, "game initializes without runtime errors");
  t.after(() => {
    game.cancelAllTasks();
    game.stopTimer();
    w.close();
  });
  return { dom, w, game, ...w.testApi };
}

function cards(api, values) {
  const deck = new api.Deck().cards;
  const used = new Set();
  return values.map((value) => {
    const card = deck.find(
      (card) => card.value === value && !used.has(card.id),
    );
    assert.ok(card, `valid requested rank: ${value}`);
    used.add(card.id);
    return card;
  });
}

function playing(game, landlord = 0) {
  game.startGame();
  game.cancelAllTasks();
  game.state = "bidding";
  game.finishBidding(landlord);
  game.cancelAllTasks();
  game.stopTimer();
}

test("lobby waits for explicit start; cards and bottom remain hidden", async (t) => {
  const { game, w } = await fixture(t);
  assert.equal(game.state, "ready");
  assert.equal(game.tasks.size, 0);
  assert.equal(w.document.querySelectorAll("#playerHand .card").length, 0);
  assert.equal(
    w.document.querySelectorAll("#bottomCards .card-back-large").length,
    3,
  );
});

test("deck has 54 unique cards; deals 17/17/17 + 3 without overlap", async (t) => {
  const { Deck } = await fixture(t);
  for (let i = 0; i < 50; i++) {
    const dealt = new Deck().deal();
    assert.deepEqual(
      Array.from(dealt.players, (p) => p.length),
      [17, 17, 17],
    );
    assert.equal(
      new Set([...dealt.players.flat(), ...dealt.bottom].map((c) => c.id)).size,
      54,
    );
  }
});

const types = [
  ["single", [3]],
  ["pair", [4, 4]],
  ["triple", [5, 5, 5]],
  ["triple_one", [6, 6, 6, 7]],
  ["triple_pair", [6, 6, 6, 7, 7]],
  ["straight", [3, 4, 5, 6, 7]],
  ["consecutive_pairs", [3, 3, 4, 4, 5, 5]],
  ["airplane", [3, 3, 3, 4, 4, 4]],
  ["airplane_single", [3, 3, 3, 4, 4, 4, 5, 6]],
  ["airplane_pair", [3, 3, 3, 4, 4, 4, 5, 5, 6, 6]],
  ["four_two", [7, 7, 7, 7, 8, 8]],
  ["four_pairs", [7, 7, 7, 7, 8, 8, 9, 9]],
  ["bomb", [3, 3, 3, 3]],
  ["rocket", [16, 17]],
];
for (const [type, values] of types) {
  test(`recognizes ${type}`, async (t) => {
    const api = await fixture(t);
    assert.equal(api.HandEvaluator.analyze(cards(api, values))?.type, type);
  });
}

test("rejects invalid straights, repeated single wings, and unequal sequence lengths", async (t) => {
  const api = await fixture(t);
  const { HandEvaluator: e } = api;
  for (const values of [
    [11, 12, 13, 14, 15],
    [3, 4, 5, 6],
    [3, 3, 3, 4, 4, 4, 5, 5],
    [3, 3, 5, 5, 6, 6],
  ])
    assert.equal(e.analyze(cards(api, values)), null);
  assert.equal(
    e.canBeat(
      e.analyze(cards(api, [4, 5, 6, 7, 8, 9])),
      e.analyze(cards(api, [3, 4, 5, 6, 7])),
    ),
    false,
  );
});

test("rocket wins, but cannot beat another rocket; ordinary cards cannot beat a bomb", async (t) => {
  const api = await fixture(t);
  const { HandEvaluator: e } = api;
  const rocket = e.analyze(cards(api, [16, 17]));
  const bomb = e.analyze(cards(api, [3, 3, 3, 3]));
  assert.equal(e.canBeat(rocket, bomb), true);
  assert.equal(e.canBeat(rocket, rocket), false);
  assert.equal(e.canBeat(e.analyze(cards(api, [17])), bomb), false);
  assert.equal(e.canBeat(null, bomb), false);
});

test("every generated hint is legal, unique and contained in its hand across random deals", async (t) => {
  const api = await fixture(t);
  for (let i = 0; i < 200; i++) {
    const dealt = new api.Deck().deal();
    const hand = [...dealt.players[0], ...dealt.bottom];
    const patterns = api.generateAllPatterns(hand);
    const seen = new Set();
    assert.ok(patterns.length);
    for (const p of patterns) {
      assert.equal(api.HandEvaluator.analyze(p.cards)?.type, p.type);
      assert.ok(p.cards.every((card) => hand.includes(card)));
      const key = Array.from(p.cards, (c) => c.id)
        .sort()
        .join(",");
      assert.ok(!seen.has(key));
      seen.add(key);
    }
  }
  const four = api.generateAllPatterns(cards(api, [7, 7, 7, 7, 8, 8, 9, 9]));
  assert.ok(four.some((p) => p.type === "four_pairs"));
  assert.ok(four.some((p) => p.type === "four_two"));
});

test("bidding reveals bottom only after landlord chosen and gives exactly 20 cards", async (t) => {
  const { game, w } = await fixture(t);
  game.startGame();
  game.cancelAllTasks();
  assert.equal(w.document.querySelectorAll("#bottomCards .card").length, 0);
  game.state = "bidding";
  game.bidStartIndex = 0;
  game.processBid();
  game.handleBid(true);
  assert.equal(game.players[0].hand.length, 20);
  assert.equal(w.document.querySelectorAll("#bottomCards .card").length, 3);
  assert.equal(game.state, "playing");
  game.handleBid(true);
  assert.equal(
    game.players[0].hand.length,
    20,
    "duplicate bid does not add bottom twice",
  );
});

test("all-pass bidding redeals rather than arbitrarily assigning landlord", async (t) => {
  const { game } = await fixture(t);
  game.startGame();
  game.cancelAllTasks();
  game.state = "bidding";
  game.bidStartIndex = 0;
  for (let i = 0; i < 3; i++) {
    game.state = "bidding";
    game.handleBid(false);
    game.cancelTask(game.aiTimer);
  }
  assert.equal(game.state, "bid-wait");
  assert.equal(game.landlordId, null);
  assert.ok([...game.tasks].some((task) => task.remaining === 1400));
});

test("wrong turn, unowned cards, duplicate cards, and passing on an empty table are rejected", async (t) => {
  const api = await fixture(t);
  const { game } = api;
  playing(game);
  assert.equal(game.playCards(1, [game.players[1].hand[0]]), false);
  assert.equal(game.playCards(0, [game.players[1].hand[0]]), false);
  const card = game.players[0].hand[0];
  assert.equal(game.playCards(0, [card, card]), false);
  assert.equal(game.pass(0), false);
  assert.equal(game.players[0].hand.length, 20);
});

test("legal play advances once and immediately disables human controls during AI turn", async (t) => {
  const { game, w } = await fixture(t);
  playing(game);
  const card = game.players[0].hand.at(-1);
  assert.equal(game.playCards(0, [card]), true);
  assert.equal(game.currentPlayer, 1);
  assert.equal(game.players[0].hand.length, 19);
  assert.equal(w.document.getElementById("btnHint").disabled, true);
  assert.equal(game.playedCards.length, 1);
  assert.equal(game.playCards(0, [game.players[0].hand[0]]), false);
});

test("two passes return lead to last player and clear obsolete table cards", async (t) => {
  const { game } = await fixture(t);
  playing(game);
  game.playCards(0, [game.players[0].hand.at(-1)]);
  game.pass(1);
  game.pass(2);
  assert.equal(game.currentPlayer, 0);
  assert.equal(game.lastPlay, null);
  assert.equal(game.passCount, 0);
  assert.equal(
    game.players.every((p) => p.lastPlay === null),
    true,
  );
});

test("tracker never reads opponents and totals only unknown/unplayed cards", async (t) => {
  const { game, w } = await fixture(t);
  playing(game);
  const total = () =>
    [...w.document.querySelectorAll("#cardTracker small")].reduce(
      (sum, e) => sum + Number(e.textContent),
      0,
    );
  assert.equal(total(), 34);
  game.playCards(0, [game.players[0].hand.at(-1)]);
  assert.equal(total(), 34);
  const before = w.document.getElementById("cardTracker").textContent;
  const held = game.players[1].hand;
  game.players[1].hand = [];
  game.renderTracker();
  assert.equal(w.document.getElementById("cardTracker").textContent, before);
  game.players[1].hand = held;
});

test("pause freezes both countdown and pending actions; close resumes safely", async (t) => {
  const { game, w } = await fixture(t);
  playing(game);
  game.startTimer(0, 30);
  let called = false;
  game.schedule(() => (called = true), 30);
  game.openDialog("rulesDialog");
  assert.equal(game.paused, true);
  assert.equal(game.timerPlayerId, -1);
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(called, false);
  w.document.getElementById("rulesDialog").close();
  assert.equal(game.paused, false);
  assert.equal(game.timerPlayerId, 0);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(called, true);
});

test("new game cancels stale callbacks and old selections", async (t) => {
  const { game } = await fixture(t);
  playing(game);
  let stale = false;
  game.schedule(() => (stale = true), 20);
  game.players[0].hand[0].selected = true;
  game.startGame();
  game.cancelAllTasks();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(stale, false);
  assert.equal(game.players[0].getSelectedCards().length, 0);
  assert.equal(game.playedCards.length, 0);
  assert.equal(game.multiplier, 1);
});

test("trust mode can be enabled and immediately cancelled on human turn", async (t) => {
  const { game } = await fixture(t);
  playing(game);
  game.toggleAuto();
  assert.equal(game.autoPlay, true);
  assert.ok(game.tasks.has(game.aiTimer));
  game.toggleAuto();
  assert.equal(game.autoPlay, false);
  assert.equal(game.tasks.has(game.aiTimer), false);
  assert.equal(game.timerPlayerId, 0);
});

test("hint selects a legal hand; keyboard clears it and cannot act during an opponent turn", async (t) => {
  const { game, w, HandEvaluator } = await fixture(t);
  playing(game);
  game.onHintClick();
  assert.ok(HandEvaluator.analyze(game.players[0].getSelectedCards()));
  w.document.dispatchEvent(
    new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(game.players[0].getSelectedCards().length, 0);
  game.currentPlayer = 1;
  game.onHintClick();
  assert.equal(game.players[0].getSelectedCards().length, 0);
});

test("bomb and spring settlement updates stored stats exactly once", async (t) => {
  const api = await fixture(t);
  const { game, w } = api;
  playing(game);
  game.players[0].hand = cards(api, [3, 3, 3, 3]);
  assert.equal(game.playCards(0, game.players[0].hand.slice()), true);
  assert.equal(game.state, "ended");
  assert.equal(game.multiplier, 4);
  assert.equal(game.spring, true);
  assert.equal(game.stats.score, 1080);
  assert.equal(game.stats.games, 1);
  assert.equal(game.stats.wins, 1);
  game.endGame(true, true);
  assert.equal(game.stats.games, 1);
  assert.equal(JSON.parse(w.localStorage.getItem("moyu-stats")).score, 1080);
  assert.match(
    w.document.getElementById("resultBreakdown").textContent,
    /\+80/,
  );
});

test("settings persist and corrupt local storage falls back without breaking initialization", async (t) => {
  const { game, w } = await fixture(t, {
    "moyu-stats": "broken",
    "moyu-settings": '{"duration":999,"speed":"invalid","sound":false}',
  });
  assert.equal(game.stats.score, 1000);
  assert.equal(game.settings.duration, 30);
  assert.equal(game.settings.speed, "normal");
  const select = w.document.getElementById("settingDuration");
  select.value = "60";
  select.dispatchEvent(new w.Event("change"));
  assert.equal(game.settings.duration, 60);
  assert.equal(
    JSON.parse(w.localStorage.getItem("moyu-settings")).duration,
    60,
  );
});

test("AI teammates leave a winning teammate alone", async (t) => {
  const api = await fixture(t);
  const { game } = api;
  playing(game, 0);
  game.currentPlayer = 2;
  game.lastPlayerId = 1;
  game.players[1].hand = cards(api, [3, 4]);
  game.lastPlay = api.HandEvaluator.analyze(cards(api, [12]));
  game.players[2].hand = cards(api, [13, 14, 15]);
  game.aiPlay(game.players[2]);
  assert.equal(game.players[2].hand.length, 3);
  assert.equal(game.currentPlayer, 0);
});

test("100 simulated AI games reach valid settlement without stalling or losing cards", async (t) => {
  const api = await fixture(t);
  const { game } = api;
  // Keep actual rule/state/AI/settlement logic, omit costly DOM rendering in the simulation loop.
  game.renderAll = () => {};
  game.log = () => {};
  game.showBubble = () => {};
  game.playSoundAndAnimation = () => {};
  game.beginTurn = () => {};
  game.writeStorage = () => {};
  for (let i = 0; i < 100; i++) {
    playing(game, i % 3);
    let turns = 0;
    while (game.state === "playing" && turns++ < 1000) {
      const before = game.players.reduce((n, p) => n + p.hand.length, 0);
      game.aiPlay(game.players[game.currentPlayer]);
      const after = game.players.reduce((n, p) => n + p.hand.length, 0);
      assert.equal(after + game.playedCards.length, 54);
      assert.ok(after <= before);
    }
    assert.equal(
      game.state,
      "ended",
      `round ${i} finishes in under 1000 turns`,
    );
    assert.ok(game.players.some((p) => p.hand.length === 0));
    game.cancelAllTasks();
  }
  assert.equal(game.stats.games, 100);
});
