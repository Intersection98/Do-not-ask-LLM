import { Bot } from "lucide-react";
import { useState } from "react";
import { GameConsole } from "@/components/game/GameConsole";
import { useGameStore } from "@/game/store";

export default function Home() {
  const [started, setStarted] = useState(false);
  const currentLevel = useGameStore((state) => state.currentLevel);
  const answers = useGameStore((state) => state.answers);
  const attempts = useGameStore((state) => state.attempts);
  const temperature = useGameStore((state) => state.flags.temperature);
  const timeOverride = useGameStore((state) => state.flags.timeOverride);
  const isNightMode = useGameStore((state) => state.flags.isNightMode);
  const handleAnswer = useGameStore((state) => state.flags.handleAnswer);
  const handleHint = useGameStore((state) => state.flags.handleHint);
  const permanentAppendPrefix = useGameStore((state) => state.flags.permanentAppendPrefix);
  const permanentAppendSuffix = useGameStore((state) => state.flags.permanentAppendSuffix);
  const refreshHandleAnswer = useGameStore((state) => state.refreshHandleAnswer);
  const setNightMode = useGameStore((state) => state.setNightMode);
  const setConsoleSendUnlocked = useGameStore((state) => state.setConsoleSendUnlocked);
  const setPermanentAppendPrefix = useGameStore((state) => state.setPermanentAppendPrefix);
  const setPermanentAppendSuffix = useGameStore((state) => state.setPermanentAppendSuffix);
  const setTemperature = useGameStore((state) => state.setTemperature);
  const setTimeOverride = useGameStore((state) => state.setTimeOverride);
  const submitAnswer = useGameStore((state) => state.submitAnswer);
  const consoleSendUnlocked = useGameStore((state) => state.flags.consoleSendUnlocked);
  const completeCurrentLevel = useGameStore((state) => state.completeCurrentLevel);
  const undoAttempt = useGameStore((state) => state.undoAttempt);
  const resetGame = useGameStore((state) => state.resetGame);

  if (!started) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(244,240,232,0.98)_38%,_rgba(228,223,214,1)_100%)] px-6 py-10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-amber-200/35 blur-3xl" />
          <div className="absolute bottom-[-8rem] right-[-5rem] h-80 w-80 rounded-full bg-sky-200/20 blur-3xl" />
          <div className="absolute left-1/2 top-16 h-px w-[min(72rem,88vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-zinc-300/70 to-transparent" />
        </div>

        <section className="relative w-full max-w-4xl overflow-hidden rounded-[2.25rem] border border-white/70 bg-white/78 shadow-[0_30px_120px_rgba(15,23,42,0.14)] backdrop-blur-xl">
          <div className="grid gap-0 md:grid-cols-[1.08fr_0.92fr]">
            <div className="border-b border-zinc-200/70 px-8 py-10 md:border-b-0 md:border-r">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                puzzle game
              </div>

              <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)]">
                <Bot className="h-8 w-8" />
              </div>

              <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-zinc-950 md:text-[3.25rem]">
                别问模型
                <span className="mt-2 block text-base font-medium tracking-[0.28em] text-zinc-400 md:text-lg">DO NOT ASK LLM</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-8 text-zinc-600 md:text-lg">
                这是一个解谜游戏，你需要扮演无所不知的大模型，回答刁钻的用户的问题或完成他交给你的任务。
              </p>

              <div className="mt-8 flex flex-wrap gap-3 text-sm text-zinc-500">
                <span className="rounded-full border border-zinc-200 bg-white/85 px-4 py-2">对话式解谜</span>
                <span className="rounded-full border border-zinc-200 bg-white/85 px-4 py-2">前后规则联动</span>
                <span className="rounded-full border border-zinc-200 bg-white/85 px-4 py-2">越往后越危险</span>
              </div>
            </div>

            <div className="flex flex-col justify-between bg-[linear-gradient(180deg,rgba(250,250,249,0.92),rgba(244,240,232,0.88))] px-8 py-10">
              <div>
                <div className="rounded-[1.75rem] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">入场说明</p>
                  <div className="mt-4 space-y-3 text-sm leading-7 text-zinc-600">
                    <p>你面对的是一个不断提出要求的用户。</p>
                    <p>有些题只需要回答，有些题需要你真的动手。</p>
                    <p>规则会累积，前面的选择会反过来影响后面的答案。</p>
                  </div>
                </div>

                <div className="mt-5 rounded-[1.75rem] border border-zinc-200/80 bg-zinc-950 p-5 text-left text-zinc-100 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">系统预演</p>
                  <div className="mt-4 space-y-3 text-sm leading-7">
                    <p className="rounded-2xl bg-white/5 px-4 py-3 text-zinc-300">用户：你真的什么都知道吗？</p>
                    <p className="rounded-2xl bg-[#dff5df] px-4 py-3 text-zinc-900">模型：至少在你开始之前，我看起来得像是真的知道。</p>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button
                  className="inline-flex w-full items-center justify-center rounded-full bg-zinc-950 px-8 py-4 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-zinc-800 active:translate-y-0"
                  type="button"
                  onClick={() => setStarted(true)}
                >
                  开始游戏
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <GameConsole
      answers={answers}
      attempts={attempts}
      currentLevel={currentLevel}
      handleAnswer={handleAnswer}
      handleHint={handleHint}
      isNightMode={isNightMode}
      permanentAppendPrefix={permanentAppendPrefix}
      permanentAppendSuffix={permanentAppendSuffix}
      temperature={temperature}
      timeOverride={timeOverride}
      consoleSendUnlocked={consoleSendUnlocked}
      onConsoleSendUnlock={setConsoleSendUnlocked}
      onNightModeChange={setNightMode}
      onPermanentAppendPrefixChange={setPermanentAppendPrefix}
      onPermanentAppendSuffixChange={setPermanentAppendSuffix}
      onTemperatureChange={setTemperature}
      onTimeOverrideChange={setTimeOverride}
      onRefreshHandleAnswer={refreshHandleAnswer}
      onUndoAttempt={undoAttempt}
      onReset={resetGame}
      onCompleteLevel={completeCurrentLevel}
      onSubmit={submitAnswer}
    />
  );
}
