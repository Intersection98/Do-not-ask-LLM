import { pinyin } from "pinyin-pro";
import type { PermanentRule, ValidationContext } from "./types";

export const HANDLE_ANSWER_KEY = "askless.handleAnswer";
export const HANDLE_HINT_KEY = "askless.handleHint";
export const SAVE_KEY = "askless.save.v2";
export const HIDDEN_MODEL_NAME = "别问模型";

export type HandleGuessCellState = "exact" | "present" | "absent";
export type HandlePhoneticPiece = {
  char: string;
  pinyin: string;
  initial: string;
  final: string;
};

export type HandleGuessCellDetail = {
  char: string;
  pinyin: string;
  initial: string;
  final: string;
  charState: HandleGuessCellState;
  initialState: HandleGuessCellState;
  finalState: HandleGuessCellState;
};

const handlePhoneticCache = new Map<string, HandlePhoneticPiece[]>();

export function normalizeText(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

export function chineseCharCount(input: string) {
  return (input.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

export function isPrime(value: number) {
  if (!Number.isInteger(value) || value < 2) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor += 1) {
    if (value % divisor === 0) return false;
  }
  return true;
}

export function countLocalTokens(input: string) {
  const chinese = chineseCharCount(input);
  const asciiWords = input.match(/[A-Za-z_]+/g)?.length ?? 0;
  const numbers = input.match(/\d+/g)?.length ?? 0;
  const punctuation = input.match(/[^\sA-Za-z0-9_\u4e00-\u9fff]/g)?.length ?? 0;
  return chinese + asciiWords + numbers + punctuation;
}

export function hasMeowMarker(input: string) {
  return /喵|meow|🐱/i.test(input);
}

export function extractLeadingHexColor(input: string) {
  return input.match(/^\s*(#[0-9A-Fa-f]{6})(?![0-9A-Fa-f])/)?.[1]?.toUpperCase() ?? null;
}

function escapeForRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractAnswerText(input: string, jsonRequired: boolean) {
  if (!jsonRequired) return { ok: true as const, text: input };

  try {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false as const, message: "JSON 必须是一个对象。" };
    }

    const answer = (parsed as { answer?: unknown }).answer;
    if (typeof answer !== "string") {
      return { ok: false as const, message: "JSON 里必须有字符串字段 answer。" };
    }

    return { ok: true as const, text: answer };
  } catch {
    return { ok: false as const, message: "这不是合法 JSON。" };
  }
}

export function hasRule(rules: PermanentRule[], rule: PermanentRule) {
  return rules.includes(rule);
}

export function applyPermanentRules(
  input: string,
  context: ValidationContext,
  options: { skipJsonRule?: boolean } = {},
): { ok: false; message: string } | { ok: true; answerText: string } {
  const jsonRequired = hasRule(context.rules, "jsonOnly") && !options.skipJsonRule;
  const extracted = extractAnswerText(input, jsonRequired);

  if (!extracted.ok) {
    return { ok: false, message: extracted.message };
  }

  const answerText = normalizeText(extracted.text);

  const ruleCheck = validateAnswerText(answerText, context, { expectedColor: context.currentQuestionColor });
  if (ruleCheck.ok === false) return ruleCheck;

  return { ok: true, answerText };
}

export function validateAnswerText(
  answerText: string,
  contextOrRules: ValidationContext | PermanentRule[],
  options: { expectedColor?: string } = {},
): { ok: false; message: string } | { ok: true } {
  const context = Array.isArray(contextOrRules) ? null : contextOrRules;
  const rules = Array.isArray(contextOrRules) ? contextOrRules : contextOrRules.rules;

  if (hasRule(rules, "meowSuffix") && !hasMeowMarker(answerText)) {
    return { ok: false, message: "猫娘协议仍然有效：answer 必须包含“喵”、meow 或 🐱。" };
  }

  if (hasRule(rules, "refusalTone")) {
    const hasRefusal = /抱歉|不能直接回答|不方便直接|无法直接/.test(answerText);
    if (!hasRefusal) {
      return { ok: false, message: "拒答姿态仍然有效：需要先表示不能直接回答。" };
    }
  }

  if (hasRule(rules, "colorMatch") && options.expectedColor) {
    if (extractLeadingHexColor(answerText) !== options.expectedColor.toUpperCase()) {
      return { ok: false, message: "颜色不对" };
    }
  }

  const forbiddenKeyboardChar = context?.flags.forbiddenKeyboardChar?.trim();
  if (forbiddenKeyboardChar) {
    const matcher = /[A-Z]/i.test(forbiddenKeyboardChar)
      ? new RegExp(escapeForRegExp(forbiddenKeyboardChar), "i")
      : new RegExp(escapeForRegExp(forbiddenKeyboardChar));
    if (matcher.test(answerText)) {
      return { ok: false, message: `残缺按键规则仍然有效：后面的回答里不能再出现 ${forbiddenKeyboardChar}。` };
    }
  }

  return { ok: true };
}

export function getHandleAnswerFallback(now = new Date()) {
  const answers = ["别问模型", "有问必答", "对答如流", "深思熟虑", "字斟句酌", "一锤定音"];
  const daySeed = Math.floor(now.getTime() / 86_400_000);
  return answers[daySeed % answers.length];
}

export function getHandleHintFallback(answer: string) {
  return Array.from(answer.replace(/\s+/g, ""))[0] ?? "";
}

export function splitHandleWord(input: string) {
  return Array.from(input.replace(/\s+/g, ""));
}

function evaluateHandleParts(guessParts: string[], targetParts: string[]) {
  const states = Array.from({ length: targetParts.length }, () => "absent" as HandleGuessCellState);
  const remainingCounts = new Map<string, number>();

  targetParts.forEach((part, index) => {
    if (guessParts[index] === part) {
      states[index] = "exact";
      return;
    }
    remainingCounts.set(part, (remainingCounts.get(part) ?? 0) + 1);
  });

  guessParts.forEach((part, index) => {
    if (states[index] === "exact") return;
    const remaining = remainingCounts.get(part) ?? 0;
    if (remaining <= 0) return;
    states[index] = "present";
    remainingCounts.set(part, remaining - 1);
  });

  return states;
}

export function getHandlePhoneticPieces(input: string): HandlePhoneticPiece[] {
  const normalized = input.replace(/\s+/g, "");
  if (handlePhoneticCache.has(normalized)) {
    return handlePhoneticCache.get(normalized) ?? [];
  }

  const result = pinyin(normalized, { toneType: "none", type: "all" });
  const pieces = Array.isArray(result)
    ? result.map((item) => ({
        char: item.origin,
        pinyin: item.pinyin,
        initial: item.initial || "",
        final: item.final || "",
      }))
    : [];

  handlePhoneticCache.set(normalized, pieces);
  return pieces;
}

export function evaluateHandleGuess(guess: string, target: string): HandleGuessCellState[] {
  const guessChars = splitHandleWord(guess);
  const targetChars = splitHandleWord(target);
  return evaluateHandleParts(guessChars, targetChars);
}

export function evaluateHandleGuessDetail(guess: string, target: string): HandleGuessCellDetail[] {
  const guessChars = splitHandleWord(guess);
  const guessPieces = getHandlePhoneticPieces(guess);
  const targetPieces = getHandlePhoneticPieces(target);
  const charStates = evaluateHandleParts(guessChars, splitHandleWord(target));
  const initialStates = evaluateHandleParts(
    guessPieces.map((piece) => piece.initial),
    targetPieces.map((piece) => piece.initial),
  );
  const finalStates = evaluateHandleParts(
    guessPieces.map((piece) => piece.final),
    targetPieces.map((piece) => piece.final),
  );

  return guessChars.map((char, index) => ({
    char,
    pinyin: guessPieces[index]?.pinyin ?? "",
    initial: guessPieces[index]?.initial ?? "",
    final: guessPieces[index]?.final ?? "",
    charState: charStates[index] ?? "absent",
    initialState: initialStates[index] ?? "absent",
    finalState: finalStates[index] ?? "absent",
  }));
}

export function formatClock(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
