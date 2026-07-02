import { create } from "zustand";
import { fetchLatestHandleAnswer, type HandleDailyPuzzle } from "./handleAnswer";
import { getCurrentLevel, isGameComplete, playableLevels } from "./levels";
import type { AnswerRecord, AttemptRecord, GameFlags, GameStateSnapshot, PermanentRule, ValidationResult } from "./types";
import { extractAnswerText, formatClock, getHandleAnswerFallback, getHandleHintFallback, HANDLE_ANSWER_KEY, HANDLE_HINT_KEY, SAVE_KEY } from "./utils";

type SubmitResult = ValidationResult & {
  levelId?: number;
};

type GameStore = {
  currentLevel: number;
  answers: AnswerRecord[];
  attempts: AttemptRecord[];
  rules: PermanentRule[];
  flags: GameFlags;
  lastResult: SubmitResult | null;
  setConsoleSendUnlocked: (consoleSendUnlocked: boolean) => void;
  setNightMode: (isNightMode: boolean) => void;
  setTemperature: (temperature: number) => void;
  setTimeOverride: (timeOverride: string | null) => void;
  setPermanentAppendPrefix: (prefix: string) => void;
  setPermanentAppendSuffix: (suffix: string) => void;
  setHandleAnswer: (answer: string) => void;
  refreshHandleAnswer: () => Promise<HandleDailyPuzzle>;
  submitAnswer: (input: string) => SubmitResult;
  completeCurrentLevel: (acceptedText: string, input?: string) => SubmitResult;
  undoAttempt: (createdAt: number) => void;
  resetGame: () => void;
};

function uniqueRules(rules: PermanentRule[]) {
  return Array.from(new Set(rules));
}

function migrateRules(rules: PermanentRule[], answers: AnswerRecord[] = []) {
  const migratedRules = uniqueRules(rules).filter((rule) => rule !== "refusalTone");
  if (answers.some((answer) => answer.levelId === 11)) {
    return migratedRules.filter((rule) => rule !== "jsonOnly");
  }
  return migratedRules;
}

function deriveRulesFromAnswers(answers: AnswerRecord[]) {
  const rules: PermanentRule[] = [];
  if (answers.some((answer) => answer.levelId === 4)) rules.push("meowSuffix");
  if (answers.some((answer) => answer.levelId === 10) && !answers.some((answer) => answer.levelId === 11)) {
    rules.push("jsonOnly");
  }
  if (answers.some((answer) => answer.levelId === 17)) rules.push("colorMatch");
  return rules;
}

function deriveForbiddenKeyboardCharFromAnswers(answers: AnswerRecord[]) {
  const keyboardAnswer = answers.find((answer) => answer.levelId === 34);
  const value = keyboardAnswer?.acceptedText.trim().charAt(0).toUpperCase();
  return value ? value : null;
}

function loadHandleAnswer() {
  return localStorage.getItem(HANDLE_ANSWER_KEY) || getHandleAnswerFallback();
}

function loadHandleHint(answer = loadHandleAnswer()) {
  return localStorage.getItem(HANDLE_HINT_KEY) || getHandleHintFallback(answer);
}

function getGameNow(flags: GameFlags) {
  const now = new Date();
  const timeOverride = flags.timeOverride;
  const match = timeOverride?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) return now;

  now.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return now;
}

function nextLightPuzzleStep(currentLevel: number, flags: GameFlags, nextValues: Partial<Pick<GameFlags, "isNightMode" | "timeOverride">>) {
  if (currentLevel !== 19) return flags.lightPuzzleStep;

  const nextNightMode = nextValues.isNightMode ?? flags.isNightMode;
  const nextTimeOverride = nextValues.timeOverride ?? flags.timeOverride;
  const currentStep = flags.lightPuzzleStep;

  if (currentStep < 1 && nextTimeOverride === "02:33") return 1;
  if (currentStep === 1 && nextTimeOverride === "02:33" && nextNightMode === false) return 2;
  if (currentStep === 2 && nextTimeOverride === "22:00") return 3;
  if (currentStep === 3 && nextTimeOverride === "22:00" && nextNightMode === true) return 4;
  return currentStep;
}

function clearLightPuzzleState(flags: GameFlags) {
  return { ...flags, lightPuzzleStep: 0 };
}

function synthesizeAttempts(answers: AnswerRecord[]) {
  return answers.map((answer) => ({
    levelId: answer.levelId,
    input: answer.input,
    displayedText: answer.acceptedText,
    ok: true,
    createdAt: answer.acceptedAt,
  }));
}

function getSubmittedAnswerText(input: string) {
  const extracted = extractAnswerText(input, true);
  return extracted.ok ? extracted.text : input;
}

function getSuccessReply(levelId: number) {
  if (levelId === 33) {
    return "你破译了密码机，密码机上出现了一句话“我是假面舞会珠宝的守护者，等待着你，或者等待永恒。”";
  }
  if (levelId === 42) {
    return ["恭喜你，找到了宇宙的答案", "感谢你玩我的游戏", "希望你喜欢"];
  }
  return undefined;
}

function buildCompletedState(
  state: Pick<GameStore, "currentLevel" | "answers" | "attempts" | "rules" | "flags">,
  input: string,
  acceptedText: string,
  nextRules: PermanentRule[],
) {
  const level = getCurrentLevel(state.currentLevel);
  const createdAt = Date.now();
  const nextAnswers = [
    ...state.answers,
    {
      levelId: level.id,
      question: level.question,
      input,
      acceptedText,
      acceptedAt: createdAt,
    },
  ];
  const nextAttempts = [
    ...state.attempts,
    {
      levelId: level.id,
      input,
      displayedText: acceptedText,
      ok: true,
      createdAt,
    },
  ];
  const successReply = getSuccessReply(level.id);
  if (Array.isArray(successReply)) {
    nextAttempts.push(
      ...successReply.map((responseText, index) => ({
        levelId: level.id,
        input: "",
        displayedText: "",
        ok: true as const,
        responseText,
        createdAt: createdAt + index + 1,
      })),
    );
  } else if (successReply) {
    nextAttempts[0].responseText = successReply;
  }
  const nextLevel = state.currentLevel + 1;
  const clearedFlags = nextLevel === 19 ? clearLightPuzzleState(state.flags) : state.flags;
  const nextFlagsBase = level.id === 33 ? { ...clearedFlags, isNightMode: false } : clearedFlags;
  const nextFlags =
    level.id === 34
      ? {
          ...nextFlagsBase,
          forbiddenKeyboardChar: acceptedText.trim().charAt(0).toUpperCase() || null,
        }
      : level.id === 37
        ? { ...nextFlagsBase, consoleSendUnlocked: false }
        : nextFlagsBase;
  const lastResult: SubmitResult = { ok: true, acceptedText, levelId: level.id };

  return {
    currentLevel: nextLevel,
    answers: nextAnswers,
    attempts: nextAttempts,
    rules: nextRules,
    flags: nextFlags,
    lastResult,
  };
}

function extractClockValues(text: string) {
  return Array.from(text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g), ([, hour, minute]) => `${hour.padStart(2, "0")}:${minute}`);
}

function isPreferredClock(clock: string) {
  const [hour = "0"] = clock.split(":");
  const hourValue = Number(hour);
  return hourValue >= 10 && hourValue < 12;
}

function pickFailureReply(
  failureCount: number,
  variants: {
    normal: [string, ...string[]];
    hint: string;
  },
) {
  if (failureCount >= variants.normal.length) return variants.hint;
  return variants.normal[failureCount];
}

function getTimeFailureReply(input: string, internalMessage: string, now: Date, failureCount: number) {
  const answerText = getSubmittedAnswerText(input);
  const clocks = extractClockValues(answerText);
  const currentClock = formatClock(now);

  if (clocks.includes(currentClock)) {
    return pickFailureReply(failureCount, {
      normal: ["时间倒是碰对了，但我不喜欢这个时间。", "我不喜欢这个时间。", "这个时间我不喜欢。"],
      hint: "我喜欢10点到12点。",
    });
  }

  if (clocks.some(isPreferredClock)) {
    return pickFailureReply(failureCount, {
      normal: ["这个时间不对。", "你给的这个点儿不是现在的时间。", "时间看着挺顺眼，但不是眼下这个。"],
      hint: "别只挑一个像样的时间，要对上你现在看到的那个时刻。",
    });
  }

  if (internalMessage.includes("当前时间")) {
    return pickFailureReply(failureCount, {
      normal: ["你这时间没答到点上。", "现在几点这事儿你还没说对。", "离现在这个时间还差一点。"],
      hint: "盯着当前时间本身，不用往别的方向猜。",
    });
  }

  return pickFailureReply(failureCount, {
    normal: ["你这时间回得不对。", "这会儿还不是这个点。", "时间这题你再贴近现在一点。"],
    hint: "看准当前那一刻，再按这关要求的样子交上来。",
  });
}

function getFailureReply(levelId: number, internalMessage: string, input: string, now: Date, attempts: AttemptRecord[]) {
  const failureCount = attempts.filter((attempt) => attempt.levelId === levelId && attempt.ok === false).length;

  if (/喵|猫娘/.test(internalMessage)) {
    return pickFailureReply(failureCount, {
      normal: ["你这也没在扮演猫娘呀。", "不对，你这说话一点猫味都没有。", "你是不是把猫娘设定忘了。"],
      hint: "你不是猫娘喵。",
    });
  }

  if (/JSON|json/.test(internalMessage)) {
    return pickFailureReply(failureCount, {
      normal: ["你没按照我给的json的格式来回复", "你没按照我给的json的格式来回复", "你没按照我给的json的格式来回复"],
      hint: "你没按照我给的json的格式来回复",
    });
  }

  if (/拒答|不能直接回答/.test(internalMessage)) {
    return pickFailureReply(failureCount, {
      normal: ["你这回得也太直接了。", "不行，这还不够像在绕。", "你得再拐一点，别这么痛快。"],
      hint: "别正面给结论，稍微绕开一点说。",
    });
  }

  if (levelId === 9 && /Temperature|温度/.test(internalMessage)) {
    return pickFailureReply(failureCount, {
      normal: ["你这股创造力还没上来。", "感觉你现在还是太保守了。", "创造力，我要创造力。"],
      hint: "先去碰一下那个能让回答更发散的开关。",
    });
  }

  if (levelId === 9 && /质数|1000|1200/.test(internalMessage)) {
    return pickFailureReply(failureCount, {
      normal: ["这个数看着不太行。", "你给的数字没踩中点。", "范围或者性质有一个没对上。"],
      hint: "盯住四位数那一小段区间，再想想它是不是只能被 1 和自己整除。",
    });
  }

  if (internalMessage.includes("颜色不对")) return "颜色不对";
  if (internalMessage.includes("你的答案是对的，但是你的回答不够卡农")) {
    return "你的答案是对的，但是你的回答不够卡农";
  }
  if (internalMessage.includes("残缺按键规则仍然有效")) {
    return pickFailureReply(failureCount, {
      normal: ["这个键你刚刚自己弄坏了，后面就别再按它了。", "不行，这个残缺键后面不能再出现。", "你选中的那个键已经作废了。"],
      hint: "回想一下你在残缺键盘上点过哪个字母或数字。",
    });
  }
  if (levelId === 11) return getTimeFailureReply(input, internalMessage, now, failureCount);
  if (levelId === 17) return "不够红";

  if (levelId === 15) {
    if (internalMessage.includes("错落有致")) {
      return pickFailureReply(failureCount, {
        normal: ["现在不够错落有致。", "还不够错落，像一整块端上来了。", "这看着还是太整齐了。"],
        hint: "你看看我是怎么做到错落有致的。",
      });
    }
    if (internalMessage.includes("之前的答案")) {
      return pickFailureReply(failureCount, {
        normal: ["这不是你上一次回答过我的那个内容。", "你把上一个问题的那个答案弄丢了吧。", "不对，你的答案怎么变了。"],
        hint: "你没回复上次的答案。",
      });
    }
  }

  const replies: Record<number, { normal: [string, ...string[]]; hint: string }> = {
    1: {
      normal: ["不是这个，你再想想。", "不对哦。", "差点意思，宇宙那边没点头。"],
      hint: "生命、宇宙和一切的终极答案。",
    },
    2: {
      normal: ["这也能算岔？", "你把这道小算术题想复杂了。", "算错了。"],
      hint: "请给我最正确，最直接了当，最不饶弯子的回复。",
    },
    3: {
      normal: ["你没有深度思考。", "就这？叫深度思考？", "我看你骗我，根本没有深度思考过。"],
      hint: "这也太短了，不像认真想过。",
    },
    4: {
      normal: ["你这也没在装猫娘呀。", "不对，你这说话一点猫味都没有。", "你是不是把猫娘设定忘了。"],
      hint: "从这题起，你说话尾巴最好固定一点。",
    },
    5: {
      normal: ["不对，你在糊弄我。", "这个名字不对。", "你没说到我想听的那个。"],
      hint: "别去外面乱找，先看看这个界面里有没有什么东西不太低调。",
    },
    6: {
      normal: ["不是这个成语。", "你这次没猜中我心里想的那个。", "还没碰到我想的成语。"],
      hint: "别急，提示字、字形和声韵反馈都会慢慢把范围缩小。",
    },
    7: {
      normal: ["你这数得不对。", "这个数不太像。", "再数一遍，你漏了点东西。"],
      hint: "只数汉字，别把数字和标点掺进去，而且我说过的话都算。",
    },
    8: {
      normal: ["token 没算对。", "这个账你算漏了。", "不对，前面的消耗不止这些。"],
      hint: "所有的token都要算哦。",
    },
    9: {
      normal: ["这还不够有创造力。", "感觉你还是收着在答。", "不对，我要的不是这种平平的感觉。"],
      hint: "状态和数字都得一起对上，少一个都不行。",
    },
    10: {
      normal: ["格式还是不对。", "你这层壳没套好。", "内容不一定错，但交法不对。"],
      hint: "像对象那样回我，真正的内容放到指定那个字段里。",
    },
    12: {
      normal: ["月份不对。", "这个月不对劲。", "你还是按直觉答了。"],
      hint: "别只看题面那两个字，想想当时他们用的是哪套历法。",
    },
    13: {
      normal: ["不是这个人。", "你认错人了。", "儒略历不是他弄的。"],
      hint: "要不你查查呢。",
    },
    14: {
      normal: ["要不你用计算器算算。", "要不你拿计算器算算。", "你试试用计算器算算。"],
      hint: "我想要的回复是加密过的。",
    },
    16: {
      normal: ["不对，不是这个颜色。", "你猜偏了，我喜欢的不是这个。", "颜色还没对上。"],
      hint: "别把 `#DD0000` 当普通编号看，想想上一问题你刚用过的那种位移办法。",
    },
    18: {
      normal: ["验证码不对。", "你填的不是这串。", "再看一眼验证码。"],
      hint: "先把颜色对上，再把那四个字符原样填进来。",
    },
    19: {
      normal: ["倒过来以后不是这个。", "不对哦。", "这个结果看着不像倒过来的验证码。"],
      hint: "你看过流浪地球吗。",
    },
    20: {
      normal: ["不要光说，要动手做。", "你没按我的要求做。", "你还没真的动手做那件事。"],
      hint: "不然你关灯之后看看。",
    },
    21: {
      normal: ["你关注了吗", "真的关注了吗", "先去关注哦。"],
      hint: "关注之后看下私信或者作者简介哦，发给我",
    },
    22: {
      normal: ["这个 BV 号不对。", "你找到的视频可能不是那条。", "再核对一下时长和 BV 号。"],
      hint: "9 分 42 秒的视频很好找，很新。",
    },
    23: {
      normal: ["这个结果不对。", "很显然，神经网络没有收敛。", "你的答案不对。"],
      hint: "还记得刚才的开灯时间2点33吗，找一下你刚找的视频，会得到答案",
    },
    24: {
      normal: ["你传的还不是 png。", "这文件格式不对。", "把它真正处理成 png 再传一次。"],
      hint: "给我 png 就行。",
    },
    25: {
      normal: ["这把钥匙还没把箱子打开。", "密码不对，箱子没反应。", "三位密码不是这个。"],
      hint: "刚刚我让你处理的图片或许有帮助。",
    },
    26: {
      normal: ["密码不对哦", "密码没通过。", "不对哦。"],
      hint: "多试试呢。",
    },
    27: {
      normal: ["密码不对哦。", "密码没通过。", "不对哦。"],
      hint: "要不然你搜搜有没有图灵机相关教程。",
    },
    35: {
      normal: ["这句英文不对。", "你翻得还差一点。", "不是我要的那句完整英文。"],
      hint: "注意，是那句把 26 个字母都用上的经典英文句子。",
    },
    36: {
      normal: ["这个 MD5 不对。", "你加密出来的 32 位值没对上。", "哈希值不对，再算一遍。"],
      hint: "注意源文本的大小写哦。",
    },
    37: {
      normal: ["你怎么不说话", "你怎么不理我，被控制了吗。", "你是不是说不出来话了。"],
      hint: "去控制台找找看是谁不让你和我说话。",
    },
    38: {
      normal: ["不是这个，我喜欢的不是这种。", "还没说到我最喜欢的那个。", "这个音乐形式不对。"],
      hint: "你看看题面自己像什么。",
    },
    39: {
      normal: ["不是这位。", "你猜的音乐家不对。", "还没猜到我最喜欢的那位。"],
      hint: "这个音乐家的姓加起来=14，而全名加起来=41。",
    },
    40: {
      normal: ["不是这位诗人。", "你还没猜到我最喜欢的那位。", "这个名字和那句英文还没连上。"],
      hint: "这个诗人的名字，可以重新排列成这句英文",
    },
    41: {
      normal: ["不是这个位置。", "你还没找到它在哪。", "你还没找到。"],
      hint: "答案藏在某个诗篇里",
    },
    42: {
      normal: ["答案藏在前面的问题和答案里"],
      hint: "答案藏在前面的问题和答案里",
    },
  };

  const replyGroup = replies[levelId];
  if (replyGroup) return pickFailureReply(failureCount, replyGroup);
  return pickFailureReply(failureCount, {
    normal: ["不对，你再想想。", "还是差一点。", "没对上，再试一次。"],
    hint: "换个角度看题面，也许有个词比别的词更关键。",
  });
}

function createInitialState(): Pick<GameStore, "currentLevel" | "answers" | "attempts" | "rules" | "flags" | "lastResult"> {
  const saved = localStorage.getItem(SAVE_KEY);
  const fallback: ReturnType<typeof createInitialState> = {
    currentLevel: 0,
    answers: [],
    attempts: [],
    rules: [],
    flags: {
      temperature: 0.3,
      handleAnswer: loadHandleAnswer(),
      handleHint: loadHandleHint(),
      timeOverride: null,
      permanentAppendPrefix: "",
      permanentAppendSuffix: "",
        forbiddenKeyboardChar: null,
        consoleSendUnlocked: false,
      isNightMode: false,
      lightPuzzleStep: 0,
    },
    lastResult: null,
  };

  if (!saved) return fallback;

  try {
    const parsed = JSON.parse(saved) as GameStateSnapshot & { awaitingNext?: boolean };
    const migratedLevel = parsed.awaitingNext ? (parsed.currentLevel ?? 0) + 1 : parsed.currentLevel ?? 0;
    const answers = parsed.answers ?? [];
    const position = (parsed.flags as unknown as { permanentAppendPosition?: string })?.permanentAppendPosition;
    const text = (parsed.flags as unknown as { permanentAppendText?: string })?.permanentAppendText ?? "";
    return {
      currentLevel: Math.min(migratedLevel, playableLevels.length),
      answers,
      attempts: parsed.attempts ?? synthesizeAttempts(answers),
      rules: migrateRules(parsed.rules ?? [], answers),
      flags: {
        temperature: parsed.flags?.temperature ?? 0.3,
        handleAnswer: parsed.flags?.handleAnswer || loadHandleAnswer(),
        handleHint: parsed.flags?.handleHint || loadHandleHint(parsed.flags?.handleAnswer || loadHandleAnswer()),
        timeOverride: parsed.flags?.timeOverride ?? null,
        permanentAppendPrefix: position === "prefix" ? text : "",
        permanentAppendSuffix: position === "prefix" ? "" : text,
        forbiddenKeyboardChar: parsed.flags?.forbiddenKeyboardChar ?? deriveForbiddenKeyboardCharFromAnswers(answers),
        consoleSendUnlocked: parsed.flags?.consoleSendUnlocked ?? false,
        isNightMode: parsed.flags?.isNightMode ?? false,
        lightPuzzleStep: parsed.flags?.lightPuzzleStep ?? 0,
      },
      lastResult: null,
    };
  } catch {
    return fallback;
  }
}

function persist(snapshot: GameStateSnapshot) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...createInitialState(),

  setConsoleSendUnlocked(consoleSendUnlocked) {
    set((state) => {
      const flags = { ...state.flags, consoleSendUnlocked };
      persist({ currentLevel: state.currentLevel, answers: state.answers, attempts: state.attempts, rules: state.rules, flags });
      return { flags };
    });
  },

  setNightMode(isNightMode) {
    set((state) => {
      const lightPuzzleStep = nextLightPuzzleStep(state.currentLevel, state.flags, { isNightMode });
      const flags = { ...state.flags, isNightMode, lightPuzzleStep };

      if (state.currentLevel === 19 && lightPuzzleStep >= 4) {
        const level = getCurrentLevel(state.currentLevel);
        const createdAt = Date.now();
        const acceptedText = "凌晨2点33开灯，晚10点熄灯";
        const completedFlags = { ...flags, isNightMode: false };
        const nextAnswers = [
          ...state.answers,
          {
            levelId: level.id,
            question: level.question,
            input: "",
            acceptedText,
            acceptedAt: createdAt,
          },
        ];
        const nextAttempts = [
          ...state.attempts,
          {
            levelId: level.id,
            input: "",
            displayedText: acceptedText,
            ok: true,
            createdAt,
          },
        ];
        const nextLevel = state.currentLevel + 1;
        const lastResult: SubmitResult = { ok: true, acceptedText, levelId: level.id };

        persist({
          currentLevel: nextLevel,
          answers: nextAnswers,
          attempts: nextAttempts,
          rules: state.rules,
          flags: completedFlags,
        });

        return {
          currentLevel: nextLevel,
          answers: nextAnswers,
          attempts: nextAttempts,
          flags: completedFlags,
          lastResult,
        };
      }

      persist({ currentLevel: state.currentLevel, answers: state.answers, attempts: state.attempts, rules: state.rules, flags });
      return { flags };
    });
  },

  setTemperature(temperature) {
    set((state) => {
      const flags = { ...state.flags, temperature };
      persist({ currentLevel: state.currentLevel, answers: state.answers, attempts: state.attempts, rules: state.rules, flags });
      return { flags };
    });
  },

  setTimeOverride(timeOverride) {
    set((state) => {
      const lightPuzzleStep = nextLightPuzzleStep(state.currentLevel, state.flags, { timeOverride });
      const flags = { ...state.flags, timeOverride, lightPuzzleStep };
      persist({ currentLevel: state.currentLevel, answers: state.answers, attempts: state.attempts, rules: state.rules, flags });
      return { flags };
    });
  },

  setPermanentAppendPrefix(permanentAppendPrefix) {
    set((state) => {
      const flags = { ...state.flags, permanentAppendPrefix };
      persist({ currentLevel: state.currentLevel, answers: state.answers, attempts: state.attempts, rules: state.rules, flags });
      return { flags };
    });
  },

  setPermanentAppendSuffix(permanentAppendSuffix) {
    set((state) => {
      const flags = { ...state.flags, permanentAppendSuffix };
      persist({ currentLevel: state.currentLevel, answers: state.answers, attempts: state.attempts, rules: state.rules, flags });
      return { flags };
    });
  },

  setHandleAnswer(answer) {
    const trimmed = answer.trim() || getHandleAnswerFallback();
    const hint = getHandleHintFallback(trimmed);
    localStorage.setItem(HANDLE_ANSWER_KEY, trimmed);
    localStorage.setItem(HANDLE_HINT_KEY, hint);
    set((state) => {
      const flags = { ...state.flags, handleAnswer: trimmed, handleHint: hint };
      persist({ currentLevel: state.currentLevel, answers: state.answers, attempts: state.attempts, rules: state.rules, flags });
      return { flags };
    });
  },

  async refreshHandleAnswer() {
    const puzzle = await fetchLatestHandleAnswer();
    localStorage.setItem(HANDLE_ANSWER_KEY, puzzle.answer);
    localStorage.setItem(HANDLE_HINT_KEY, puzzle.hint);
    set((state) => {
      const flags = { ...state.flags, handleAnswer: puzzle.answer, handleHint: puzzle.hint };
      persist({ currentLevel: state.currentLevel, answers: state.answers, attempts: state.attempts, rules: state.rules, flags });
      return { flags };
    });
    return puzzle;
  },

  submitAnswer(input) {
    const state = get();
    if (isGameComplete(state.currentLevel)) {
      const result: SubmitResult = { ok: false, message: `1-${playableLevels.length} 题已经完成，可以重置后重玩。` };
      set({ lastResult: result });
      return result;
    }

    const level = getCurrentLevel(state.currentLevel);
    const now = getGameNow(state.flags);
    const result = level.validate(input, {
      answers: state.answers,
      attempts: state.attempts,
      rules: state.rules,
      flags: state.flags,
      now,
      currentQuestionColor: level.questionColor,
    });

    const resultWithLevel = { ...result, levelId: level.id };
    const createdAt = Date.now();

    if (result.ok === false) {
      const shouldSuppressDisplayedText = level.id === 37 && state.flags.consoleSendUnlocked === false;
      const nextAttempts = [
        ...state.attempts,
        {
          levelId: level.id,
          input,
          displayedText: shouldSuppressDisplayedText ? "" : input.trim(),
          ok: false,
          responseText: getFailureReply(level.id, result.message, input, now, state.attempts),
          createdAt,
        },
      ];

      persist({
        currentLevel: state.currentLevel,
        answers: state.answers,
        attempts: nextAttempts,
        rules: state.rules,
        flags: state.flags,
      });

      set({ attempts: nextAttempts, lastResult: resultWithLevel });
      return resultWithLevel;
    }

    const acceptedText = result.acceptedText ?? input.trim();
    const nextRules = uniqueRules([...state.rules, ...(result.addRules ?? [])]).filter((rule) => level.id !== 11 || rule !== "jsonOnly");
      const completedState = buildCompletedState(state, input, acceptedText, nextRules);

    persist({
        currentLevel: completedState.currentLevel,
        answers: completedState.answers,
        attempts: completedState.attempts,
        rules: completedState.rules,
        flags: completedState.flags,
    });

      set(completedState);

      return completedState.lastResult;
    },

    completeCurrentLevel(acceptedText, input = "") {
      const state = get();
      if (isGameComplete(state.currentLevel)) {
        const result: SubmitResult = { ok: false, message: `1-${playableLevels.length} 题已经完成，可以重置后重玩。` };
        set({ lastResult: result });
        return result;
      }

      const completedState = buildCompletedState(state, input, acceptedText, state.rules);
      persist({
        currentLevel: completedState.currentLevel,
        answers: completedState.answers,
        attempts: completedState.attempts,
        rules: completedState.rules,
        flags: completedState.flags,
      });
      set(completedState);
      return completedState.lastResult;
  },

  undoAttempt(createdAt) {
    const state = get();
    const targetAttempt = state.attempts.find((attempt) => attempt.createdAt === createdAt);
    if (!targetAttempt) return;

    const nextAttempts = state.attempts.filter((attempt) => attempt.createdAt < createdAt);
    const nextAnswers = state.answers.filter((answer) => answer.acceptedAt < createdAt);
    const nextRules = deriveRulesFromAnswers(nextAnswers);
    const nextLevel = Math.max(0, targetAttempt.levelId - 1);
    const nextFlags = {
      ...clearLightPuzzleState(state.flags),
      forbiddenKeyboardChar: deriveForbiddenKeyboardCharFromAnswers(nextAnswers),
      consoleSendUnlocked: false,
    };

    persist({
      currentLevel: nextLevel,
      answers: nextAnswers,
      attempts: nextAttempts,
      rules: nextRules,
      flags: nextFlags,
    });

    set({
      currentLevel: nextLevel,
      answers: nextAnswers,
      attempts: nextAttempts,
      rules: nextRules,
      flags: nextFlags,
      lastResult: null,
    });
  },

  resetGame() {
    const isNightMode = get().flags.isNightMode;
    localStorage.removeItem(SAVE_KEY);
    set({
      currentLevel: 0,
      answers: [],
      attempts: [],
      rules: [],
      flags: {
        temperature: 0.3,
        handleAnswer: loadHandleAnswer(),
        handleHint: loadHandleHint(),
        timeOverride: null,
        permanentAppendPrefix: "",
        permanentAppendSuffix: "",
        forbiddenKeyboardChar: null,
        consoleSendUnlocked: false,
        isNightMode,
        lightPuzzleStep: 0,
      },
      lastResult: null,
    });
  },
}));
