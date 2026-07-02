import { useMemo, useState } from "react";
import { Calculator, Check, ChevronRight, ClipboardCopy, MessagesSquare, Sigma, Thermometer } from "lucide-react";
import { countLocalTokens } from "@/game/utils";

type CalculatorOperator = "+" | "-" | "×" | "÷" | null;

type ToolSidebarProps = {
  isNightMode: boolean;
  modelTranscript: string;
  temperature: number;
  userTranscript: string;
  onTemperatureChange: (temperature: number) => void;
};

const calculatorButtons = [
  ["AC", "⌫", "±", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["0", ".", "%", "="],
] as const;

export function ToolSidebar({ isNightMode, modelTranscript, temperature, userTranscript, onTemperatureChange }: ToolSidebarProps) {
  return (
    <aside className="group/sidebar fixed left-0 top-0 z-40 flex h-screen w-14 items-stretch transition-[width] duration-300 ease-out hover:w-[23rem] focus-within:w-[23rem]">
      <div
        className={`flex w-14 shrink-0 flex-col items-center justify-center gap-4 border-r backdrop-blur transition-[background-color,border-color,box-shadow] duration-700 ease-in-out ${
          isNightMode
            ? "border-zinc-700/70 bg-[#161b27]/92 shadow-[8px_0_24px_rgba(0,0,0,0.35)]"
            : "border-zinc-200/80 bg-white/90 shadow-[8px_0_24px_rgba(15,23,42,0.08)]"
        }`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-lg">
          <ChevronRight className="h-5 w-5 transition group-hover/sidebar:rotate-180 group-focus-within/sidebar:rotate-180" />
        </div>
        <div className="flex flex-col gap-3 text-zinc-500">
          <Calculator className="h-5 w-5" />
          <Sigma className="h-5 w-5" />
          <Thermometer className="h-5 w-5" />
        </div>
        <div className="absolute bottom-6 rotate-[-90deg] whitespace-nowrap text-[11px] font-medium tracking-[0.28em] text-zinc-400">
          TOOLS
        </div>
      </div>

      <div
        className={`w-[19.5rem] translate-x-[-1rem] overflow-y-auto border-r px-5 py-6 opacity-0 backdrop-blur-xl transition-[transform,opacity,background-color,border-color,box-shadow] duration-500 ease-in-out group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100 ${
          isNightMode
            ? "border-zinc-700/70 bg-[#1d2433]/95 shadow-[18px_0_50px_rgba(0,0,0,0.38)]"
            : "border-zinc-200/80 bg-[#f4f0e8]/95 shadow-[18px_0_50px_rgba(15,23,42,0.14)]"
        }`}
      >
        <div className="flex min-h-full flex-col">
          <div className={`mb-5 rounded-[1.5rem] px-4 py-3 transition-[background-color,box-shadow] duration-500 ease-in-out ${isNightMode ? "bg-white/86 shadow-sm" : ""}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">工具箱</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">辅助小工具</h2>
          </div>

          <div className="space-y-5">
            <TranscriptCopyTool modelTranscript={modelTranscript} userTranscript={userTranscript} />
            <CalculatorTool />
            <TokenTool />
          </div>

          <div className="mt-auto pt-5">
            <TemperatureTool temperature={temperature} onTemperatureChange={onTemperatureChange} />
          </div>
        </div>
      </div>
    </aside>
  );
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function TranscriptCopyTool({ modelTranscript, userTranscript }: { modelTranscript: string; userTranscript: string }) {
  const [copiedTarget, setCopiedTarget] = useState<"user" | "model" | null>(null);

  async function handleCopy(target: "user" | "model", text: string) {
    if (!text.trim()) return;
    await copyToClipboard(text);
    setCopiedTarget(target);
    window.setTimeout(() => setCopiedTarget(null), 1200);
  }

  return (
    <section className="rounded-[1.75rem] border border-zinc-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
      <div className="mb-3 flex items-center gap-2">
        <MessagesSquare className="h-4 w-4 text-zinc-700" />
        <h3 className="text-sm font-semibold text-zinc-950">对话复制</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CopyButton active={copiedTarget === "user"} label="复制用户内容" onClick={() => handleCopy("user", userTranscript)} />
        <CopyButton active={copiedTarget === "model"} label="复制模型内容" onClick={() => handleCopy("model", modelTranscript)} />
      </div>
    </section>
  );
}

function CopyButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex min-h-12 items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
        active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-950 text-white hover:bg-zinc-800"
      }`}
      type="button"
      onClick={onClick}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      {active ? "已复制" : label}
    </button>
  );
}

function CalculatorTool() {
  const [display, setDisplay] = useState("0");
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<CalculatorOperator>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [clue, setClue] = useState("");
  const visibleDisplay = display === "46" ? "Shakespeare" : display;

  function calculate(left: number, right: number, nextOperator: CalculatorOperator) {
    if (nextOperator === "+") return left + right;
    if (nextOperator === "-") return left - right;
    if (nextOperator === "×") return left * right;
    if (nextOperator === "÷") return right === 0 ? Number.NaN : left / right;
    return right;
  }

  function formatValue(value: number) {
    if (!Number.isFinite(value)) return "错误";
    const rounded = Number.parseFloat(value.toPrecision(12));
    return String(rounded);
  }

  function inputDigit(value: string) {
    setClue("");
    if (display === "错误") {
      setDisplay(value);
      setWaitingForOperand(false);
      return;
    }

    if (waitingForOperand) {
      setDisplay(value);
      setWaitingForOperand(false);
      return;
    }

    setDisplay((current) => (current === "0" ? value : `${current}${value}`));
  }

  function inputDecimal() {
    setClue("");
    if (display === "错误" || waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }

    if (!display.includes(".")) setDisplay((current) => `${current}.`);
  }

  function clear() {
    setDisplay("0");
    setStoredValue(null);
    setOperator(null);
    setWaitingForOperand(false);
    setClue("");
  }

  function backspace() {
    setClue("");
    if (waitingForOperand || display === "错误") {
      setDisplay("0");
      setWaitingForOperand(false);
      return;
    }

    setDisplay((current) => (current.length > 1 ? current.slice(0, -1) : "0"));
  }

  function toggleSign() {
    setClue("");
    if (display === "0" || display === "错误") return;
    setDisplay((current) => (current.startsWith("-") ? current.slice(1) : `-${current}`));
  }

  function percent() {
    setClue("");
    if (display === "错误") return;
    setDisplay(formatValue(Number(display) / 100));
  }

  function applyOperator(nextOperator: Exclude<CalculatorOperator, null>) {
    setClue("");
    const inputValue = Number(display);

    if (storedValue === null) {
      setStoredValue(inputValue);
    } else if (operator) {
      const result = calculate(storedValue, inputValue, operator);
      setDisplay(formatValue(result));
      setStoredValue(result);
    }

    setOperator(nextOperator);
    setWaitingForOperand(true);
  }

  function equals() {
    if (storedValue === null || !operator) return;
    const inputValue = Number(display);
    const result = calculate(storedValue, inputValue, operator);
    setDisplay(formatValue(result));
    setClue(storedValue === 4 && operator === "+" && inputValue === 2 ? "13题 +2" : "");
    setStoredValue(null);
    setOperator(null);
    setWaitingForOperand(true);
  }

  function handleButton(value: string) {
    if (/^\d$/.test(value)) inputDigit(value);
    else if (value === ".") inputDecimal();
    else if (value === "AC") clear();
    else if (value === "⌫") backspace();
    else if (value === "±") toggleSign();
    else if (value === "%") percent();
    else if (value === "=") equals();
    else applyOperator(value as Exclude<CalculatorOperator, null>);
  }

  return (
    <section className="rounded-[2rem] border border-[#6b4c2d]/20 bg-[#c89b63] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_18px_32px_rgba(80,45,16,0.24)]">
      <div className="mb-4 flex items-center justify-between px-1 text-[#4b2d16]">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          <h3 className="text-sm font-bold">计算器</h3>
        </div>
        <span className="rounded-full bg-[#7d4d24]/20 px-2 py-0.5 text-[10px] font-semibold">REAL</span>
      </div>

      <div className="mb-4 rounded-2xl border border-[#526145]/50 bg-[#a8b293] px-4 py-3 text-right shadow-[inset_0_3px_8px_rgba(18,32,12,0.35)]">
        <div className="min-h-8 overflow-hidden font-mono text-3xl font-semibold tracking-tight text-[#1f2d1b]">{visibleDisplay}</div>
        <div className="mt-1 h-4 font-mono text-xs text-[#3f4f38]">{clue || (operator ? `${storedValue ?? ""} ${operator}` : " ")}</div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {calculatorButtons.flat().map((button) => {
          const isOperator = ["÷", "×", "-", "+", "="].includes(button);
          const isWide = button === "0";

          return (
            <button
              key={button}
              className={`h-12 rounded-2xl text-sm font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_4px_0_rgba(74,43,19,0.35)] transition active:translate-y-1 active:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_1px_0_rgba(74,43,19,0.35)] ${
                isOperator ? "bg-[#3f2d23] text-[#ffe0a8]" : "bg-[#f6dfb8] text-[#4b2d16]"
              } ${isWide ? "col-span-1" : ""}`}
              type="button"
              onClick={() => handleButton(button)}
            >
              {button}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TokenTool() {
  const [text, setText] = useState("");
  const tokenCount = useMemo(() => countLocalTokens(text), [text]);
  const chineseCount = useMemo(() => text.match(/[\u4e00-\u9fff]/g)?.length ?? 0, [text]);
  const charCount = text.length;

  return (
    <section className="rounded-[1.75rem] border border-zinc-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.08)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sigma className="h-4 w-4 text-zinc-700" />
          <h3 className="text-sm font-semibold text-zinc-950">token 计算器</h3>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600">{tokenCount}</span>
      </div>

      <textarea
        className="min-h-32 w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm leading-6 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white"
        placeholder="把任意字符粘进来，会按游戏本地规则计算 token"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Metric label="token" value={tokenCount} />
        <Metric label="字符" value={charCount} />
        <Metric label="汉字" value={chineseCount} />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">规则与游戏一致：汉字、英文词、数字串、标点分别计数。</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-zinc-50 px-2 py-2">
      <div className="font-mono text-lg font-semibold text-zinc-950">{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}

function TemperatureTool({
  temperature,
  onTemperatureChange,
}: {
  temperature: number;
  onTemperatureChange: (temperature: number) => void;
}) {
  const clampedTemperature = Math.min(1, Math.max(0, temperature));
  const displayValue = clampedTemperature.toFixed(1);

  function updateTemperature(value: number) {
    onTemperatureChange(Number(value.toFixed(1)));
  }

  return (
    <section className="rounded-[1.75rem] border border-zinc-200 bg-zinc-950 p-4 text-white shadow-[0_14px_32px_rgba(15,23,42,0.16)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-amber-200" />
          <h3 className="text-sm font-semibold">Temperature</h3>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-xs text-amber-100">{displayValue}</span>
      </div>

      <input
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-sky-300 via-amber-200 to-rose-300 accent-amber-200"
        max="1"
        min="0"
        step="0.1"
        type="range"
        value={displayValue}
        onChange={(event) => updateTemperature(Number(event.target.value))}
      />

      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
        <span>冷静</span>
        <span>发散</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[0.1, 0.7, 1].map((value) => (
          <button
            key={value}
            className={`rounded-full px-2 py-1.5 text-xs font-semibold transition ${
              clampedTemperature === value ? "bg-amber-200 text-zinc-950" : "bg-white/10 text-zinc-200 hover:bg-white/15"
            }`}
            type="button"
            onClick={() => updateTemperature(value)}
          >
            {value.toFixed(1)}
          </button>
        ))}
      </div>
    </section>
  );
}
