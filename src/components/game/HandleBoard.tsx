import { ChangeEvent, CompositionEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { evaluateHandleGuessDetail, splitHandleWord, type HandleGuessCellState } from "@/game/utils";

const HANDLE_PUZZLE_STORAGE_PREFIX = "askless.handlePuzzle.";
const HANDLE_PUZZLE_MAX_GUESSES = 6;

type HandleBoardProps = {
  target: string;
  hint: string;
  isNightMode: boolean;
  onSolve: (answer: string) => string | null;
};

function getStorageKey(target: string) {
  return `${HANDLE_PUZZLE_STORAGE_PREFIX}${target}`;
}

function normalizeGuess(value: string, targetLength: number) {
  return Array.from(value.replace(/\s+/g, "")).slice(0, targetLength).join("");
}

function loadStoredGuesses(target: string, targetLength: number) {
  try {
    const parsed = JSON.parse(localStorage.getItem(getStorageKey(target)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizeGuess(item, targetLength))
      .filter((item) => Array.from(item).length === targetLength)
      .slice(0, HANDLE_PUZZLE_MAX_GUESSES);
  } catch {
    return [];
  }
}

function getCellStateClass(state: HandleGuessCellState | null, isNightMode: boolean) {
  if (state === "exact") return "border-emerald-500 bg-emerald-500/15 text-emerald-500";
  if (state === "present") return "border-amber-500 bg-amber-500/15 text-amber-500";
  if (state === "absent") {
    return isNightMode ? "border-zinc-800 bg-zinc-900 text-zinc-500" : "border-zinc-200 bg-zinc-100 text-zinc-500";
  }
  return isNightMode ? "border-zinc-800 bg-transparent text-zinc-700" : "border-zinc-200 bg-transparent text-zinc-300";
}

function formatPhoneticPiece(label: string, value: string) {
  return `${label}${value || "无"}`;
}

export function HandleBoard({ target, hint, isNightMode, onSolve }: HandleBoardProps) {
  const targetChars = useMemo(() => splitHandleWord(target), [target]);
  const targetLength = targetChars.length;
  const [draft, setDraft] = useState("");
  const [guesses, setGuesses] = useState<string[]>(() => loadStoredGuesses(target, targetLength));
  const [message, setMessage] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const solved = guesses.some((guess) => guess === target);
  const guessesLeft = Math.max(0, HANDLE_PUZZLE_MAX_GUESSES - guesses.length);

  useEffect(() => {
    setDraft("");
    setMessage(null);
    setGuesses(loadStoredGuesses(target, targetLength));
  }, [target, targetLength]);

  useEffect(() => {
    const storageKey = getStorageKey(target);
    if (solved || guesses.length === 0) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(guesses));
  }, [guesses, solved, target]);

  const rows = useMemo(
    () =>
      Array.from({ length: HANDLE_PUZZLE_MAX_GUESSES }, (_, index) => {
        const guess = guesses[index] ?? "";
        const details = guess ? evaluateHandleGuessDetail(guess, target) : [];
        return Array.from({ length: targetLength }, (_, cellIndex) => ({
          char: details[cellIndex]?.char ?? "",
          pinyin: details[cellIndex]?.pinyin ?? "",
          initial: details[cellIndex]?.initial ?? "",
          final: details[cellIndex]?.final ?? "",
          charState: details[cellIndex]?.charState ?? null,
          initialState: details[cellIndex]?.initialState ?? null,
          finalState: details[cellIndex]?.finalState ?? null,
        }));
      }),
    [guesses, target, targetLength],
  );

  function submitGuess() {
    if (solved) return;

    const normalized = normalizeGuess(draft, targetLength);
    if (Array.from(normalized).length !== targetLength) {
      setMessage(`请输入 ${targetLength} 个字。`);
      return;
    }
    if (guesses.includes(normalized)) {
      setMessage("这个词你已经猜过了。");
      return;
    }
    if (guesses.length >= HANDLE_PUZZLE_MAX_GUESSES) {
      setMessage("机会用完了，重置游戏后再来。");
      return;
    }

    const nextGuesses = [...guesses, normalized];
    setGuesses(nextGuesses);
    setDraft("");

    if (normalized === target) {
      const errorMessage = onSolve(normalized);
      setMessage(errorMessage ?? "猜中了，已自动提交。");
      return;
    }

    if (nextGuesses.length >= HANDLE_PUZZLE_MAX_GUESSES) {
      setMessage("还没猜中。字形、声母和韵母都会继续给你反馈。");
      return;
    }

    setMessage(`再试一次。还剩 ${HANDLE_PUZZLE_MAX_GUESSES - nextGuesses.length} 次机会。`);
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitGuess();
  }

  function handleDraftChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setDraft(isComposing ? nextValue : normalizeGuess(nextValue, targetLength));
    setMessage(null);
  }

  function handleDraftCompositionStart(_event: CompositionEvent<HTMLInputElement>) {
    setIsComposing(true);
  }

  function handleDraftCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    setIsComposing(false);
    setDraft(normalizeGuess(event.currentTarget.value, targetLength));
  }

  return (
    <div
      className={`mb-2 rounded-2xl px-3 py-3 text-xs shadow-sm transition-[background-color,color,box-shadow] duration-500 ease-in-out ${
        isNightMode ? "bg-[#141414] text-zinc-300 ring-1 ring-zinc-800" : "bg-white text-zinc-600"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className={`text-sm font-semibold ${isNightMode ? "text-zinc-100" : "text-zinc-900"}`}>猜猜我想的成语</div>
          <div className={isNightMode ? "text-zinc-500" : "text-zinc-500"}>
            我心里想的是一个 {targetLength} 字成语。大格子看字，小标签看声母和韵母；绿色表示位置也对，黄色表示存在但位置不对。
          </div>
        </div>
        <div className={`rounded-full px-2 py-1 font-mono text-[11px] ${isNightMode ? "bg-zinc-900 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
          剩余 {guessesLeft} / {HANDLE_PUZZLE_MAX_GUESSES}
        </div>
      </div>

      <div className={`mb-3 flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm ${isNightMode ? "bg-zinc-900 text-zinc-200" : "bg-zinc-50 text-zinc-700"}`}>
        <span>提示字</span>
        <span className={`rounded-full px-3 py-1 text-base font-semibold tracking-[0.12em] ${isNightMode ? "bg-zinc-800 text-zinc-100" : "bg-white text-zinc-900"}`}>
          {hint}
        </span>
      </div>

      <div className="mb-3 space-y-2">
        {rows.map((row, rowIndex) => (
          <div
            key={`handle-row-${rowIndex}`}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${targetLength}, minmax(0, 1fr))` }}
          >
            {row.map((cell, cellIndex) => {
              return (
                <div
                  key={`handle-row-${rowIndex}-cell-${cellIndex}`}
                  className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border px-1 py-2 transition ${getCellStateClass(cell.charState, isNightMode)}`}
                >
                  <div className="text-lg font-semibold tracking-[0.08em]">{cell.char || " "}</div>
                  <div className="mt-1 flex flex-col gap-1 text-[10px] leading-none">
                    <span className={`rounded-full border px-1.5 py-1 ${getCellStateClass(cell.initialState, isNightMode)}`}>
                      {cell.char ? formatPhoneticPiece("声 ", cell.initial) : " "}
                    </span>
                    <span className={`rounded-full border px-1.5 py-1 ${getCellStateClass(cell.finalState, isNightMode)}`}>
                      {cell.char ? formatPhoneticPiece("韵 ", cell.final) : " "}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          className={`flex-1 rounded-2xl border bg-transparent px-3 py-2 text-sm outline-none transition ${
            isNightMode
              ? "border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600"
              : "border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400"
          }`}
          placeholder={`输入 ${targetLength} 个字的成语`}
          value={draft}
          onChange={handleDraftChange}
          onCompositionStart={handleDraftCompositionStart}
          onCompositionEnd={handleDraftCompositionEnd}
          onKeyDown={handleDraftKeyDown}
        />
        <button
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
            isNightMode
              ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500 hover:text-white disabled:border-zinc-800 disabled:text-zinc-600"
              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950 disabled:bg-zinc-100 disabled:text-zinc-400"
          }`}
          type="button"
          disabled={solved || guesses.length >= HANDLE_PUZZLE_MAX_GUESSES}
          onClick={submitGuess}
        >
          提交试猜
        </button>
      </div>

      {message && (
        <div className={`mt-3 rounded-2xl px-3 py-2 text-sm ${isNightMode ? "bg-zinc-900 text-zinc-100" : "bg-zinc-100 text-zinc-800"}`}>
          {message}
        </div>
      )}
    </div>
  );
}
