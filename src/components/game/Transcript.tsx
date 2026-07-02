import { CheckCircle2 } from "lucide-react";
import type { AnswerRecord } from "@/game/types";

export function Transcript({ answers }: { answers: AnswerRecord[] }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-[0.24em] text-zinc-200">通过历史</h2>
        <span className="font-mono text-xs text-zinc-500">{answers.length} 条</span>
      </div>

      {answers.length === 0 ? (
        <p className="text-sm text-zinc-500">还没有被规则接受的回答。</p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {answers.map((answer) => (
            <article key={`${answer.levelId}-${answer.acceptedAt}`} className="rounded-2xl bg-white/[0.04] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-lime-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                第 {String(answer.levelId).padStart(2, "0")} 题通过
              </div>
              <p className="line-clamp-2 text-xs text-zinc-400">{answer.question}</p>
              <p className="mt-2 break-words font-mono text-xs leading-5 text-zinc-200">{answer.acceptedText}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
