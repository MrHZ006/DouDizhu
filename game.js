"use strict";

/* ==========================================================
 *  SoundManager —— Web Audio API 合成音效管理
 *  无需外部音频文件，所有音效通过振荡器实时合成
 * ========================================================== */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  /** 延迟初始化 AudioContext（需在用户交互后创建，否则浏览器会阻止） */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.enabled = false;
    }
  }

  /**
   * 播放一个简单音调
   * @param {number} freq - 频率 Hz
   * @param {number} duration - 持续时间 秒
   * @param {string} type - 波形: 'sine'|'square'|'sawtooth'|'triangle'
   * @param {number} volume - 音量 0~1
   * @param {number} startTime - 相对于现在的开始延迟 秒
   */
  playTone(freq, duration, type = "sine", volume = 0.15, startTime = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + startTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    // ADSR 包络：快速起音，平滑衰减
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01); // 起音 10ms
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration); // 指数衰减

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /** 出牌音效：短促清脆的"哔"声（两音阶上行） */
  play() {
    this.playTone(800, 0.08, "sine", 0.12, 0);
    this.playTone(1200, 0.06, "sine", 0.1, 0.05);
  }

  /** 过牌音效：低沉短促的"不"声 */
  pass() {
    this.playTone(300, 0.12, "sine", 0.1, 0);
  }

  /** 炸弹音效：低频轰鸣 + 噪声爆破 */
  bomb() {
    // 低频轰鸣
    this.playTone(80, 0.4, "sawtooth", 0.2, 0);
    this.playTone(60, 0.4, "sawtooth", 0.15, 0.02);
    // 高频爆破
    this.playTone(200, 0.15, "square", 0.12, 0.1);
    this.playTone(150, 0.2, "square", 0.1, 0.12);
  }

  /** 王炸音效：华丽上行音阶 + 共鸣 */
  rocket() {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    for (let i = 0; i < notes.length; i++) {
      this.playTone(notes[i], 0.15, "triangle", 0.15, i * 0.06);
    }
    // 尾音共鸣
    this.playTone(2093, 0.4, "sine", 0.12, 0.4);
  }

  /** 抢地主音效：明快上行音 */
  bid() {
    this.playTone(523, 0.1, "square", 0.12, 0);
    this.playTone(659, 0.1, "square", 0.12, 0.08);
    this.playTone(784, 0.15, "square", 0.12, 0.16);
  }

  /** 不抢音效：下行音 */
  bidPass() {
    this.playTone(400, 0.1, "sine", 0.1, 0);
    this.playTone(300, 0.15, "sine", 0.1, 0.08);
  }

  /** 胜利音效：欢快旋律（C-E-G-C 上行 + 琶音） */
  win() {
    const melody = [
      { f: 523, d: 0.12, t: 0 }, // C5
      { f: 659, d: 0.12, t: 0.12 }, // E5
      { f: 784, d: 0.12, t: 0.24 }, // G5
      { f: 1047, d: 0.3, t: 0.36 }, // C6
      { f: 784, d: 0.12, t: 0.55 }, // G5
      { f: 1047, d: 0.4, t: 0.67 }, // C6 长音
    ];
    for (const n of melody) {
      this.playTone(n.f, n.d, "triangle", 0.15, n.t);
    }
  }

  /** 失败音效：下行旋律 */
  lose() {
    const melody = [
      { f: 440, d: 0.15, t: 0 },
      { f: 392, d: 0.15, t: 0.15 },
      { f: 349, d: 0.15, t: 0.3 },
      { f: 294, d: 0.4, t: 0.45 },
    ];
    for (const n of melody) {
      this.playTone(n.f, n.d, "sine", 0.12, n.t);
    }
  }

  /** 选牌音效：轻柔点击声 */
  select() {
    this.playTone(1000, 0.04, "sine", 0.08, 0);
  }
}

/* ==========================================================
 *  Card 类 —— 单张扑克牌
 *  描述牌的花色、点数、排序权重，提供比较和显示辅助方法
 * ========================================================== */
class Card {
  /**
   * @param {string} suit  - 花色: 'spade'|'heart'|'diamond'|'club'|'joker'
   * @param {string} rank  - 点数标签: '3'~'2','BJ'(小王),'RJ'(大王)
   * @param {number} value - 排序权重: 3~17，用于所有比较逻辑
   * @param {boolean} isJoker - 是否王牌
   */
  constructor(suit, rank, value, isJoker = false) {
    this.suit = suit;
    this.rank = rank;
    this.value = value;
    this.isJoker = isJoker;
    this.id = isJoker ? `joker-${rank}` : `${suit}-${rank}`;
    this.selected = false; // UI 选中状态
  }

  /** 与另一张牌比较 value，返回 -1/0/1 */
  compareTo(other) {
    return this.value - other.value;
  }

  /** 获取显示颜色 */
  getDisplayColor() {
    if (this.isJoker) return this.rank === "RJ" ? "gold" : "gold";
    if (this.suit === "heart" || this.suit === "diamond") return "red";
    return "black";
  }

  /** 获取花色符号 */
  getSuitSymbol() {
    const symbols = { spade: "♠", heart: "♥", diamond: "♦", club: "♣" };
    if (this.isJoker) return this.rank === "RJ" ? "大" : "小";
    return symbols[this.suit] || "";
  }

  /** 获取角标显示文本 */
  getCornerText() {
    if (this.isJoker) return this.rank === "RJ" ? "JOKER" : "joker";
    return this.rank;
  }
}

/* ==========================================================
 *  Deck 类 —— 牌堆管理
 *  生成54张牌、Fisher-Yates洗牌、发牌
 * ========================================================== */
class Deck {
  constructor() {
    this.cards = [];
    this.generate();
  }

  /** 生成标准54张牌 */
  generate() {
    this.cards = [];
    const suits = ["spade", "heart", "diamond", "club"];
    // 普通牌：4花色 × 13点数(3~2) = 52张
    // value 映射: 3→3,4→4,...,10→10,J→11,Q→12,K→13,A→14,2→15
    const rankMap = [
      { rank: "3", value: 3 },
      { rank: "4", value: 4 },
      { rank: "5", value: 5 },
      { rank: "6", value: 6 },
      { rank: "7", value: 7 },
      { rank: "8", value: 8 },
      { rank: "9", value: 9 },
      { rank: "10", value: 10 },
      { rank: "J", value: 11 },
      { rank: "Q", value: 12 },
      { rank: "K", value: 13 },
      { rank: "A", value: 14 },
      { rank: "2", value: 15 },
    ];
    for (const suit of suits) {
      for (const { rank, value } of rankMap) {
        this.cards.push(new Card(suit, rank, value));
      }
    }
    // 小王 value=16, 大王 value=17
    this.cards.push(new Card("joker", "BJ", 16, true));
    this.cards.push(new Card("joker", "RJ", 17, true));
  }

  /** Fisher-Yates 洗牌算法（无偏均匀随机排列） */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /** 发牌: 返回 { players: [Card[],Card[],Card[]], bottom: Card[] } */
  deal() {
    this.shuffle();
    return {
      players: [
        this.cards.slice(0, 17),
        this.cards.slice(17, 34),
        this.cards.slice(34, 51),
      ],
      bottom: this.cards.slice(51, 54),
    };
  }
}

/* ==========================================================
 *  Player 类 —— 玩家
 *  管理手牌、身份、选牌状态、出牌操作
 * ========================================================== */
class Player {
  /**
   * @param {number} id - 玩家编号: 0=人类, 1=左AI, 2=右AI
   * @param {string} name - 显示名称
   * @param {boolean} isHuman - 是否人类玩家
   */
  constructor(id, name, isHuman) {
    this.id = id;
    this.name = name;
    this.isHuman = isHuman;
    this.hand = []; // 手牌数组，按 value 降序排列
    this.role = "pending"; // 'landlord' | 'farmer' | 'pending'
    this.lastPlay = null; // 最近一次出的牌(PlayResult)
  }

  /** 手牌按 value 降序排列（大牌在左，符合斗地主视觉习惯） */
  sortHand() {
    this.hand.sort((a, b) => b.value - a.value);
  }

  /** 添加牌（如获得底牌），添加后重新排序 */
  addCards(cards) {
    this.hand.push(...cards);
    this.sortHand();
  }

  /** 从手牌中移除指定牌（通过 id 匹配） */
  removeCards(cards) {
    const idsToRemove = new Set(cards.map((c) => c.id));
    this.hand = this.hand.filter((c) => !idsToRemove.has(c.id));
  }

  /** 切换某张牌的选中状态 */
  toggleSelect(cardId) {
    const card = this.hand.find((c) => c.id === cardId);
    if (card) card.selected = !card.selected;
  }

  /** 获取所有选中的牌 */
  getSelectedCards() {
    return this.hand.filter((c) => c.selected);
  }

  /** 清空所有选中状态 */
  clearSelection() {
    this.hand.forEach((c) => (c.selected = false));
  }

  /** 返回手牌数量 */
  cardCount() {
    return this.hand.length;
  }
}

/* ==========================================================
 *  牌型检测与比较工具函数
 * ========================================================== */

/* ==========================================================
 *  HandEvaluator —— 增强牌型识别与比较
 *  支持所有标准斗地主牌型：单张/对子/三张/三带一/三带对/
 *  顺子/连对/飞机/飞机带翼/四带二/炸弹/王炸
 * ========================================================== */
const HandEvaluator = {
  /** 检查 value 是否连续（3~A，即 3~14；2 和王不参与顺子） */
  isConsecutive(values) {
    for (let i = 1; i < values.length; i++) {
      if (values[i] !== values[i - 1] + 1) return false;
    }
    return true;
  },

  /**
   * 将牌按 value 分组
   * @returns {{ groups: Map<number, Card[]>, values: number[], counts: number[] }}
   */
  groupByValue(cards) {
    const groups = new Map();
    for (const c of cards) {
      if (!groups.has(c.value)) groups.set(c.value, []);
      groups.get(c.value).push(c);
    }
    const values = [...groups.keys()].sort((a, b) => a - b);
    const counts = values.map((v) => groups.get(v).length);
    return { groups, values, counts };
  },

  /**
   * 核心牌型识别
   * @param {Card[]} cards - 选中的牌
   * @returns {object|null} { type, mainValue, length, cards } 或 null
   */
  analyze(cards) {
    if (!cards || cards.length === 0) return null;
    const n = cards.length;
    const { groups, values, counts } = this.groupByValue(cards);
    const maxCount = Math.max(...counts);

    // --- 王炸 rocket ---
    // 不依赖牌的排列顺序，通过 value 集合判断（小王16 + 大王17）
    if (n === 2 && values.includes(16) && values.includes(17)) {
      return { type: "rocket", mainValue: 999, length: 2, cards };
    }

    // --- 炸弹 bomb ---
    if (n === 4 && maxCount === 4) {
      return { type: "bomb", mainValue: values[0], length: 4, cards };
    }

    // --- 四带二 four_two ---
    if (n === 6 && counts.includes(4)) {
      const fourVal = values.find((v) => groups.get(v).length === 4);
      return { type: "four_two", mainValue: fourVal, length: 6, cards };
    }

    if (
      n === 8 &&
      counts.includes(4) &&
      counts.filter((count) => count === 2).length === 2
    ) {
      return {
        type: "four_pairs",
        mainValue: values.find((v) => groups.get(v).length === 4),
        length: 8,
        cards,
      };
    }

    // --- 三带一 triple_one ---
    if (n === 4 && counts.includes(3) && counts.includes(1)) {
      const tripleValue = values.find((v) => groups.get(v).length === 3);
      return { type: "triple_one", mainValue: tripleValue, length: 4, cards };
    }

    // --- 三带对 triple_pair ---
    if (n === 5 && counts.includes(3) && counts.includes(2)) {
      const tripleValue = values.find((v) => groups.get(v).length === 3);
      return { type: "triple_pair", mainValue: tripleValue, length: 5, cards };
    }

    // --- 三张 triple ---
    if (n === 3 && maxCount === 3) {
      return { type: "triple", mainValue: values[0], length: 3, cards };
    }

    // --- 对子 pair ---
    // 排除双王（已在上面的王炸中处理），通过 value 集合判断
    if (
      n === 2 &&
      maxCount === 2 &&
      !values.includes(16) &&
      !values.includes(17)
    ) {
      return { type: "pair", mainValue: values[0], length: 2, cards };
    }

    // --- 单张 single ---
    if (n === 1) {
      return { type: "single", mainValue: values[0], length: 1, cards };
    }

    // --- 顺子 straight: 5张及以上连续单牌，不含2(15)和王 ---
    if (n >= 5 && counts.every((c) => c === 1)) {
      if (values[values.length - 1] <= 14 && this.isConsecutive(values)) {
        return {
          type: "straight",
          mainValue: values[values.length - 1],
          length: n,
          cards,
        };
      }
    }

    // --- 连对 consecutive_pairs: 3对及以上连续对子，不含2和王 ---
    if (n >= 6 && n % 2 === 0 && counts.every((c) => c === 2)) {
      if (values[values.length - 1] <= 14 && this.isConsecutive(values)) {
        return {
          type: "consecutive_pairs",
          mainValue: values[values.length - 1],
          length: values.length,
          cards,
        };
      }
    }

    // --- 飞机（纯）airplane: 2组及以上连续三张，不含2和王 ---
    if (n >= 6 && n % 3 === 0 && counts.every((c) => c === 3)) {
      if (values[values.length - 1] <= 14 && this.isConsecutive(values)) {
        return {
          type: "airplane",
          mainValue: values[values.length - 1],
          length: values.length,
          cards,
        };
      }
    }

    // --- 飞机带翼（带单张）airplane_single ---
    // 飞机部分 k 组连续三张 + k 张单牌，总牌数 = k*3 + k = k*4
    if (n >= 8 && n % 4 === 0) {
      const k = n / 4; // 飞机组数
      const tripleVals = values
        .filter((v) => groups.get(v).length >= 3)
        .sort((a, b) => a - b);

      // 尝试从 tripleVals 中找到 k 个连续的三张组
      for (let start = 0; start + k <= tripleVals.length; start++) {
        const segment = tripleVals.slice(start, start + k);
        if (segment[segment.length - 1] > 14) break; // 不能含2
        if (this.isConsecutive(segment)) {
          // 检查剩余牌是否恰好是 k 张单牌（每个翼 value 只出现 1 张）
          let wings = 0;
          let valid = true;
          for (const v of values) {
            const groupSize = groups.get(v).length;
            const inPlane = segment.includes(v);
            if (inPlane) {
              // 飞机部分应正好 3 张
              if (groupSize !== 3) {
                valid = false;
                break;
              }
            } else {
              // 翼牌部分：每个 value 只能出现 1 张
              if (groupSize !== 1) {
                valid = false;
                break;
              }
              wings++;
            }
          }
          if (valid && wings === k) {
            return {
              type: "airplane_single",
              mainValue: segment[segment.length - 1],
              length: k,
              cards,
            };
          }
        }
      }
    }

    // --- 飞机带翼（带对子）airplane_pair ---
    // 飞机部分 k 组连续三张 + k 个对子，总牌数 = k*3 + k*2 = k*5
    if (n >= 10 && n % 5 === 0) {
      const k = n / 5;
      const tripleVals = values
        .filter((v) => groups.get(v).length >= 3)
        .sort((a, b) => a - b);

      for (let start = 0; start + k <= tripleVals.length; start++) {
        const segment = tripleVals.slice(start, start + k);
        if (segment[segment.length - 1] > 14) break;
        if (this.isConsecutive(segment)) {
          // 检查剩余部分是否恰好是 k 个对子（每个翼 value 出现 2 张，不能是王）
          let wingPairs = 0;
          let valid = true;
          for (const v of values) {
            const groupSize = groups.get(v).length;
            const inPlane = segment.includes(v);
            if (inPlane) {
              if (groupSize !== 3) {
                valid = false;
                break;
              }
            } else {
              // 翼牌对子：每个 value 恰好 2 张，且不能是王
              if (groupSize !== 2 || v >= 16) {
                valid = false;
                break;
              }
              wingPairs++;
            }
          }
          if (valid && wingPairs === k) {
            return {
              type: "airplane_pair",
              mainValue: segment[segment.length - 1],
              length: k,
              cards,
            };
          }
        }
      }
    }

    return null;
  },

  /**
   * 判断当前牌型能否压过上一手
   * @param {object} currentPlay - 要出的牌型
   * @param {object|null} lastPlay - 桌面上的上一手牌型
   * @returns {boolean}
   */
  canBeat(currentPlay, lastPlay) {
    if (!currentPlay) return false;
    if (!lastPlay) return true;
    if (lastPlay.type === "rocket") return false;

    // 王炸压一切
    if (currentPlay.type === "rocket") return true;

    // 炸弹压非炸弹非王炸
    if (
      currentPlay.type === "bomb" &&
      lastPlay.type !== "bomb" &&
      lastPlay.type !== "rocket"
    ) {
      return true;
    }

    // 炸弹之间比大小
    if (currentPlay.type === "bomb" && lastPlay.type === "bomb") {
      return currentPlay.mainValue > lastPlay.mainValue;
    }

    // 王炸之间（理论上只有一副王炸，不会出现）
    if (currentPlay.type === "rocket" && lastPlay.type === "rocket") {
      return false;
    }

    // 同类型才能比较
    if (currentPlay.type !== lastPlay.type) return false;

    // 顺子/连对/飞机：长度必须一致
    const lengthSensitive = [
      "straight",
      "consecutive_pairs",
      "airplane",
      "airplane_single",
      "airplane_pair",
    ];
    if (lengthSensitive.includes(currentPlay.type)) {
      if (currentPlay.length !== lastPlay.length) return false;
    }

    // 同类型比 mainValue
    return currentPlay.mainValue > lastPlay.mainValue;
  },
};

/* ==========================================================
 *  AI 辅助 —— 生成所有合法牌型候选
 * ========================================================== */

/**
 * 从手牌生成所有合法出牌候选（含顺子/连对/飞机等复杂牌型）
 * @param {Card[]} hand - 手牌
 * @returns {object[]} PlayResult 数组
 */
function generateAllPatterns(hand) {
  const patterns = [];

  // 按 value 分组
  const groups = {};
  for (const c of hand) {
    if (!groups[c.value]) groups[c.value] = [];
    groups[c.value].push(c);
  }
  const groupValues = Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b);

  // 1. 单张候选
  for (const v of groupValues) {
    patterns.push({
      type: "single",
      mainValue: v,
      length: 1,
      cards: [groups[v][0]],
    });
  }

  // 2. 对子候选
  for (const v of groupValues) {
    if (groups[v].length >= 2) {
      patterns.push({
        type: "pair",
        mainValue: v,
        length: 2,
        cards: groups[v].slice(0, 2),
      });
    }
  }

  // 3. 三张候选
  for (const v of groupValues) {
    if (groups[v].length >= 3) {
      patterns.push({
        type: "triple",
        mainValue: v,
        length: 3,
        cards: groups[v].slice(0, 3),
      });
    }
  }

  // 4. 三带一候选（搭配最小的单牌，避免组合爆炸）
  for (const v of groupValues) {
    if (groups[v].length >= 3) {
      for (const otherV of groupValues) {
        if (otherV === v) continue;
        patterns.push({
          type: "triple_one",
          mainValue: v,
          length: 4,
          cards: [...groups[v].slice(0, 3), groups[otherV][0]],
        });
        break;
      }
    }
  }

  // 5. 三带对候选
  for (const v of groupValues) {
    if (groups[v].length >= 3) {
      for (const otherV of groupValues) {
        if (otherV === v) continue;
        if (groups[otherV].length >= 2) {
          patterns.push({
            type: "triple_pair",
            mainValue: v,
            length: 5,
            cards: [...groups[v].slice(0, 3), ...groups[otherV].slice(0, 2)],
          });
          break;
        }
      }
    }
  }

  // 6. 炸弹候选
  for (const v of groupValues) {
    if (groups[v].length === 4) {
      patterns.push({
        type: "bomb",
        mainValue: v,
        length: 4,
        cards: groups[v].slice(0, 4),
      });
    }
  }

  // 7. 王炸候选
  if (groups[16] && groups[17]) {
    patterns.push({
      type: "rocket",
      mainValue: 999,
      length: 2,
      cards: [groups[16][0], groups[17][0]],
    });
  }

  // 8. 四带二候选
  for (const v of groupValues) {
    if (groups[v].length === 4) {
      // 找两张最小的单牌（不同 value，非该四张）
      const singles = [];
      for (const ov of groupValues) {
        if (ov === v) continue;
        singles.push(groups[ov][0]);
        if (singles.length === 2) break;
      }
      if (singles.length === 2) {
        patterns.push({
          type: "four_two",
          mainValue: v,
          length: 6,
          cards: [...groups[v].slice(0, 4), singles[0], singles[1]],
        });
      }
    }
  }

  // 9. 顺子候选（3~A，5张及以上连续）
  // 只用 value 3~14 的单牌，不含 2(15) 和王
  const straightVals = groupValues.filter((v) => v <= 14);
  for (let len = 5; len <= 12; len++) {
    for (let start = 0; start + len <= straightVals.length; start++) {
      const segment = straightVals.slice(start, start + len);
      let consecutive = true;
      for (let i = 1; i < segment.length; i++) {
        if (segment[i] !== segment[i - 1] + 1) {
          consecutive = false;
          break;
        }
      }
      if (consecutive) {
        patterns.push({
          type: "straight",
          mainValue: segment[segment.length - 1],
          length: len,
          cards: segment.map((v) => groups[v][0]),
        });
      }
    }
  }

  // 10. 连对候选（3对及以上连续对子，不含2和王）
  const pairVals = groupValues.filter((v) => v <= 14 && groups[v].length >= 2);
  for (let len = 3; len <= 10; len++) {
    for (let start = 0; start + len <= pairVals.length; start++) {
      const segment = pairVals.slice(start, start + len);
      let consecutive = true;
      for (let i = 1; i < segment.length; i++) {
        if (segment[i] !== segment[i - 1] + 1) {
          consecutive = false;
          break;
        }
      }
      if (consecutive) {
        const cards = [];
        for (const v of segment) cards.push(...groups[v].slice(0, 2));
        patterns.push({
          type: "consecutive_pairs",
          mainValue: segment[segment.length - 1],
          length: len,
          cards,
        });
      }
    }
  }

  // 11. 纯飞机候选（2组及以上连续三张，不含2和王）
  const tripleVals = groupValues.filter(
    (v) => v <= 14 && groups[v].length >= 3,
  );
  for (let len = 2; len <= 6; len++) {
    for (let start = 0; start + len <= tripleVals.length; start++) {
      const segment = tripleVals.slice(start, start + len);
      let consecutive = true;
      for (let i = 1; i < segment.length; i++) {
        if (segment[i] !== segment[i - 1] + 1) {
          consecutive = false;
          break;
        }
      }
      if (consecutive) {
        const cards = [];
        for (const v of segment) cards.push(...groups[v].slice(0, 3));
        patterns.push({
          type: "airplane",
          mainValue: segment[segment.length - 1],
          length: len,
          cards,
        });
      }
    }
  }

  // 12. 飞机带翼（带单张）候选
  for (let len = 2; len <= 5; len++) {
    for (let start = 0; start + len <= tripleVals.length; start++) {
      const segment = tripleVals.slice(start, start + len);
      let consecutive = true;
      for (let i = 1; i < segment.length; i++) {
        if (segment[i] !== segment[i - 1] + 1) {
          consecutive = false;
          break;
        }
      }
      if (!consecutive) continue;

      // 收集 len 张单牌作为翼（来自非飞机部分的 value，每组取1张）
      const wingVals = groupValues.filter((v) => !segment.includes(v));
      if (wingVals.length >= len) {
        const wingCards = wingVals.slice(0, len).map((v) => groups[v][0]);
        const planeCards = [];
        for (const v of segment) planeCards.push(...groups[v].slice(0, 3));
        patterns.push({
          type: "airplane_single",
          mainValue: segment[segment.length - 1],
          length: len,
          cards: [...planeCards, ...wingCards],
        });
      }
    }
  }

  // 13. 飞机带翼（带对子）候选
  for (let len = 2; len <= 4; len++) {
    for (let start = 0; start + len <= tripleVals.length; start++) {
      const segment = tripleVals.slice(start, start + len);
      let consecutive = true;
      for (let i = 1; i < segment.length; i++) {
        if (segment[i] !== segment[i - 1] + 1) {
          consecutive = false;
          break;
        }
      }
      if (!consecutive) continue;

      // 收集 len 个对子作为翼
      const wingPairVals = groupValues.filter(
        (v) => !segment.includes(v) && groups[v].length >= 2,
      );
      if (wingPairVals.length >= len) {
        const wingCards = [];
        for (const v of wingPairVals.slice(0, len))
          wingCards.push(...groups[v].slice(0, 2));
        const planeCards = [];
        for (const v of segment) planeCards.push(...groups[v].slice(0, 3));
        patterns.push({
          type: "airplane_pair",
          mainValue: segment[segment.length - 1],
          length: len,
          cards: [...planeCards, ...wingCards],
        });
      }
    }
  }

  for (const value of groupValues) {
    if (groups[value].length !== 4) continue;
    const extras = hand
      .filter((card) => card.value !== value)
      .sort((a, b) => a.value - b.value);
    if (extras.length >= 2)
      patterns.push({ cards: [...groups[value], ...extras.slice(0, 2)] });
    const pairs = groupValues.filter(
      (v) => v !== value && groups[v].length >= 2,
    );
    if (pairs.length >= 2)
      patterns.push({
        cards: [
          ...groups[value],
          ...groups[pairs[0]].slice(0, 2),
          ...groups[pairs[1]].slice(0, 2),
        ],
      });
  }
  // The evaluator is the single source of truth for both AI and hint candidates.
  const seen = new Set();
  return patterns
    .map((pattern) => HandEvaluator.analyze(pattern.cards))
    .filter((pattern) => {
      if (!pattern) return false;
      const key = pattern.cards
        .map((card) => card.id)
        .sort()
        .join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/* ==========================================================
 *  GameController 类 —— 游戏核心控制器
 *  状态机管理、回合调度、牌型校验、AI决策、UI渲染协调
 * ========================================================== */
class GameController {
  constructor() {
    // 玩家: 0=人类(底部), 1=左AI, 2=右AI
    this.players = [
      new Player(0, "你", true),
      new Player(1, "阿橘", false),
      new Player(2, "老 K", false),
    ];
    this.deck = null;
    this.bottomCards = [];
    this.state = "init"; // init|dealing|bidding|playing|ended
    this.currentPlayer = 0;
    this.landlordId = null;
    this.lastPlay = null; // 桌面上当前需要压制的出牌
    this.lastPlayerId = null; // 最后一次有效出牌的玩家
    this.passCount = 0; // 连续过牌计数
    this.bidIndex = 0; // 叫地主当前轮到的玩家索引
    this.bidResults = []; // 各玩家叫地主结果
    this.bidStartIndex = 0; // 本轮叫地主起始玩家
    this.aiTimer = null; // AI 延迟计时器
    this.hintIndex = -1; // 提示功能的候选索引

    // —— 出牌倒计时相关 ——
    this.timerInterval = null; // requestAnimationFrame 或 setInterval 句柄
    this.timerPlayerId = -1; // 当前倒计时对应的玩家
    this.timerDeadline = 0; // 倒计时截止时间戳（ms）
    this.timerDuration = 15; // 倒计时总秒数
    this.timerRAF = null; // requestAnimationFrame 句柄
    this.timerCircumference = 0; // SVG 圆周长（用于进度条计算）

    // —— 音效管理 ——
    this.sound = new SoundManager();

    this.tasks = new Set();
    this.paused = false;
    this.pausedTimer = null;
    this.autoPlay = false;
    this.playedCards = [];
    this.history = [];
    this.playCounts = [0, 0, 0];
    this.multiplier = 1;
    this.spring = false;
    this.roundNumber = 0;
    this.settings = this.readStorage("moyu-settings", {
      sound: true,
      motion: false,
      duration: 30,
      speed: "normal",
    });
    this.settings.duration = [15, 30, 60].includes(this.settings.duration)
      ? this.settings.duration
      : 30;
    this.settings.speed = this.settings.speed === "fast" ? "fast" : "normal";
    this.stats = this.readStorage("moyu-stats", {
      score: 1000,
      games: 0,
      wins: 0,
      streak: 0,
      bestStreak: 0,
      recent: [],
    });
    for (const key of ["score", "games", "wins", "streak", "bestStreak"]) {
      if (!Number.isFinite(this.stats[key]))
        this.stats[key] = key === "score" ? 1000 : 0;
    }
    if (!Array.isArray(this.stats.recent)) this.stats.recent = [];
    this.tipIndex = 0;
    this.tips = [
      "农民是一队的。队友出得好，不妨让一手。",
      "顺子、连对和飞机里，不能带上 2 和大小王。",
      "不急着拆开炸弹，好牌要留在最需要的时候。",
      "按 H 换一组提示，按 Esc 取消选牌，Enter 出牌。",
    ];
    this.setupAvatars();
    this.applySettings();

    // 绑定 DOM 事件
    this.bindEvents();
    this.showLobby();
  }

  readStorage(key, defaults) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === "object" && !Array.isArray(value)
        ? { ...defaults, ...value }
        : { ...defaults };
    } catch {
      return { ...defaults };
    }
  }

  writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      this.toast("浏览器暂时无法保存数据，本次仍可正常游玩");
    }
  }

  saveSettings() {
    this.writeStorage("moyu-settings", this.settings);
  }

  applySettings() {
    this.sound.enabled = Boolean(this.settings.sound);
    document.body.classList.toggle(
      "reduced-motion",
      Boolean(this.settings.motion),
    );
    document.getElementById("settingSound").checked = Boolean(
      this.settings.sound,
    );
    document.getElementById("settingMotion").checked = Boolean(
      this.settings.motion,
    );
    document.getElementById("settingDuration").value = String(
      this.settings.duration,
    );
    document.getElementById("settingSpeed").value = this.settings.speed;
    const sound = document.getElementById("btnSound");
    sound.classList.toggle("muted", !this.settings.sound);
    sound.setAttribute(
      "aria-label",
      this.settings.sound ? "关闭音效" : "开启音效",
    );
    sound.setAttribute("aria-pressed", String(this.settings.sound));
  }

  setupAvatars() {
    const portraits = [
      '<path d="M4 60Q8 35 30 38T56 60" fill="#5c785c"/><ellipse cx="30" cy="28" rx="15" ry="18" fill="#efcfa3"/><path d="M13 25Q11 6 31 6q20 0 16 22l-7-10-14 1-12 7" fill="#34483d"/><path d="M14 26Q7 13 19 13l3 10m19-2q12-10 7 7" fill="#34483d"/><path d="M24 30h1m10 0h1m-10 7q4 3 8-1" stroke="#5a4b3a" stroke-width="2" stroke-linecap="round"/>',
      '<path d="M0 60q7-23 30-20t30 20" fill="#c46b41"/><ellipse cx="30" cy="30" rx="15" ry="18" fill="#f0c998"/><path d="M12 30V19Q15 4 29 7q20-2 19 20l-7-8q-10 8-22 2l-3 12Z" fill="#65452f"/><path d="M23 31h1m11 0h1m-10 8q5 3 9-2" stroke="#73503a" stroke-width="2" stroke-linecap="round"/><path d="M9 15q3-12 21-12 13-1 19 9l-8 3Z" fill="#dd9451"/>',
      '<path d="M0 60q10-24 30-20t30 20" fill="#425b4f"/><ellipse cx="30" cy="29" rx="15" ry="18" fill="#dfb990"/><path d="M13 26Q9 8 29 6q21-1 18 23l-7-11-22 3-4 8" fill="#364c41"/><path d="M11 18q20-8 39 0" stroke="#364c41" stroke-width="6" stroke-linecap="round"/><g fill="none" stroke="#425447" stroke-width="2"><rect x="18" y="27" width="10" height="7" rx="3"/><rect x="32" y="27" width="10" height="7" rx="3"/><path d="M28 29h4m-6 10h8"/></g>',
    ];
    portraits.forEach((portrait, i) => {
      document.getElementById(`avatar-${i}`).innerHTML =
        `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${portrait}</svg>`;
    });
  }

  schedule(callback, delay) {
    const task = {
      callback,
      remaining: delay,
      started: performance.now(),
      handle: null,
    };
    this.tasks.add(task);
    if (!this.paused) this.armTask(task);
    return task;
  }

  armTask(task) {
    task.started = performance.now();
    task.handle = setTimeout(
      () => {
        if (!this.tasks.has(task)) return;
        this.tasks.delete(task);
        task.callback();
      },
      Math.max(0, task.remaining),
    );
  }

  cancelTask(task) {
    if (!task) return;
    clearTimeout(task.handle);
    this.tasks.delete(task);
  }

  cancelAllTasks() {
    for (const task of this.tasks) clearTimeout(task.handle);
    this.tasks.clear();
    document.querySelectorAll(".rocket-flash").forEach((el) => el.remove());
    document.getElementById("gameTable").classList.remove("shake");
    document.querySelectorAll(".play-bubble, .bid-info").forEach((el) => {
      el.classList.remove("show");
      el.setAttribute("aria-hidden", "true");
    });
  }

  pauseGame() {
    if (this.paused || ["ready", "ended", "init"].includes(this.state)) return;
    this.paused = true;
    if (this.timerPlayerId >= 0) {
      this.pausedTimer = {
        player: this.timerPlayerId,
        remaining: Math.max(
          0.1,
          (this.timerDeadline - performance.now()) / 1000,
        ),
      };
      this.stopTimer();
    }
    for (const task of this.tasks) {
      clearTimeout(task.handle);
      task.remaining = Math.max(
        0,
        task.remaining - (performance.now() - task.started),
      );
    }
    this.updateActionButtons();
  }

  resumeGame() {
    if (!this.paused || document.hidden) return;
    this.paused = false;
    for (const task of this.tasks) this.armTask(task);
    if (this.pausedTimer) {
      this.startTimer(this.pausedTimer.player, this.pausedTimer.remaining);
      this.pausedTimer = null;
    }
    this.updateActionButtons();
  }

  openDialog(id) {
    if (document.querySelector("dialog[open]")) return;
    this.renderStats();
    this.pauseGame();
    document.getElementById(id).showModal();
  }

  requestNewGame() {
    if (["ready", "ended"].includes(this.state)) this.startGame();
    else this.openDialog("confirmDialog");
  }

  showLobby() {
    this.cancelAllTasks();
    this.stopTimer();
    this.state = "ready";
    this.paused = false;
    this.pausedTimer = null;
    this.autoPlay = false;
    this.landlordId = null;
    this.lastPlay = null;
    this.lastPlayerId = null;
    this.playedCards = [];
    this.multiplier = 1;
    this.history = [];
    this.players.forEach((player) => {
      player.hand = [];
      player.lastPlay = null;
      player.role = "pending";
    });
    document.getElementById("bidModal").classList.remove("show");
    document.getElementById("activityLog").innerHTML =
      '<div class="empty-log"><svg class="icon"><use href="#i-clock"/></svg><p>好故事，从发牌开始</p><span>开局后，这里会记录每一步</span></div>';
    document.getElementById("logCount").textContent = "实时记录";
    this.setMessage("");
    this.renderAll();
  }

  beginTurn() {
    if (this.state !== "playing") return;
    if (this.currentPlayer !== 0 || this.autoPlay) this.aiTurn();
    else {
      this.setMessage(
        this.lastPlay
          ? `轮到你了 · 接${this.players[this.lastPlayerId].name}的${this.patternName(this.lastPlay.type)}`
          : "轮到你自由出牌，打出喜欢的那一手",
      );
      this.updateActionButtons();
      this.startTimer(0, this.settings.duration);
    }
  }

  toggleAuto() {
    if (this.state !== "playing" || this.paused) return;
    this.autoPlay = !this.autoPlay;
    this.players[0].clearSelection();
    if (this.currentPlayer === 0) {
      this.cancelTask(this.aiTimer);
      this.stopTimer();
      this.beginTurn();
    }
    this.renderAll();
    this.toast(
      this.autoPlay ? "放心歇一会儿，AI 帮你出牌" : "已取消托管，好牌交给你",
    );
  }

  patternName(type) {
    return (
      {
        single: "单张",
        pair: "对子",
        triple: "三张",
        triple_one: "三带一",
        triple_pair: "三带对",
        straight: "顺子",
        consecutive_pairs: "连对",
        airplane: "飞机",
        airplane_single: "飞机带单",
        airplane_pair: "飞机带对",
        four_two: "四带二",
        four_pairs: "四带两对",
        bomb: "炸弹",
        rocket: "王炸",
      }[type] || "出牌"
    );
  }

  cardText(cards) {
    return cards
      .map((card) =>
        card.isJoker ? (card.value === 17 ? "大王" : "小王") : card.rank,
      )
      .join(" ");
  }

  log(name, text) {
    this.history.push({ name, text });
    const log = document.getElementById("activityLog");
    if (this.history.length === 1) log.replaceChildren();
    const row = document.createElement("div");
    row.className = "log-item";
    const content = document.createElement("span");
    const who = document.createElement("strong");
    who.textContent = name;
    content.append(who, text);
    const index = document.createElement("time");
    index.textContent = String(this.history.length).padStart(2, "0");
    row.append(content, index);
    log.prepend(row);
    if (log.children.length > 80) log.lastElementChild.remove();
    document.getElementById("logCount").textContent =
      `${this.history.length} 条动态`;
  }

  renderTracker() {
    const tracker = document.getElementById("cardTracker");
    tracker.replaceChildren();
    const counts = new Map(
      Array.from({ length: 15 }, (_, i) => [i + 3, i + 3 >= 16 ? 1 : 4]),
    );
    // Only use public plays and the human hand; never peek at opponents or unrevealed bottom cards.
    for (const card of [...this.playedCards, ...this.players[0].hand])
      counts.set(card.value, counts.get(card.value) - 1);
    for (let value = 17; value >= 3; value--) {
      const cell = document.createElement("div");
      cell.className = `tracker-item${value >= 16 ? " joker" : ""}${counts.get(value) === 0 ? " exhausted" : ""}`;
      const rank = document.createElement("b");
      rank.textContent =
        { 17: "大王", 16: "小王", 15: "2", 14: "A", 13: "K", 12: "Q", 11: "J" }[
          value
        ] || String(value);
      const count = document.createElement("small");
      count.textContent =
        this.state === "ready" ? "—" : String(counts.get(value));
      cell.setAttribute(
        "aria-label",
        `${rank.textContent}：${this.state === "ready" ? "等待开局" : `剩余 ${counts.get(value)} 张`}`,
      );
      cell.append(rank, count);
      tracker.appendChild(cell);
    }
  }

  renderStats() {
    const s = this.stats;
    document.getElementById("scoreValue").textContent =
      s.score.toLocaleString();
    document.getElementById("gamesValue").textContent = s.games;
    const rate = s.games ? `${Math.round((s.wins / s.games) * 100)}%` : "—";
    document.getElementById("winRateValue").textContent = rate;
    document.getElementById("streakValue").textContent = s.streak;
    const detail = document.getElementById("detailStats");
    detail.replaceChildren();
    for (const [value, label] of [
      [s.games, "总对局"],
      [s.wins, "获胜场次"],
      [rate, "胜率"],
      [s.bestStreak, "最高连胜"],
    ]) {
      const cell = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = value;
      const small = document.createElement("small");
      small.textContent = label;
      cell.append(strong, small);
      detail.appendChild(cell);
    }
    const recent = document.getElementById("recentGames");
    recent.replaceChildren();
    if (!s.recent.length) {
      const empty = document.createElement("p");
      empty.className = "rule-note";
      empty.textContent = "还没有牌局记录，第一场好牌正等着你。";
      recent.appendChild(empty);
    }
    for (const item of s.recent) {
      if (
        !item ||
        !Number.isFinite(item.delta) ||
        !Number.isFinite(Date.parse(item.date))
      )
        continue;
      const row = document.createElement("div");
      row.className = "recent-game";
      const result = document.createElement("span");
      result.textContent = `${item.won ? "胜利" : "再接再厉"} · ${item.role === "landlord" ? "地主" : "农民"}`;
      const time = document.createElement("time");
      time.textContent = new Date(item.date).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const delta = document.createElement("strong");
      delta.className = item.delta > 0 ? "positive" : "negative";
      delta.textContent = `${item.delta > 0 ? "+" : ""}${item.delta}`;
      row.append(result, time, delta);
      recent.appendChild(row);
    }
  }

  toast(text) {
    const element = document.getElementById("toast");
    element.textContent = text;
    element.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => element.classList.remove("show"), 2400);
  }

  /* ========== 出牌倒计时 ========== */

  /**
   * 启动倒计时
   * @param {number} playerId - 当前行动玩家
   * @param {number} duration - 倒计时秒数（默认 15 秒）
   */
  startTimer(playerId, duration = 15) {
    // 先清除上一个定时器，防止多个同时运行
    this.stopTimer();

    this.timerPlayerId = playerId;
    this.timerDuration = duration;
    this.timerDeadline = performance.now() + duration * 1000;

    // 获取全局唯一倒计时容器
    const timerEl = document.getElementById("timer-display");
    if (!timerEl) return;

    // 计算并设置倒计时位置（定位到当前玩家头像附近）
    this.updateTimerPosition(playerId);

    const fgCircle = timerEl.querySelector(".timer-fg-circle");
    const r = parseFloat(fgCircle.getAttribute("r"));
    this.timerCircumference = 2 * Math.PI * r;

    // 初始化进度条为满圈
    fgCircle.style.strokeDasharray = this.timerCircumference;
    fgCircle.style.strokeDashoffset = 0;

    // 显示倒计时 UI
    this.showTimerUI(true);

    // 使用 requestAnimationFrame 实现平滑更新
    const tick = () => {
      const now = performance.now();
      const remaining = (this.timerDeadline - now) / 1000; // 剩余秒数

      if (remaining <= 0) {
        // 倒计时结束
        this.stopTimer();
        this.handleTimeout(playerId);
        return;
      }

      this.updateTimerUI(remaining);
      this.timerRAF = requestAnimationFrame(tick);
    };
    this.timerRAF = requestAnimationFrame(tick);
  }

  /** 停止倒计时，清除定时器和 UI */
  stopTimer() {
    if (this.timerRAF) {
      cancelAnimationFrame(this.timerRAF);
      this.timerRAF = null;
    }

    // 隐藏倒计时 UI
    this.showTimerUI(false);

    this.timerPlayerId = -1;
  }

  /**
   * 超时处理：自动执行默认操作
   * @param {number} playerId - 超时的玩家
   */
  handleTimeout(playerId) {
    if (this.paused || this.currentPlayer !== playerId) return;
    if (this.state === "bidding") {
      this.handleBid(false);
      return;
    }
    if (this.state !== "playing") return;
    this.cancelTask(this.aiTimer);
    this.showBubble(
      playerId,
      playerId === 0 ? "到时间，帮你走一手" : "思考完毕",
    );
    this.aiPlay(this.players[playerId]);
  }

  /**
   * 动态计算并设置倒计时容器的位置
   * 底部人类玩家：头像上方 70px；顶部AI玩家：头像下方 70px
   * @param {number} playerId - 当前行动玩家
   */
  updateTimerPosition(playerId) {
    const timerEl = document.getElementById("timer-display");
    const table = document.getElementById("gameTable").getBoundingClientRect();
    const zone = document
      .getElementById(`zone-${playerId}`)
      .getBoundingClientRect();
    const mobile = table.width < 500;
    const left =
      playerId === 0
        ? table.width / 2 + (mobile ? 49 : 65)
        : playerId === 1
          ? zone.left - table.left + (mobile ? 5 : 0)
          : zone.right - table.left - 48;
    const top =
      playerId === 0 ? 20 : zone.top - table.top + (mobile ? 88 : 102);
    timerEl.style.left = `${Math.max(8, Math.min(left, table.width - 50))}px`;
    timerEl.style.top = `${Math.max(8, top)}px`;
  }

  /**
   * 显示/隐藏倒计时 UI
   * @param {boolean} show
   */
  showTimerUI(show) {
    const timerEl = document.getElementById("timer-display");
    if (!timerEl) return;

    timerEl.setAttribute("aria-hidden", String(!show));
    if (show) {
      timerEl.classList.add("show");
      // 重置阶段样式
      timerEl.classList.remove("warning", "danger");
    } else {
      timerEl.classList.remove("show", "warning", "danger");
    }
  }

  /**
   * 更新倒计时 UI（进度条 + 数字 + 阶段变色）
   * @param {number} remaining - 剩余秒数
   */
  updateTimerUI(remaining) {
    const timerEl = document.getElementById("timer-display");
    if (!timerEl) return;

    const fgCircle = timerEl.querySelector(".timer-fg-circle");
    const textEl = timerEl.querySelector(".timer-text");

    // 更新数字（向上取整显示，如 14.3s 显示 15）
    textEl.textContent = Math.ceil(remaining);

    // 计算进度条偏移量：剩余比例越小，偏移越大（圆圈越短）
    const ratio = remaining / this.timerDuration; // 0~1
    const offset = this.timerCircumference * (1 - ratio);
    fgCircle.style.strokeDashoffset = offset;

    // 阶段变色
    timerEl.classList.remove("warning", "danger");
    if (remaining <= 3) {
      timerEl.classList.add("danger");
    } else if (remaining <= 5) {
      timerEl.classList.add("warning");
    }
  }

  /* ========== 游戏流程 ========== */

  /** 开始新游戏：生成牌堆→洗牌→发牌→进入叫地主 */
  startGame() {
    this.cancelAllTasks();
    this.stopTimer();
    this.paused = false;
    this.pausedTimer = null;
    this.autoPlay = false;
    this.players.forEach((p) => {
      p.hand = [];
      p.role = "pending";
      p.lastPlay = null;
    });
    this.state = "dealing";
    this.lastPlay = null;
    this.lastPlayerId = null;
    this.passCount = 0;
    this.landlordId = null;
    this.bidResults = [];
    this.hintIndex = -1;
    this.playedCards = [];
    this.history = [];
    this.playCounts = [0, 0, 0];
    this.multiplier = 1;
    this.spring = false;
    this.roundNumber++;
    document.getElementById("bidModal").classList.remove("show");
    document.getElementById("bidInfo").classList.remove("show");
    for (let i = 0; i < 3; i++)
      document.getElementById(`bubble-${i}`).classList.remove("show");
    this.deck = new Deck();
    const dealt = this.deck.deal();
    for (let i = 0; i < 3; i++) {
      this.players[i].hand = dealt.players[i];
      this.players[i].sortHand();
    }
    this.bottomCards = dealt.bottom;
    this.log("牌桌", "新一局，发牌完成");
    this.setMessage("好牌已到位，准备叫地主");
    this.renderAll();
    this.schedule(() => this.startBidding(), 600);
  }

  /** 开始叫地主阶段 */
  startBidding() {
    if (this.state !== "dealing") return;
    this.state = "bidding";
    this.bidIndex = 0;
    // 随机选择起始叫地主玩家
    this.bidStartIndex = Math.floor(Math.random() * 3);
    this.bidResults = [];

    this.setMessage("叫地主阶段开始！");
    this.renderAll();

    // 延迟后触发第一个玩家叫地主
    this.schedule(() => this.processBid(), 600);
  }

  /** 获取当前叫地主的玩家索引（循环取模，避免越界） */
  getBidPlayerIndex() {
    return (this.bidStartIndex + this.bidIndex) % 3;
  }

  /** 处理叫地主流程（轮到 bidIndex 对应玩家） */
  processBid() {
    if (this.state !== "bidding") return;
    const player = this.players[this.getBidPlayerIndex()];
    this.currentPlayer = player.id;
    this.renderAll();
    this.setMessage(
      player.isHuman
        ? "看看手牌，决定是否叫地主"
        : `${player.name} 正在考虑要不要叫地主`,
    );
    if (player.isHuman) {
      document.getElementById("bidModal").classList.add("show");
      this.startTimer(0, this.settings.duration);
    } else {
      this.aiTimer = this.schedule(
        () => this.handleBid(this.aiBid(player)),
        this.settings.speed === "fast" ? 250 : 1000,
      );
    }
  }

  /** 处理一个玩家的叫地主选择 */
  handleBid(wantLandlord) {
    if (this.state !== "bidding") return false;
    const player = this.players[this.getBidPlayerIndex()];
    this.stopTimer();
    this.cancelTask(this.aiTimer);
    this.bidResults.push({ playerId: player.id, wantLandlord });
    document.getElementById("bidModal").classList.remove("show");
    this.log(player.name, wantLandlord ? "叫地主" : "不叫");
    this.showBidInfo(`${player.name}${wantLandlord ? "叫地主" : "不叫"}`);
    if (wantLandlord) {
      this.sound.bid();
      this.finishBidding(player.id);
    } else {
      this.sound.bidPass();
      this.bidIndex++;
      // Leave the bidding state while waiting so duplicate clicks cannot advance it twice.
      this.state = "bid-wait";
      if (this.bidIndex >= 3) {
        this.setMessage("这副牌没人心动，重新发一副");
        this.schedule(() => this.startGame(), 1400);
      } else {
        this.schedule(() => {
          this.state = "bidding";
          this.processBid();
        }, 650);
      }
      this.renderAll();
    }
    return true;
  }

  /** 叫地主结束，确定地主并进入出牌阶段 */
  finishBidding(landlordId) {
    if (this.state !== "bidding") return;
    this.landlordId = landlordId;
    for (const player of this.players)
      player.role = player.id === landlordId ? "landlord" : "farmer";
    const landlord = this.players[landlordId];
    landlord.addCards(this.bottomCards);
    this.currentPlayer = landlordId;
    this.state = "playing";
    this.lastPlay = null;
    this.lastPlayerId = null;
    this.passCount = 0;
    this.log(
      "牌桌",
      `${landlord.name}成为地主，底牌 ${this.cardText(this.bottomCards)}`,
    );
    this.setMessage(`${landlord.name}成为地主，先出牌`);
    this.renderAll();
    this.beginTurn();
  }

  /* ========== 出牌与过牌 ========== */

  /**
   * 根据牌型播放对应音效和动画
   * @param {object} pattern - HandEvaluator.analyze 返回的牌型对象
   */
  playSoundAndAnimation(pattern) {
    if (pattern.type === "rocket") {
      // 王炸：华丽音效 + 全屏金色闪光
      this.sound.rocket();
      this.triggerRocketFlash();
    } else if (pattern.type === "bomb") {
      // 炸弹：低频轰鸣 + 屏幕震动
      this.sound.bomb();
      this.triggerShake();
    } else {
      // 普通出牌：短促"哔"声
      this.sound.play();
    }
  }

  /** 触发屏幕震动效果 */
  triggerShake() {
    if (
      this.settings.motion ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const table = document.getElementById("gameTable");
    table.classList.remove("shake");
    // 强制重排以重启动画
    void table.offsetWidth;
    table.classList.add("shake");
    this.schedule(() => table.classList.remove("shake"), 500);
  }

  /** 触发王炸全屏金色闪光 */
  triggerRocketFlash() {
    if (
      this.settings.motion ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const flash = document.createElement("div");
    flash.className = "rocket-flash";
    document.body.appendChild(flash);
    this.schedule(() => flash.remove(), 800);
  }

  /** 玩家出牌入口 */
  playCards(playerId, cards) {
    if (
      this.paused ||
      this.state !== "playing" ||
      this.currentPlayer !== playerId ||
      !Array.isArray(cards) ||
      !cards.length
    )
      return false;
    const hand = this.players[playerId].hand;
    const ids = new Set(cards.map((c) => c.id));
    if (ids.size !== cards.length || cards.some((c) => !hand.includes(c)))
      return false;
    // 1. 检测牌型
    const pattern = HandEvaluator.analyze(cards);
    if (!pattern) {
      this.setMessage("牌型不合法！");
      return false;
    }

    // 2. 校验能否压过上一手
    if (!HandEvaluator.canBeat(pattern, this.lastPlay)) {
      this.setMessage("你的牌压不过上家！");
      return false;
    }

    // 3. 执行出牌
    const player = this.players[playerId];
    player.removeCards(cards);
    player.clearSelection();
    player.lastPlay = pattern;
    this.cancelTask(this.aiTimer);
    this.playedCards.push(...cards);
    this.playCounts[playerId]++;
    if (pattern.type === "bomb" || pattern.type === "rocket")
      this.multiplier *= 2;
    this.log(
      player.name,
      `${this.patternName(pattern.type)} · ${this.cardText(cards)}`,
    );
    this.hintIndex = -1;

    // 停止当前倒计时
    this.stopTimer();

    // 更新桌面状态
    this.lastPlay = pattern;
    this.lastPlayerId = playerId;
    this.passCount = 0;

    // 播放音效和动画
    this.playSoundAndAnimation(pattern);

    this.renderAll();

    // 4. 检查胜负
    if (this.checkWin()) return true;

    // 5. 推进到下一回合
    this.nextTurn();
    return true;
  }

  /** 玩家过牌 */
  pass(playerId) {
    if (
      this.paused ||
      this.state !== "playing" ||
      this.currentPlayer !== playerId ||
      !this.lastPlay
    )
      return false;
    this.players[playerId].clearSelection();
    this.players[playerId].lastPlay = null;
    this.cancelTask(this.aiTimer);
    this.stopTimer();
    this.sound.pass();
    this.passCount++;
    this.hintIndex = -1;
    this.log(this.players[playerId].name, "不出");
    this.showBubble(playerId, "不出");
    if (this.passCount >= 2) {
      this.passCount = 0;
      this.lastPlay = null;
      this.currentPlayer = this.lastPlayerId;
      this.players.forEach((p) => (p.lastPlay = null));
      this.renderAll();
      this.beginTurn();
    } else {
      this.nextTurn();
    }
    return true;
  }

  /** 推进到下一玩家回合 */
  nextTurn() {
    this.currentPlayer = (this.currentPlayer + 1) % 3;
    this.renderAll();
    this.beginTurn();
  }

  /* ========== AI 逻辑 ========== */

  /** AI 回合调度 */
  aiTurn() {
    if (this.state !== "playing") return;
    const player = this.players[this.currentPlayer];
    this.setMessage(
      player.isHuman
        ? "正在托管，随时可以收回操作"
        : `${player.name}正在想一手好牌…`,
    );
    this.startTimer(player.id, 5);
    this.aiTimer = this.schedule(
      () => this.aiPlay(player),
      this.settings.speed === "fast" ? 250 : 1000 + Math.random() * 350,
    );
  }

  /** AI 叫地主决策 */
  aiBid(player) {
    // 手牌含大王或炸弹 → 抢
    const hasBigJoker = player.hand.some((c) => c.value === 17);
    const groups = {};
    let hasBomb = false;
    for (const c of player.hand) {
      groups[c.value] = (groups[c.value] || 0) + 1;
      if (groups[c.value] === 4) hasBomb = true;
    }
    if (hasBigJoker || hasBomb) return true;
    // 否则 30% 概率抢
    return Math.random() < 0.3;
  }

  /** AI 出牌决策 */
  aiPlay(player) {
    if (
      this.paused ||
      this.state !== "playing" ||
      this.currentPlayer !== player.id
    )
      return;
    const patterns = generateAllPatterns(player.hand);
    const legal = patterns.filter((p) =>
      HandEvaluator.canBeat(p, this.lastPlay),
    );
    const finish = legal.find((p) => p.cards.length === player.hand.length);
    if (finish) {
      this.playCards(player.id, finish.cards);
      return;
    }
    if (!legal.length) {
      this.pass(player.id);
      return;
    }
    const teammateLeading =
      this.lastPlay &&
      player.role === "farmer" &&
      this.players[this.lastPlayerId].role === "farmer";
    if (
      teammateLeading &&
      (this.players[this.lastPlayerId].hand.length <= 4 ||
        this.lastPlay.mainValue >= 11)
    ) {
      this.pass(player.id);
      return;
    }
    const enemies = this.players.filter((p) => p.role !== player.role);
    const danger = enemies.some((p) => p.hand.length <= 2);
    const groups = HandEvaluator.groupByValue(player.hand).groups;
    const ranked = legal
      .map((pattern) => {
        const bomb = pattern.type === "bomb" || pattern.type === "rocket";
        let cost =
          pattern.mainValue - pattern.cards.length * (this.lastPlay ? 0 : 3.5);
        if (bomb) cost += danger ? 5 : 65;
        // Preserve triples/bombs instead of needlessly dismantling useful combinations.
        if (pattern.type === "single" || pattern.type === "pair") {
          const original = groups.get(pattern.mainValue).length;
          if (original > pattern.cards.length) cost += original === 4 ? 35 : 8;
        }
        if (
          danger &&
          this.lastPlay &&
          ["single", "pair"].includes(pattern.type)
        )
          cost -= pattern.mainValue * 2;
        return { pattern, cost };
      })
      .sort((a, b) => a.cost - b.cost);
    const chosen = ranked[0].pattern;
    if (
      this.lastPlay &&
      !danger &&
      player.hand.length > 6 &&
      ["bomb", "rocket"].includes(chosen.type)
    )
      this.pass(player.id);
    else this.playCards(player.id, chosen.cards);
  }

  /* ========== 胜负判定 ========== */

  /** 检查是否有玩家手牌为空 */
  checkWin() {
    for (const p of this.players) {
      if (p.cardCount() === 0) {
        const landlordWon = p.role === "landlord";
        // 地主出完 → 地主胜；农民出完 → 农民胜
        const humanIsLandlord = this.players[0].role === "landlord";
        const humanWon =
          (landlordWon && humanIsLandlord) ||
          (!landlordWon && !humanIsLandlord);

        this.endGame(humanWon, landlordWon);
        return true;
      }
    }
    return false;
  }

  /** 结束游戏，显示结果 */
  endGame(humanWon, landlordWon) {
    if (this.state === "ended") return;
    this.state = "ended";
    this.cancelAllTasks();
    this.stopTimer();
    this.autoPlay = false;
    this.spring = landlordWon
      ? this.players
          .filter((p) => p.role === "farmer")
          .every((p) => this.playCounts[p.id] === 0)
      : this.playCounts[this.landlordId] === 1;
    if (this.spring) this.multiplier *= 2;
    const stake =
      10 * this.multiplier * (this.players[0].role === "landlord" ? 2 : 1);
    const delta = humanWon ? stake : -stake;
    this.stats.score += delta;
    this.stats.games++;
    this.stats.wins += humanWon ? 1 : 0;
    this.stats.streak = humanWon ? this.stats.streak + 1 : 0;
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    this.stats.recent.unshift({
      won: humanWon,
      role: this.players[0].role,
      delta,
      multiplier: this.multiplier,
      date: new Date().toISOString(),
    });
    this.stats.recent = this.stats.recent.slice(0, 20);
    this.writeStorage("moyu-stats", this.stats);
    const title = document.getElementById("resultTitle");
    title.textContent = humanWon ? "好牌，打得漂亮。" : "下一手，会更好。";
    title.className = `result-title ${humanWon ? "win" : "lose"}`;
    document.getElementById("resultEmblem").textContent = humanWon ? "♠" : "♣";
    document.getElementById("resultSubtitle").textContent =
      `${landlordWon ? "地主获胜" : "农民携手获胜"}${this.spring ? (landlordWon ? " · 春天！" : " · 反春天！") : ""}，${humanWon ? "这一局值得记住。" : "输赢随意，开心就好。"}`;
    const breakdown = document.getElementById("resultBreakdown");
    breakdown.replaceChildren();
    for (const [value, label] of [
      [`${delta > 0 ? "+" : ""}${delta}`, "本局积分"],
      [`×${this.multiplier}`, "最终倍数"],
      [this.stats.score.toLocaleString(), "当前积分"],
    ]) {
      const cell = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = value;
      const small = document.createElement("small");
      small.textContent = label;
      cell.append(strong, small);
      breakdown.appendChild(cell);
    }
    const hands = document.getElementById("resultHands");
    hands.replaceChildren();
    for (const player of this.players) {
      const row = document.createElement("p");
      const name = document.createElement("b");
      name.textContent = `${player.name} · ${player.role === "landlord" ? "地主" : "农民"}：`;
      row.append(
        name,
        player.hand.length ? this.cardText(player.hand) : "已出完全部手牌",
      );
      hands.appendChild(row);
    }
    this.log(
      "牌桌",
      `${humanWon ? "你赢了" : "本局结束"}${this.spring ? " · 春天翻倍" : ""}，积分 ${delta > 0 ? "+" : ""}${delta}`,
    );
    humanWon ? this.sound.win() : this.sound.lose();
    this.renderAll();
    this.schedule(
      () => document.getElementById("resultModal").showModal(),
      500,
    );
  }

  /** 重启游戏 */
  restart() {
    document.getElementById("resultModal").close();
    this.startGame();
  }

  /* ========== UI 渲染 ========== */

  /** 全量渲染 */
  renderAll() {
    this.renderHand();
    this.renderAIHand(1);
    this.renderAIHand(2);
    this.renderAIPlay(1);
    this.renderAIPlay(2);
    this.renderBottomCards();
    this.renderLastPlay();
    this.renderPlayerInfo();
    this.updateActiveZone();
    this.updateActionButtons();
    this.renderTracker();
    this.renderStats();
    document.getElementById("gameTable").dataset.state = this.state;
    document.getElementById("multiplierValue").textContent = this.multiplier;
    document.getElementById("roundLabel").textContent =
      this.state === "ready"
        ? "准备好，来一局"
        : `第 ${String(this.roundNumber).padStart(2, "0")} 局 · ${this.state === "ended" ? "本局已结束" : this.state === "playing" ? "好牌进行中" : "叫地主阶段"}`;
    document
      .getElementById("btnAuto")
      .setAttribute("aria-pressed", String(this.autoPlay));
    document.getElementById("btnAuto").querySelector("span").textContent = this
      .autoPlay
      ? "取消托管"
      : "托管";
    document.getElementById("btnAuto").disabled = this.state !== "playing";
  }

  /** 渲染人类玩家手牌 */
  renderHand() {
    const container = document.getElementById("playerHand");
    const focusedId = container.contains(document.activeElement)
      ? document.activeElement.dataset.id
      : null;
    container.innerHTML = "";
    const hand = this.players[0].hand;
    const table = document.getElementById("gameTable");
    const width =
      parseFloat(getComputedStyle(table).getPropertyValue("--card-w")) || 66;
    const available = Math.max(200, container.clientWidth);
    const step =
      hand.length > 1
        ? Math.min(width * 0.57, (available - width) / (hand.length - 1))
        : width;
    container.style.setProperty(
      "--card-overlap",
      `${Math.max(0, width - step)}px`,
    );
    container.style.setProperty(
      "--hand-rank-size",
      `${Math.min(20, Math.max(12, step - 1))}px`,
    );
    container.style.setProperty(
      "--hand-suit-size",
      `${Math.min(17, Math.max(11, step - 2))}px`,
    );

    for (const card of hand) {
      const el = this.createCardElement(card, true);
      if (card.selected) el.classList.add("selected");
      el.setAttribute("aria-pressed", String(card.selected));
      // 只有出牌阶段且轮到人类时才可点击
      if (
        this.state === "playing" &&
        this.currentPlayer === 0 &&
        !this.autoPlay
      ) {
        el.classList.add("playable");
      }
      container.appendChild(el);
    }
    if (focusedId)
      container
        .querySelector(`[data-id="${focusedId}"]`)
        ?.focus({ preventScroll: true });
  }

  /** 渲染AI手牌（牌背排列） */
  renderAIHand(playerId) {
    const container = document.getElementById(`aihand-${playerId}`);
    container.innerHTML = "";
    const count = this.players[playerId].cardCount();
    // 最多显示 10 张牌背，避免过多
    const displayCount = Math.min(count, 10);
    for (let i = 0; i < displayCount; i++) {
      const el = document.createElement("div");
      el.className = "card-back";
      container.appendChild(el);
    }
  }

  /** 渲染AI最近出的牌 */
  renderAIPlay(playerId) {
    const container = document.getElementById(`aiplay-${playerId}`);
    container.innerHTML = "";
    const player = this.players[playerId];
    if (!player.lastPlay) return;

    for (const card of player.lastPlay.cards) {
      const el = this.createMiniCardElement(card);
      container.appendChild(el);
    }
  }

  /** 渲染底牌区 */
  renderBottomCards() {
    const container = document.getElementById("bottomCards");
    container.replaceChildren();
    const revealed = this.landlordId !== null;
    container.setAttribute(
      "aria-label",
      revealed
        ? `地主底牌：${this.cardText(this.bottomCards)}`
        : "三张保密底牌，叫地主后揭晓",
    );
    for (let i = 0; i < 3; i++) {
      if (revealed)
        container.appendChild(
          this.createCardElement(this.bottomCards[i], false),
        );
      else {
        const back = document.createElement("div");
        back.className = "card-back-large";
        container.appendChild(back);
      }
    }
  }

  /** 渲染中央当前出牌展示区 */
  renderLastPlay() {
    const container = document.getElementById("lastPlayArea");
    container.replaceChildren();
    container.removeAttribute("aria-label");
    if (!this.lastPlay) return;
    container.setAttribute(
      "aria-label",
      `${this.players[this.lastPlayerId].name}出的${this.patternName(this.lastPlay.type)}`,
    );
    for (const card of this.lastPlay.cards) {
      const el = this.createCardElement(card, false);
      el.classList.add("played-card");
      container.appendChild(el);
    }
  }

  /** 渲染玩家信息（牌数、身份、高亮） */
  renderPlayerInfo() {
    for (let i = 0; i < 3; i++) {
      const player = this.players[i];
      document.getElementById(`count-${i}`).textContent =
        this.state === "ready" ? "—" : player.cardCount();

      const roleEl = document.getElementById(`role-${i}`);
      if (player.role === "landlord") {
        roleEl.textContent = "地主";
        roleEl.className = "player-role landlord";
      } else if (player.role === "farmer") {
        roleEl.textContent = "农民";
        roleEl.className = "player-role farmer";
      } else {
        roleEl.textContent =
          this.state === "ready" ? (i === 0 ? "待入座" : "等你入座") : "待定";
        roleEl.className = "player-role";
      }
    }
  }

  /** 更新当前出牌玩家高亮 */
  updateActiveZone() {
    for (let i = 0; i < 3; i++) {
      const zone = document.getElementById(`zone-${i}`);
      if (zone) {
        zone.classList.toggle(
          "active",
          i === this.currentPlayer &&
            ["playing", "bidding"].includes(this.state),
        );
      }
    }
  }

  /** 更新操作按钮状态 */
  updateActionButtons() {
    const isPlayerTurn =
      this.state === "playing" &&
      this.currentPlayer === 0 &&
      !this.autoPlay &&
      !this.paused;
    const btnPlay = document.getElementById("btnPlay");
    const btnPass = document.getElementById("btnPass");
    const btnHint = document.getElementById("btnHint");

    btnPlay.disabled = !isPlayerTurn;
    btnPass.disabled = !isPlayerTurn || !this.lastPlay;
    btnHint.disabled = !isPlayerTurn;
    let selectionText = isPlayerTurn
      ? "点击选牌，再点击出牌"
      : this.autoPlay
        ? "托管进行中，点击右侧按钮可取消"
        : "好牌不急，稍等一下";
    const cards = this.players[0].getSelectedCards();
    if (isPlayerTurn && cards.length) {
      const pattern = HandEvaluator.analyze(cards);
      selectionText = !pattern
        ? `已选 ${cards.length} 张 · 还不能组成合法牌型`
        : !HandEvaluator.canBeat(pattern, this.lastPlay)
          ? `${this.patternName(pattern.type)} · 还压不过上一手`
          : `${this.patternName(pattern.type)} · 已选 ${cards.length} 张，可以出牌`;
    }
    document.getElementById("selectionInfo").textContent = selectionText;

    if (isPlayerTurn) {
      // 检查是否有选中的牌
      const selected = this.players[0].getSelectedCards();
      if (selected.length > 0) {
        const pattern = HandEvaluator.analyze(selected);
        const canPlay =
          pattern && HandEvaluator.canBeat(pattern, this.lastPlay);
        btnPlay.disabled = !canPlay;
      } else {
        btnPlay.disabled = true;
      }
      btnPass.disabled = !this.lastPlay;
    }
  }

  /* ========== DOM 元素创建 ========== */

  /** 创建一张完整扑克牌 DOM 元素 */
  createCardElement(card, interactive) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.id = card.id;
    el.dataset.rank = card.rank;
    el.setAttribute(
      "aria-label",
      card.isJoker
        ? card.value === 17
          ? "大王"
          : "小王"
        : `${{ spade: "黑桃", heart: "红桃", club: "梅花", diamond: "方块" }[card.suit]}${card.rank}`,
    );

    // 设置颜色类
    if (card.isJoker) {
      el.classList.add(card.rank === "RJ" ? "joker-big" : "joker-small");
    } else {
      el.classList.add(card.getDisplayColor());
    }

    // 角标
    const cornerText = card.getCornerText();
    const suitSymbol = card.getSuitSymbol();

    // 左上角
    const cornerTL = document.createElement("div");
    cornerTL.className = "card-corner top-left";
    if (card.isJoker) {
      cornerTL.innerHTML = `<span class="corner-rank" style="font-size:9px;">${cornerText}</span>`;
    } else {
      cornerTL.innerHTML = `<span class="corner-rank">${cornerText}</span><span class="corner-suit">${suitSymbol}</span>`;
    }
    el.appendChild(cornerTL);

    // 中央
    const center = document.createElement("div");
    center.className = "card-center";
    center.textContent = suitSymbol;
    el.appendChild(center);

    // 右下角（旋转180°）
    const cornerBR = document.createElement("div");
    cornerBR.className = "card-corner bottom";
    if (card.isJoker) {
      cornerBR.innerHTML = `<span class="corner-rank" style="font-size:9px;">${cornerText}</span>`;
    } else {
      cornerBR.innerHTML = `<span class="corner-rank">${cornerText}</span><span class="corner-suit">${suitSymbol}</span>`;
    }
    el.appendChild(cornerBR);

    // 交互事件
    if (interactive) {
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-disabled",
        String(
          this.state !== "playing" || this.currentPlayer !== 0 || this.autoPlay,
        ),
      );
      el.tabIndex =
        this.state === "playing" && this.currentPlayer === 0 && !this.autoPlay
          ? 0
          : -1;
      el.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          this.onCardClick(card.id);
        }
      });
      el.addEventListener("click", () => this.onCardClick(card.id));
    }

    return el;
  }

  /** 创建迷你卡牌元素（用于AI出牌展示） */
  createMiniCardElement(card) {
    const el = document.createElement("div");
    el.className = "mini-played-card";

    if (card.isJoker) {
      el.classList.add("gold");
      el.textContent = card.rank === "RJ" ? "大王" : "小王";
    } else {
      const color =
        card.suit === "heart" || card.suit === "diamond" ? "red" : "black";
      el.classList.add(color);
      const symbols = { spade: "♠", heart: "♥", diamond: "♦", club: "♣" };
      el.innerHTML = `${card.rank}<br>${symbols[card.suit]}`;
    }

    return el;
  }

  /* ========== 事件处理 ========== */

  /** 绑定全局事件 */
  bindEvents() {
    const on = (id, callback) =>
      document.getElementById(id).addEventListener("click", callback);
    on("btnStart", () => {
      this.sound.init();
      this.startGame();
    });
    on("btnPlay", () => this.onPlayClick());
    on("btnPass", () => this.onPassClick());
    on("btnHint", () => this.onHintClick());
    on("btnBidYes", () => {
      if (this.currentPlayer === 0) this.handleBid(true);
    });
    on("btnBidNo", () => {
      if (this.currentPlayer === 0) this.handleBid(false);
    });
    on("btnRestart", () => this.restart());
    on("btnLobby", () => {
      document.getElementById("resultModal").close();
      this.showLobby();
    });
    on("btnAuto", () => this.toggleAuto());
    on("btnNewGame", () => this.requestNewGame());
    on("navGame", () => {
      document
        .getElementById("gameTable")
        .scrollIntoView({
          behavior: this.settings.motion ? "instant" : "smooth",
          block: "center",
        });
    });
    on("railGame", () => document.getElementById("navGame").click());
    on("btnConfirmRestart", () => {
      document.getElementById("confirmDialog").close();
      this.startGame();
    });
    on("btnSound", () => {
      this.settings.sound = !this.settings.sound;
      this.applySettings();
      this.saveSettings();
      this.toast(this.settings.sound ? "音效已开启" : "音效已关闭");
    });
    on("btnNextTip", () => {
      this.tipIndex = (this.tipIndex + 1) % this.tips.length;
      document.getElementById("dailyTip").textContent =
        this.tips[this.tipIndex];
      document.querySelector(".tip-index").textContent =
        `0${this.tipIndex + 1} / 04`;
    });
    document
      .querySelectorAll("[data-dialog]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.openDialog(button.dataset.dialog),
        ),
      );
    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog
        .querySelectorAll("[data-close]")
        .forEach((button) =>
          button.addEventListener("click", () => dialog.close()),
        );
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog && dialog.id !== "resultModal") {
          const rect = dialog.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            dialog.close();
        }
      });
      dialog.addEventListener("close", () => {
        if (!document.querySelector("dialog[open]")) this.resumeGame();
      });
      if (dialog.id === "resultModal")
        dialog.addEventListener("cancel", (event) => {
          event.preventDefault();
          dialog.close();
          this.showLobby();
        });
    });
    for (const [id, key] of [
      ["settingSound", "sound"],
      ["settingMotion", "motion"],
      ["settingDuration", "duration"],
      ["settingSpeed", "speed"],
    ]) {
      document.getElementById(id).addEventListener("change", (event) => {
        this.settings[key] =
          event.target.type === "checkbox"
            ? event.target.checked
            : key === "duration"
              ? Number(event.target.value)
              : event.target.value;
        this.applySettings();
        this.saveSettings();
      });
    }
    window.addEventListener("resize", () => {
      this.renderHand();
      if (this.timerPlayerId >= 0) this.updateTimerPosition(this.timerPlayerId);
    });
    document.addEventListener("keydown", (event) => {
      if (
        document.querySelector("dialog[open]") ||
        /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        event.isComposing
      )
        return;
      if (this.state !== "playing" || this.currentPlayer !== 0 || this.autoPlay)
        return;
      const key = event.key.toLowerCase();
      if (event.target.tagName === "BUTTON" && (key === "enter" || key === " "))
        return;
      if (["h", "p", "enter", "escape"].includes(key)) event.preventDefault();
      if (key === "h") this.onHintClick();
      else if (key === "p") this.onPassClick();
      else if (key === "enter") this.onPlayClick();
      else if (key === "escape") {
        this.players[0].clearSelection();
        this.renderHand();
        this.updateActionButtons();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pauseGame();
      else if (!document.querySelector("dialog[open]")) this.resumeGame();
    });
  }

  /** 点击卡牌：切换选中状态 */
  onCardClick(cardId) {
    if (
      this.state !== "playing" ||
      this.currentPlayer !== 0 ||
      this.autoPlay ||
      this.paused
    )
      return;
    this.players[0].toggleSelect(cardId);
    this.sound.select();
    this.renderHand();
    this.updateActionButtons();
    // 重置提示索引
    this.hintIndex = -1;
  }

  /** 出牌按钮 */
  onPlayClick() {
    if (
      this.state !== "playing" ||
      this.currentPlayer !== 0 ||
      this.autoPlay ||
      this.paused
    )
      return;
    const selected = this.players[0].getSelectedCards();
    if (selected.length === 0) {
      this.setMessage("请先选择要出的牌");
      return;
    }
    const ok = this.playCards(0, selected);
    if (!ok) {
      // 出牌失败，保留选牌
    }
  }

  /** 过牌按钮 */
  onPassClick() {
    if (
      this.state !== "playing" ||
      this.currentPlayer !== 0 ||
      this.autoPlay ||
      this.paused
    )
      return;
    if (!this.lastPlay) {
      this.setMessage("你是首家，必须出牌");
      return;
    }
    this.pass(0);
  }

  /** 提示按钮：自动选中能压过的合法牌型 */
  onHintClick() {
    if (
      this.state !== "playing" ||
      this.currentPlayer !== 0 ||
      this.autoPlay ||
      this.paused
    )
      return;
    const player = this.players[0];
    const allPatterns = generateAllPatterns(player.hand);

    // 筛选能压过的候选
    const beatable = this.lastPlay
      ? allPatterns.filter((p) => HandEvaluator.canBeat(p, this.lastPlay))
      : allPatterns;

    if (beatable.length === 0) {
      this.setMessage("没有能压过的牌，请选择不要");
      return;
    }

    // 优先按 mainValue 排序，让提示从小到大循环
    beatable.sort(
      (a, b) =>
        Number(["bomb", "rocket"].includes(a.type)) -
          Number(["bomb", "rocket"].includes(b.type)) ||
        a.mainValue - b.mainValue ||
        b.cards.length - a.cards.length,
    );

    // 循环切换提示
    this.hintIndex = (this.hintIndex + 1) % beatable.length;
    const hint = beatable[this.hintIndex];

    // 清空当前选择，选中提示的牌
    player.clearSelection();
    for (const card of hint.cards) {
      const c = player.hand.find((hc) => hc.id === card.id);
      if (c) c.selected = true;
    }
    this.renderHand();
    this.updateActionButtons();
  }

  /* ========== 消息与提示 ========== */

  /** 设置消息区文本 */
  setMessage(msg) {
    document.getElementById("messageArea").textContent = msg;
  }

  /** 显示出牌/过牌气泡 */
  showBubble(playerId, text) {
    const bubble = document.getElementById(`bubble-${playerId}`);
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.add("show");
    bubble.setAttribute("aria-hidden", "false");
    this.schedule(() => {
      bubble.classList.remove("show");
      bubble.setAttribute("aria-hidden", "true");
    }, 2000);
  }

  /** 显示叫地主信息浮层 */
  showBidInfo(text) {
    const el = document.getElementById("bidInfo");
    el.textContent = text;
    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
    this.schedule(() => {
      el.classList.remove("show");
      el.setAttribute("aria-hidden", "true");
    }, 1500);
  }
}

/* ==========================================================
 *  启动游戏
 * ========================================================== */
window.addEventListener("DOMContentLoaded", () => {
  window.gameController = new GameController();
});
