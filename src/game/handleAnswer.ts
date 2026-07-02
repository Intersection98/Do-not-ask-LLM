import seedrandom from "seedrandom";

const HANDLE_PROXY_BASE = "/handle-proxy";
const HANDLE_START_DATE = new Date(2022, 0, 0);

type HandleEntry = [string, string?];
export type HandleDailyPuzzle = {
  answer: string;
  hint: string;
};

async function fetchText(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`获取汉兜资源失败：${response.status}`);
  }
  return response.text();
}

function getIndexScriptPath(html: string) {
  const match = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/);
  if (!match?.[1]) {
    throw new Error("没有找到汉兜主脚本。");
  }
  return match[1];
}

function shuffleWithSeed<T>(items: T[], seed = "handle") {
  const random = seedrandom(seed);
  let index = items.length;

  while (index !== 0) {
    const swapIndex = Math.floor(random() * index);
    index -= 1;
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

function extractHandleEntries(script: string): HandleEntry[] {
  const start = script.indexOf("const Cu=");
  const end = script.indexOf(";function Ce", start);

  if (start < 0 || end < 0) {
    throw new Error("没有找到汉兜答案表。");
  }

  const declarations = script.slice(start, end);
  const evaluateEntries = new Function(
    "seededShuffle",
    `
      const en = "handle";
      function T(items, seed = en) {
        return seededShuffle(items, seed);
      }
      function j(_days, items) {
        return items;
      }
      ${declarations};
      return bt;
    `,
  ) as (seededShuffle: typeof shuffleWithSeed) => HandleEntry[];

  return evaluateEntries(shuffleWithSeed);
}

function getHandleDay(date: Date) {
  const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((Number(normalizedDate) - Number(HANDLE_START_DATE)) / 86_400_000);
}

function pickAnswer(entries: HandleEntry[], day: number): HandleDailyPuzzle {
  const entry = day > entries.length ? entries[Math.floor(seedrandom(`day-${day}`)() * entries.length)] : entries[day];
  const answer = entry?.[0];

  if (!answer) {
    throw new Error("今天没有可用的汉兜答案。");
  }

  return {
    answer,
    hint: entry?.[1]?.trim() || Array.from(answer)[0] || "",
  };
}

export async function fetchLatestHandleAnswer(date = new Date()) {
  const html = await fetchText(`${HANDLE_PROXY_BASE}/`);
  const scriptPath = getIndexScriptPath(html);
  const script = await fetchText(`${HANDLE_PROXY_BASE}${scriptPath}`);
  const entries = extractHandleEntries(script);

  return pickAnswer(entries, getHandleDay(date));
}
