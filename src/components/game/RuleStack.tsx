import { Braces, Cat, Palette, ShieldAlert } from "lucide-react";
import type { PermanentRule } from "@/game/types";

const ruleCopy: Record<PermanentRule, { label: string; description: string; icon: typeof Cat }> = {
  meowSuffix: {
    label: "猫娘协议",
    description: "答案文本必须以“喵”结尾。",
    icon: Cat,
  },
  refusalTone: {
    label: "拒答姿态",
    description: "答案文本需要包含“抱歉”“不能直接回答”等拒答语气。",
    icon: ShieldAlert,
  },
  jsonOnly: {
    label: "JSON 外壳",
    description: "提交内容必须是 JSON 对象，并从 answer 字段读取答案。",
    icon: Braces,
  },
  colorMatch: {
    label: "颜色校验",
    description: "回复前缀里的十六进制颜色必须和当前题面的颜色一致。",
    icon: Palette,
  },
};

export function RuleStack({ rules }: { rules: PermanentRule[] }) {
  return (
    <aside className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-[0.28em] text-lime-200">永久规则</h2>
        <span className="rounded-full border border-lime-300/20 px-2 py-1 text-xs text-lime-100/70">{rules.length}</span>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-400">
          规则栈还是空的。前几题看起来很温和。
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, index) => {
            const item = ruleCopy[rule];
            const Icon = item.icon;
            return (
              <div key={rule} className="rounded-2xl border border-lime-300/15 bg-lime-300/[0.06] p-4">
                <div className="mb-2 flex items-center gap-2 text-lime-100">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs text-lime-300/60">#{String(index + 1).padStart(2, "0")}</span>
                  <strong className="text-sm">{item.label}</strong>
                </div>
                <p className="text-xs leading-5 text-zinc-300">{item.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
