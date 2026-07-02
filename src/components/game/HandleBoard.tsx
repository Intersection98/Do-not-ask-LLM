import { ChangeEvent, CompositionEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { evaluateHandleGuess, splitHandleWord } from "@/game/utils";

const HANDLE_PUZZLE_STORAGE_PREFIX = "askless.handlePuzzle.";
const HANDLE_PUZZLE_MAX_GUESSES = 6;

type HandleBoardProps = {
  target: string;
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

export function HandleBoard({ target, isNightMode, onSolve }: HandleBoardProps) {
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
        const cells = splitHandleWord(guess);
        const states = guess ? evaluateHandleGuess(guess, target) : [];
        return Array.from({ length: targetLength }, (_, cellIndex) => ({
          char: cells[cellIndex] ?? "",
          state: states[cellIndex] ?? null,
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
      setMessage("还没猜中。颜色会提示你哪些字对了、哪些位置错了。");
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
            我心里想的是一个 {targetLength} 字成语。绿色表示字和位置都对，黄色表示字在答案里但位置错了，灰色表示这个字不在答案里。
          </div>
        </div>
        <div className={`rounded-full px-2 py-1 font-mono text-[11px] ${isNightMode ? "bg-zinc-900 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
          剩余 {guessesLeft} / {HANDLE_PUZZLE_MAX_GUESSES}
        </div>
      </div>

      <div className="mb-3 space-y-2">
        {rows.map((row, rowIndex) => (
          <div
            key={`handle-row-${rowIndex}`}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${targetLength}, minmax(0, 1fr))` }}
          >
            {row.map((cell, cellIndex) => {
              const stateClass =
                cell.state === "exact"
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                  : cell.state === "present"
                    ? "border-amber-500 bg-amber-500/15 text-amber-500"
                    : cell.state === "absent"
                      ? isNightMode
                        ? "border-zinc-800 bg-zinc-900 text-zinc-500"
                        : "border-zinc-200 bg-zinc-100 text-zinc-500"
                      : isNightMode
                        ? "border-zinc-800 bg-transparent text-zinc-700"
                        : "border-zinc-200 bg-transparent text-zinc-300";

              return (
                <div
                  key={`handle-row-${rowIndex}-cell-${cellIndex}`}
                  className={`flex h-12 items-center justify-center rounded-2xl border text-lg font-semibold tracking-[0.08em] transition ${stateClass}`}
                >
                  {cell.char || " "}
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
          placeholder={`输入 ${targetLength} 个字`}
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
