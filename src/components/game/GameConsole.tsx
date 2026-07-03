import { ClipboardEvent, CSSProperties, FormEvent, KeyboardEvent, PointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Clock3, Moon, Pin, RotateCcw, RefreshCcw, Send, Sun, Upload, UserRound, X } from "lucide-react";
import { getCurrentLevel, getTuringPuzzleForLevel, isGameComplete, playableLevels } from "@/game/levels";
import type { AnswerRecord, AttemptRecord, LinePuzzle, ValidationResult } from "@/game/types";
import { extractLeadingHexColor, formatClock } from "@/game/utils";
import { HandleBoard } from "./HandleBoard";
import { ToolSidebar } from "./ToolSidebar";

type GameConsoleProps = {
  currentLevel: number;
  handleAnswer: string;
  handleHint: string;
  answers: AnswerRecord[];
  attempts: AttemptRecord[];
  isNightMode: boolean;
  consoleSendUnlocked: boolean;
  permanentAppendPrefix: string;
  permanentAppendSuffix: string;
  temperature: number;
  timeOverride: string | null;
  onConsoleSendUnlock: (consoleSendUnlocked: boolean) => void;
  onNightModeChange: (isNightMode: boolean) => void;
  onPermanentAppendPrefixChange: (prefix: string) => void;
  onPermanentAppendSuffixChange: (suffix: string) => void;
  onTemperatureChange: (temperature: number) => void;
  onTimeOverrideChange: (timeOverride: string | null) => void;
  onRefreshHandleAnswer: () => Promise<unknown>;
  onSubmit: (input: string) => ValidationResult;
  onCompleteLevel: (acceptedText: string, input?: string) => ValidationResult;
  onUndoAttempt: (createdAt: number) => void;
  onReset: () => void;
};

type TuringQueryRecord = {
  proposal: string;
  results: Array<{
    verifierId: string;
    verifierLabel: string;
    passed: boolean;
  }>;
};

const NIGHT_BLACK = "#000000";
const LIGHT_PUZZLE_CLUES: Record<number, string> = {
  4: "凌晨2点33",
  9: "开灯，",
  14: "晚10点",
  19: "熄灯。",
};
const HIDDEN_PASSAGE_TEXT = `God is our refuge and strength, a very present help in trouble.

Therefore will not we fear, though the earth be removed, and though the mountains be carried into the midst of the sea;

Though the waters thereof roar and be troubled, though the mountains shake with the swelling thereof. Selah.

There is a river, the streams whereof shall make glad the city of God, the holy place of the tabernacles of the most High.

God is in the midst of her; she shall not be moved: God shall help her, and that right early.

The heathen raged, the kingdoms were moved: he uttered his voice, the earth melted.

The Lord of hosts is with us; the God of Jacob is our refuge. Selah.

Come, behold the works of the Lord, what desolations he hath made in the earth.

He maketh wars to cease unto the end of the earth; he breaketh the bow, and cutteth the spear in sunder; he burneth the chariot in the fire.

Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.

The Lord of hosts is with us; the God of Jacob is our refuge. Selah.`;

type ScreenPoint = {
  x: number;
  y: number;
};

type BranchLinePuzzle = Extract<LinePuzzle, { kind: "branch" }>;

type LinePuzzlePointerEdgeState = {
  fromId: string;
  toId: string;
  ratio: number;
};

const BRANCH_LINE_PUZZLE_EDGE_TOLERANCE = 34;
const BRANCH_LINE_PUZZLE_SNAP_RATIO = 0.98;
const BRANCH_LINE_PUZZLE_RELEASE_SNAP_RATIO = 0.9;
const BRANCH_LINE_PUZZLE_RELEASE_NODE_TOLERANCE = 28;
const LOCKED_SEND_REPLY_INTERVAL_MS = 3000;

type BranchLinePuzzleCandidate = {
  neighborId: string;
  distance: number;
  ratio: number;
  distanceToNeighborNode: number;
  projectedPuzzlePoint: ScreenPoint;
};

type BranchLinePuzzleTraversalSummary = {
  requiredBlackHitIds: string[];
  requiredWhiteHitIds: string[];
  forbiddenBlackHitIds: string[];
  forbiddenWhiteHitIds: string[];
  toggleHitIds: string[];
  isToggled: boolean;
};

type BranchLinePuzzleRegionSummary = {
  isBalanced: boolean;
  unbalancedCellDotIds: string[];
};

function buildLinePuzzleSvgPath(points: readonly { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

function getLinePuzzleEdgeKey(a: string, b: string) {
  return [a, b].sort().join("__");
}

function getBranchLinePuzzleTraversalSummary(
  linePuzzle: BranchLinePuzzle,
  nodeMap: Map<string, { x: number; y: number }>,
  nodeTrail: string[],
  pointerEdge: LinePuzzlePointerEdgeState | null,
  baseToggled = false,
  manualToggleNodeIndices: number[] = [],
): BranchLinePuzzleTraversalSummary {
  const requiredBlackHitIds = new Set<string>();
  const requiredWhiteHitIds = new Set<string>();
  const forbiddenBlackHitIds = new Set<string>();
  const forbiddenWhiteHitIds = new Set<string>();
  const toggleHitIds = new Set<string>();

  const segments: Array<LinePuzzlePointerEdgeState & { fromNodeIndex: number }> = [];
  for (let index = 1; index < nodeTrail.length; index += 1) {
    segments.push({
      fromNodeIndex: index - 1,
      fromId: nodeTrail[index - 1],
      toId: nodeTrail[index],
      ratio: 1,
    });
  }
  if (pointerEdge) {
    segments.push({ ...pointerEdge, fromNodeIndex: nodeTrail.length - 1 });
  }

  let isToggled = baseToggled;
  const manualToggleCounts = new Map<number, number>();
  manualToggleNodeIndices.forEach((nodeIndex) => {
    manualToggleCounts.set(nodeIndex, (manualToggleCounts.get(nodeIndex) ?? 0) + 1);
  });
  const entries = [
    ...linePuzzle.requiredDots.map((dot) => ({ ...dot, kind: "required" as const })),
    ...(linePuzzle.forbiddenDots ?? []).map((dot) => ({ ...dot, kind: "forbidden" as const })),
    ...(linePuzzle.toggleDots ?? []).map((dot) => ({ ...dot, kind: "toggle" as const })),
  ];

  segments.forEach((segment) => {
    if (((manualToggleCounts.get(segment.fromNodeIndex) ?? 0) & 1) === 1) {
      isToggled = !isToggled;
    }

    const fromNode = nodeMap.get(segment.fromId);
    const toNode = nodeMap.get(segment.toId);
    if (!fromNode || !toNode) return;

    const edgeDx = toNode.x - fromNode.x;
    const edgeDy = toNode.y - fromNode.y;
    const edgeLength = Math.hypot(edgeDx, edgeDy);
    if (edgeLength === 0) return;

    const edgeItems = entries
      .filter((entry) => getLinePuzzleEdgeKey(entry.edgeNodeIds[0], entry.edgeNodeIds[1]) === getLinePuzzleEdgeKey(segment.fromId, segment.toId))
      .map((entry) => {
        const ratio =
          Math.abs(edgeDx) >= Math.abs(edgeDy) ? (entry.x - fromNode.x) / edgeDx : (entry.y - fromNode.y) / edgeDy;
        return { ...entry, ratio };
      })
      .filter((entry) => Number.isFinite(entry.ratio) && entry.ratio >= 0 && entry.ratio <= segment.ratio + 1e-6)
      .sort((left, right) => left.ratio - right.ratio);

    edgeItems.forEach((entry) => {
      if (entry.kind === "toggle") {
        toggleHitIds.add(entry.id);
        isToggled = !isToggled;
        return;
      }
      if (entry.kind === "required") {
        if (isToggled) {
          requiredWhiteHitIds.add(entry.id);
        } else {
          requiredBlackHitIds.add(entry.id);
        }
        return;
      }
      if (isToggled) {
        forbiddenBlackHitIds.add(entry.id);
      } else {
        forbiddenWhiteHitIds.add(entry.id);
      }
    });
  });

  if (pointerEdge == null && nodeTrail.length > 0 && ((manualToggleCounts.get(nodeTrail.length - 1) ?? 0) & 1) === 1) {
    isToggled = !isToggled;
  }

  return {
    requiredBlackHitIds: [...requiredBlackHitIds],
    requiredWhiteHitIds: [...requiredWhiteHitIds],
    forbiddenBlackHitIds: [...forbiddenBlackHitIds],
    forbiddenWhiteHitIds: [...forbiddenWhiteHitIds],
    toggleHitIds: [...toggleHitIds],
    isToggled,
  };
}

function getBranchLinePuzzleRegionSummary(
  linePuzzle: BranchLinePuzzle,
  nodeTrail: string[],
  isToggled: boolean,
): BranchLinePuzzleRegionSummary {
  if (!linePuzzle.regionBalanceRequired || !linePuzzle.cells?.length || !linePuzzle.cellDots?.length) {
    return { isBalanced: true, unbalancedCellDotIds: [] };
  }

  const traversedEdges = new Set<string>();
  for (let index = 1; index < nodeTrail.length; index += 1) {
    traversedEdges.add(getLinePuzzleEdgeKey(nodeTrail[index - 1], nodeTrail[index]));
  }

  const cellEdgeMap = new Map(
    linePuzzle.cells.map((cell) => [
      cell.id,
      [
        getLinePuzzleEdgeKey(cell.nodeIds[0], cell.nodeIds[1]),
        getLinePuzzleEdgeKey(cell.nodeIds[1], cell.nodeIds[2]),
        getLinePuzzleEdgeKey(cell.nodeIds[2], cell.nodeIds[3]),
        getLinePuzzleEdgeKey(cell.nodeIds[3], cell.nodeIds[0]),
      ],
    ]),
  );

  const cellConnections = new Map<string, Array<{ neighborId: string; sharedEdgeKey: string }>>();
  linePuzzle.cells.forEach((cell) => cellConnections.set(cell.id, []));

  for (let index = 0; index < linePuzzle.cells.length; index += 1) {
    const currentCell = linePuzzle.cells[index];
    const currentEdges = cellEdgeMap.get(currentCell.id) ?? [];
    for (let neighborIndex = index + 1; neighborIndex < linePuzzle.cells.length; neighborIndex += 1) {
      const neighborCell = linePuzzle.cells[neighborIndex];
      const neighborEdges = cellEdgeMap.get(neighborCell.id) ?? [];
      const sharedEdgeKey = currentEdges.find((edgeKey) => neighborEdges.includes(edgeKey));
      if (!sharedEdgeKey) continue;
      cellConnections.get(currentCell.id)?.push({ neighborId: neighborCell.id, sharedEdgeKey });
      cellConnections.get(neighborCell.id)?.push({ neighborId: currentCell.id, sharedEdgeKey });
    }
  }

  const cellRegionIds: Record<string, number> = {};
  const regionCounts: Array<{ black: number; white: number; dotIds: string[] }> = [];
  const visitedCellIds = new Set<string>();

  linePuzzle.cells.forEach((cell) => {
    if (visitedCellIds.has(cell.id)) return;

    const regionIndex = regionCounts.length;
    regionCounts.push({ black: 0, white: 0, dotIds: [] });

    const queue = [cell.id];
    visitedCellIds.add(cell.id);

    while (queue.length > 0) {
      const currentCellId = queue.shift();
      if (!currentCellId) continue;

      cellRegionIds[currentCellId] = regionIndex;

      (cellConnections.get(currentCellId) ?? []).forEach((connection) => {
        if (traversedEdges.has(connection.sharedEdgeKey) || visitedCellIds.has(connection.neighborId)) {
          return;
        }
        visitedCellIds.add(connection.neighborId);
        queue.push(connection.neighborId);
      });
    }
  });

  linePuzzle.cellDots.forEach((dot) => {
    const regionIndex = cellRegionIds[dot.cellId];
    if (regionIndex === undefined) return;
    const activeColor = isToggled ? (dot.color === "black" ? "white" : "black") : dot.color;
    regionCounts[regionIndex].dotIds.push(dot.id);
    if (activeColor === "black") {
      regionCounts[regionIndex].black += 1;
    } else {
      regionCounts[regionIndex].white += 1;
    }
  });

  const unbalancedCellDotIds = regionCounts
    .filter((regionCount) => regionCount.black !== regionCount.white)
    .flatMap((regionCount) => regionCount.dotIds);

  return {
    isBalanced: unbalancedCellDotIds.length === 0,
    unbalancedCellDotIds,
  };
}

function getBranchLinePuzzleMissingBlackDotIds(
  linePuzzle: BranchLinePuzzle,
  traversalSummary: BranchLinePuzzleTraversalSummary,
) {
  const missingDotIds: string[] = [];

  if (!traversalSummary.isToggled) {
    linePuzzle.requiredDots.forEach((dot) => {
      if (!traversalSummary.requiredBlackHitIds.includes(dot.id)) {
        missingDotIds.push(dot.id);
      }
    });
    return missingDotIds;
  }

  (linePuzzle.forbiddenDots ?? []).forEach((dot) => {
    if (!traversalSummary.forbiddenBlackHitIds.includes(dot.id)) {
      missingDotIds.push(dot.id);
    }
  });

  return missingDotIds;
}

function getActiveBlackDotRequirementCount(
  linePuzzle: BranchLinePuzzle,
  traversalSummary: BranchLinePuzzleTraversalSummary,
) {
  return traversalSummary.isToggled ? (linePuzzle.forbiddenDots?.length ?? 0) : linePuzzle.requiredDots.length;
}

function canCompleteBranchLinePuzzle(
  linePuzzle: BranchLinePuzzle,
  traversalSummary: BranchLinePuzzleTraversalSummary,
  regionSummary: BranchLinePuzzleRegionSummary,
  endedAtEndNode: boolean,
) {
  if (!endedAtEndNode) return false;

  const collectedDotCount = traversalSummary.isToggled
    ? traversalSummary.forbiddenBlackHitIds.length
    : traversalSummary.requiredBlackHitIds.length;
  const hasForbiddenHit = traversalSummary.requiredWhiteHitIds.length + traversalSummary.forbiddenWhiteHitIds.length > 0;
  const requiredCollectedCount = getActiveBlackDotRequirementCount(linePuzzle, traversalSummary);

  return collectedDotCount === requiredCollectedCount && !hasForbiddenHit && regionSummary.isBalanced;
}

function shouldSnapBranchLinePuzzleCandidate(candidate: BranchLinePuzzleCandidate, isPointerRelease = false) {
  if (candidate.ratio >= BRANCH_LINE_PUZZLE_SNAP_RATIO) {
    return true;
  }
  if (!isPointerRelease) {
    return false;
  }
  return candidate.ratio >= BRANCH_LINE_PUZZLE_RELEASE_SNAP_RATIO || candidate.distanceToNeighborNode <= BRANCH_LINE_PUZZLE_RELEASE_NODE_TOLERANCE;
}

function pickBranchLinePuzzleReleaseCandidate(
  endCandidate: BranchLinePuzzleCandidate | null,
  pointerEdgeCandidate: BranchLinePuzzleCandidate | null,
  pointerPositionCandidate: BranchLinePuzzleCandidate | null,
) {
  const candidates = [endCandidate, pointerEdgeCandidate, pointerPositionCandidate]
    .filter((candidate): candidate is BranchLinePuzzleCandidate => Boolean(candidate))
    .filter((candidate) => candidate.distance <= BRANCH_LINE_PUZZLE_EDGE_TOLERANCE);

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftSnap = shouldSnapBranchLinePuzzleCandidate(left, true) ? 1 : 0;
    const rightSnap = shouldSnapBranchLinePuzzleCandidate(right, true) ? 1 : 0;
    if (leftSnap !== rightSnap) {
      return rightSnap - leftSnap;
    }
    if (left.distanceToNeighborNode !== right.distanceToNeighborNode) {
      return left.distanceToNeighborNode - right.distanceToNeighborNode;
    }
    return right.ratio - left.ratio;
  });

  return candidates[0];
}

export function GameConsole({
  currentLevel,
  handleAnswer,
  handleHint,
  answers,
  attempts,
  isNightMode,
  consoleSendUnlocked,
  permanentAppendPrefix,
  permanentAppendSuffix,
  temperature,
  timeOverride,
  onConsoleSendUnlock,
  onNightModeChange,
  onPermanentAppendPrefixChange,
  onPermanentAppendSuffixChange,
  onTemperatureChange,
  onTimeOverrideChange,
  onRefreshHandleAnswer,
  onSubmit,
  onCompleteLevel,
  onUndoAttempt,
  onReset,
}: GameConsoleProps) {
  const [input, setInput] = useState("");
  const [appendToolOpen, setAppendToolOpen] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [selectedUploadPreviewUrl, setSelectedUploadPreviewUrl] = useState<string | null>(null);
  const [pendingUploadPreviewUrl, setPendingUploadPreviewUrl] = useState<string | null>(null);
  const [pendingUploadLevelId, setPendingUploadLevelId] = useState<number | null>(null);
  const [uploadAttemptPreviews, setUploadAttemptPreviews] = useState<Record<number, string>>({});
  const [turingProposal, setTuringProposal] = useState("");
  const [selectedTuringVerifierId, setSelectedTuringVerifierId] = useState<string | null>(null);
  const [turingQueryLog, setTuringQueryLog] = useState<TuringQueryRecord[]>([]);
  const [turingFeedback, setTuringFeedback] = useState<string | null>(null);
  const [linePuzzleProgress, setLinePuzzleProgress] = useState(0);
  const [linePuzzleDragging, setLinePuzzleDragging] = useState(false);
  const [linePuzzleSolved, setLinePuzzleSolved] = useState(false);
  const [linePuzzleStartHovered, setLinePuzzleStartHovered] = useState(false);
  const [linePuzzleNodeTrail, setLinePuzzleNodeTrail] = useState<string[]>([]);
  const [linePuzzlePointerPoint, setLinePuzzlePointerPoint] = useState<{ x: number; y: number } | null>(null);
  const [linePuzzlePointerEdge, setLinePuzzlePointerEdge] = useState<LinePuzzlePointerEdgeState | null>(null);
  const [linePuzzleBaseNightMode, setLinePuzzleBaseNightMode] = useState(false);
  const [linePuzzleManualToggleNodeIndices, setLinePuzzleManualToggleNodeIndices] = useState<number[]>([]);
  const [linePuzzleFailedDotIds, setLinePuzzleFailedDotIds] = useState<string[]>([]);
  const [linePuzzleFailedCellDotIds, setLinePuzzleFailedCellDotIds] = useState<string[]>([]);
  const [systemNow, setSystemNow] = useState(() => new Date());
  const [favoriteColorHex, setFavoriteColorHex] = useState("#DD0000");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const linePuzzleBoardRef = useRef<HTMLDivElement>(null);
  const linePuzzleTimeoutRef = useRef<number | null>(null);
  const linePuzzleFailureTimeoutRef = useRef<number | null>(null);
  const lockedSendReplyIntervalRef = useRef<number | null>(null);
  const lockedSendAttemptRef = useRef("");
  const linePuzzleCompletingRef = useRef(false);
  const linePuzzleNodeTrailRef = useRef<string[]>([]);
  const linePuzzlePointerEdgeRef = useRef<LinePuzzlePointerEdgeState | null>(null);
  const linePuzzleBaseNightModeRef = useRef(false);
  const linePuzzleManualToggleNodeIndicesRef = useRef<number[]>([]);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const complete = isGameComplete(currentLevel);
  const currentQuestion = complete ? null : getCurrentLevel(currentLevel);
  const activeLinePuzzle = currentQuestion?.linePuzzle ?? null;
  const activePathLinePuzzle = activeLinePuzzle && activeLinePuzzle.kind !== "branch" ? activeLinePuzzle : null;
  const activeBranchLinePuzzle = activeLinePuzzle?.kind === "branch" ? activeLinePuzzle : null;
  const hasLinePuzzle = Boolean(activeLinePuzzle);
  const isHandleLevel = currentQuestion?.id === 6;
  const keyboardChoices = currentQuestion?.keyboardChoices ?? [];
  const keyboardChoiceRows = useMemo(
    () => [keyboardChoices.slice(0, 10), keyboardChoices.slice(10, 20), keyboardChoices.slice(20, 30), keyboardChoices.slice(30)],
    [keyboardChoices],
  );
  const hasKeyboardChoices = keyboardChoices.length > 0;
  const inputDisabled = complete || hasLinePuzzle || hasKeyboardChoices || isHandleLevel;
  const isConsoleLockedLevel = currentQuestion?.id === 37;
  const isConsoleSendLocked = isConsoleLockedLevel && !consoleSendUnlocked;
  const displayedClock = timeOverride ?? formatClock(systemNow);
  const jsonRuleRemoved = answers.some((answer) => answer.levelId === 11);
  const shouldShowTools = currentLevel >= 6;
  const hasPickedFavoriteColor = favoriteColorHex !== "#DD0000";
  const favoriteColorDisplay = hasPickedFavoriteColor ? favoriteColorHex : "#DD0000";
  const favoriteColorPreview = hasPickedFavoriteColor ? favoriteColorHex : "#000000";
  const previewInput = applyPermanentAppend(input, permanentAppendPrefix, permanentAppendSuffix);
  const inputTextStyle = isNightMode ? getBubbleTextStyle(previewInput) ?? { color: "#f5f5f5" } : getBubbleTextStyle(previewInput);
  const activeTuringPuzzle = currentQuestion ? getTuringPuzzleForLevel(currentQuestion, answers) : null;
  const isTuringQueryDisabled = Boolean(currentQuestion?.turingQueryDisabled);
  const activeTuringVerifiers = activeTuringPuzzle?.verifiers ?? [];
  const activePathLinePuzzlePath = useMemo(() => buildLinePuzzleSvgPath(activePathLinePuzzle?.points ?? []), [activePathLinePuzzle]);
  const activeBranchNodeMap = useMemo(
    () => (activeBranchLinePuzzle ? new Map(activeBranchLinePuzzle.nodes.map((node) => [node.id, node])) : null),
    [activeBranchLinePuzzle],
  );
  const activeBranchRestPointNodeIds = useMemo(
    () => new Set(activeBranchLinePuzzle?.restPoints?.map((restPoint) => restPoint.nodeId) ?? []),
    [activeBranchLinePuzzle],
  );
  const linePuzzleResumeNodeId =
    activeBranchLinePuzzle &&
    !linePuzzleDragging &&
    !linePuzzleSolved &&
    linePuzzleNodeTrail.length > 0 &&
    activeBranchRestPointNodeIds.has(linePuzzleNodeTrail[linePuzzleNodeTrail.length - 1])
      ? linePuzzleNodeTrail[linePuzzleNodeTrail.length - 1]
      : null;
  const activeLinePuzzleActionPoint = useMemo(() => {
    if (linePuzzleResumeNodeId && activeBranchNodeMap) {
      return activeBranchNodeMap.get(linePuzzleResumeNodeId) ?? null;
    }
    if (activeBranchLinePuzzle && activeBranchNodeMap) {
      return activeBranchNodeMap.get(activeBranchLinePuzzle.startNodeId) ?? null;
    }
    return activePathLinePuzzle?.points[0] ?? null;
  }, [activeBranchLinePuzzle, activeBranchNodeMap, activePathLinePuzzle, linePuzzleResumeNodeId]);
  const activeBranchEdgePaths = useMemo(() => {
    if (!activeBranchLinePuzzle || !activeBranchNodeMap) return [];
    return activeBranchLinePuzzle.edges.flatMap(([fromId, toId]) => {
      const fromNode = activeBranchNodeMap.get(fromId);
      const toNode = activeBranchNodeMap.get(toId);
      if (!fromNode || !toNode) return [];
      return [{ key: getLinePuzzleEdgeKey(fromId, toId), d: buildLinePuzzleSvgPath([fromNode, toNode]) }];
    });
  }, [activeBranchLinePuzzle, activeBranchNodeMap]);
  const activeLinePuzzleStartPoint = useMemo(() => {
    if (activeBranchLinePuzzle && activeBranchNodeMap) {
      return activeBranchNodeMap.get(activeBranchLinePuzzle.startNodeId) ?? null;
    }
    return activePathLinePuzzle?.points[0] ?? null;
  }, [activeBranchLinePuzzle, activeBranchNodeMap, activePathLinePuzzle]);
  const activeLinePuzzleEndPoint = useMemo(() => {
    if (activeBranchLinePuzzle && activeBranchNodeMap) {
      return activeBranchNodeMap.get(activeBranchLinePuzzle.endNodeId) ?? null;
    }
    return activePathLinePuzzle ? activePathLinePuzzle.points[activePathLinePuzzle.points.length - 1] ?? null : null;
  }, [activeBranchLinePuzzle, activeBranchNodeMap, activePathLinePuzzle]);
  const activeLinePuzzleHintPath = useMemo(() => {
    if (activePathLinePuzzle && activePathLinePuzzle.points.length >= 2) {
      return buildLinePuzzleSvgPath([activePathLinePuzzle.points[0], activePathLinePuzzle.points[1]]);
    }
    if (activeBranchLinePuzzle && activeBranchNodeMap) {
      const currentNodeId = linePuzzleResumeNodeId ?? activeBranchLinePuzzle.startNodeId;
      const currentNode = activeBranchNodeMap.get(currentNodeId);
      const previousNodeId = linePuzzleNodeTrail.length > 1 ? linePuzzleNodeTrail[linePuzzleNodeTrail.length - 2] : null;
      const nextEdge =
        activeBranchLinePuzzle.edges.find(
          ([fromId, toId]) =>
            (fromId === currentNodeId || toId === currentNodeId) &&
            (previousNodeId == null || (fromId !== previousNodeId && toId !== previousNodeId)),
        ) ??
        activeBranchLinePuzzle.edges.find(([fromId, toId]) => fromId === currentNodeId || toId === currentNodeId);
      if (!currentNode || !nextEdge) return "";
      const nextNodeId = nextEdge[0] === currentNodeId ? nextEdge[1] : nextEdge[0];
      const nextNode = activeBranchNodeMap.get(nextNodeId);
      if (!nextNode) return "";
      return buildLinePuzzleSvgPath([currentNode, nextNode]);
    }
    return "";
  }, [activeBranchLinePuzzle, activeBranchNodeMap, activePathLinePuzzle, linePuzzleNodeTrail, linePuzzleResumeNodeId]);
  const linePuzzleTraversalSummary = useMemo<BranchLinePuzzleTraversalSummary | null>(() => {
    if (!activeBranchLinePuzzle || !activeBranchNodeMap) return null;
    return getBranchLinePuzzleTraversalSummary(
      activeBranchLinePuzzle,
      activeBranchNodeMap,
      linePuzzleNodeTrail,
      linePuzzlePointerEdge,
      linePuzzleNodeTrail.length > 0 ? linePuzzleBaseNightMode : isNightMode,
      linePuzzleManualToggleNodeIndices,
    );
  }, [
    activeBranchLinePuzzle,
    activeBranchNodeMap,
    isNightMode,
    linePuzzleBaseNightMode,
    linePuzzleManualToggleNodeIndices,
    linePuzzleNodeTrail,
    linePuzzlePointerEdge,
  ]);
  const activeBranchProgressPath = useMemo(() => {
    if (!activeBranchLinePuzzle || !activeBranchNodeMap || linePuzzleNodeTrail.length === 0) return "";
    const points: Array<{ x: number; y: number }> = linePuzzleNodeTrail
      .map((nodeId) => activeBranchNodeMap.get(nodeId))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    if (linePuzzlePointerPoint) {
      points.push(linePuzzlePointerPoint);
    }
    return buildLinePuzzleSvgPath(points);
  }, [activeBranchLinePuzzle, activeBranchNodeMap, linePuzzleNodeTrail, linePuzzlePointerPoint]);
  const linePuzzleHitRequiredDots = linePuzzleTraversalSummary?.requiredBlackHitIds ?? [];
  const linePuzzleHitForbiddenDots = [
    ...(linePuzzleTraversalSummary?.requiredWhiteHitIds ?? []),
    ...(linePuzzleTraversalSummary?.forbiddenWhiteHitIds ?? []),
  ];
  const linePuzzleHitInvertedBlackDots = linePuzzleTraversalSummary?.forbiddenBlackHitIds ?? [];
  const linePuzzleHitToggleDots = linePuzzleTraversalSummary?.toggleHitIds ?? [];
  const linePuzzleIsToggled = linePuzzleTraversalSummary?.isToggled ?? false;
  const linePuzzleHasForbiddenHit = linePuzzleHitForbiddenDots.length > 0;
  const linePuzzleRegionSummary = useMemo<BranchLinePuzzleRegionSummary | null>(() => {
    if (!activeBranchLinePuzzle) return null;
    return getBranchLinePuzzleRegionSummary(activeBranchLinePuzzle, linePuzzleNodeTrail, linePuzzleIsToggled);
  }, [activeBranchLinePuzzle, linePuzzleIsToggled, linePuzzleNodeTrail]);
  const linePuzzleRegionsBalanced = linePuzzleRegionSummary?.isBalanced ?? true;
  const linePuzzleEndedAtEndNode =
    Boolean(activeBranchLinePuzzle) && linePuzzleNodeTrail[linePuzzleNodeTrail.length - 1] === activeBranchLinePuzzle?.endNodeId;
  const remainingTuringQueries = Math.max(0, 2 - turingQueryLog.length);
  const currentProposalRecord = turingQueryLog.find((record) => record.proposal === turingProposal) ?? null;
  const currentProposalAskedCount = currentProposalRecord?.results.length ?? 0;
  const copyContent = useMemo(() => {
    const userLines: string[] = [];
    const modelLines: string[] = [];
    const visibleLevels = playableLevels.slice(0, Math.min(currentLevel + 1, playableLevels.length));

    visibleLevels.forEach((chatLevel) => {
      if (chatLevel.id === 12 && jsonRuleRemoved) {
        const text = "好了，后面不用 JSON 回答了";
        userLines.push(text);
      }

      userLines.push(chatLevel.question);

      attempts
        .filter((attempt) => attempt.levelId === chatLevel.id)
        .forEach((attempt) => {
          modelLines.push(attempt.displayedText);
          if (!attempt.ok) {
            const responseText = attempt.responseText ?? "不对，你再想想。";
            userLines.push(responseText);
          }
        });
    });

    return {
      user: userLines.join("\n"),
      model: modelLines.join("\n"),
    };
  }, [attempts, currentLevel, jsonRuleRemoved]);

  useEffect(() => {
    linePuzzleNodeTrailRef.current = linePuzzleNodeTrail;
  }, [linePuzzleNodeTrail]);

  useEffect(() => {
    linePuzzlePointerEdgeRef.current = linePuzzlePointerEdge;
  }, [linePuzzlePointerEdge]);

  useEffect(() => {
    linePuzzleBaseNightModeRef.current = linePuzzleBaseNightMode;
  }, [linePuzzleBaseNightMode]);

  useEffect(() => {
    linePuzzleManualToggleNodeIndicesRef.current = linePuzzleManualToggleNodeIndices;
  }, [linePuzzleManualToggleNodeIndices]);

  useEffect(() => {
    if (!isHandleLevel) return;

    let active = true;

    onRefreshHandleAnswer().catch(() => {
      if (active) {
        // 本地随机题库理论上不会失败，这里保留兜底。
      }
    });

    return () => {
      active = false;
    };
  }, [isHandleLevel, onRefreshHandleAnswer]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSystemNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentLevel + 1 === 16) {
      setFavoriteColorHex("#DD0000");
    }
  }, [currentLevel]);

  useEffect(() => {
    setSelectedUploadFile(null);
    setSelectedUploadPreviewUrl(null);
    setPendingUploadPreviewUrl(null);
    setPendingUploadLevelId(null);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }, [currentLevel]);

  useEffect(() => {
    setTuringProposal("");
    setTuringQueryLog([]);
    setTuringFeedback(null);
    setSelectedTuringVerifierId(activeTuringVerifiers[0]?.id ?? null);
  }, [currentLevel, activeTuringPuzzle?.id]);

    useEffect(() => {
      if (linePuzzleTimeoutRef.current) {
        window.clearTimeout(linePuzzleTimeoutRef.current);
        linePuzzleTimeoutRef.current = null;
      }
      if (linePuzzleFailureTimeoutRef.current) {
        window.clearTimeout(linePuzzleFailureTimeoutRef.current);
        linePuzzleFailureTimeoutRef.current = null;
      }
      linePuzzleCompletingRef.current = false;
      setLinePuzzleProgress(0);
      setLinePuzzleDragging(false);
      setLinePuzzleSolved(false);
      setLinePuzzleStartHovered(false);
      setLinePuzzleNodeTrail([]);
      linePuzzleNodeTrailRef.current = [];
      setLinePuzzlePointerPoint(null);
      setLinePuzzlePointerEdge(null);
      linePuzzlePointerEdgeRef.current = null;
      setLinePuzzleBaseNightMode(false);
      linePuzzleBaseNightModeRef.current = false;
      setLinePuzzleManualToggleNodeIndices([]);
      linePuzzleManualToggleNodeIndicesRef.current = [];
      setLinePuzzleFailedDotIds([]);
      setLinePuzzleFailedCellDotIds([]);
    }, [currentLevel, activeLinePuzzle?.id]);

  useEffect(() => {
    if (!selectedUploadFile || !selectedUploadFile.type.startsWith("image/")) {
      setSelectedUploadPreviewUrl(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSelectedUploadPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(selectedUploadFile);
  }, [selectedUploadFile]);

  useEffect(() => {
    if (!pendingUploadPreviewUrl || pendingUploadLevelId == null) return;

    const latestAttempt = [...attempts]
      .reverse()
      .find((attempt) => attempt.levelId === pendingUploadLevelId && attempt.ok);

    if (!latestAttempt) return;

    setUploadAttemptPreviews((current) => ({ ...current, [latestAttempt.createdAt]: pendingUploadPreviewUrl }));
    setPendingUploadPreviewUrl(null);
    setPendingUploadLevelId(null);
  }, [attempts, pendingUploadLevelId, pendingUploadPreviewUrl]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [currentLevel, attempts.length, complete]);

  useEffect(() => {
    setLinePuzzleFailedDotIds([]);
    setLinePuzzleFailedCellDotIds([]);
    if (linePuzzleFailureTimeoutRef.current) {
      window.clearTimeout(linePuzzleFailureTimeoutRef.current);
      linePuzzleFailureTimeoutRef.current = null;
    }
  }, [isNightMode]);

  useEffect(() => {
    const targetWindow = window as Window & typeof globalThis & { unlockSendKey?: () => string };
    if (!isConsoleLockedLevel) {
      delete targetWindow.unlockSendKey;
      return;
    }

    targetWindow.unlockSendKey = () => {
      onConsoleSendUnlock(true);
      return "发送键已经解锁。";
    };
    console.info('发送键像是被锁住了。试试在这里输入 unlockSendKey()');

    return () => {
      delete targetWindow.unlockSendKey;
    };
  }, [isConsoleLockedLevel, onConsoleSendUnlock]);

  useEffect(() => {
    if (currentQuestion?.id === 41) {
      console.log(HIDDEN_PASSAGE_TEXT);
    }
  }, [currentLevel, currentQuestion?.id]);

  useEffect(() => {
    if (isConsoleSendLocked) return;
    if (lockedSendReplyIntervalRef.current) {
      window.clearInterval(lockedSendReplyIntervalRef.current);
      lockedSendReplyIntervalRef.current = null;
    }
    lockedSendAttemptRef.current = "";
  }, [isConsoleSendLocked, currentLevel]);

  useEffect(
    () => () => {
      if (lockedSendReplyIntervalRef.current) {
        window.clearInterval(lockedSendReplyIntervalRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeBranchLinePuzzle || !linePuzzleTraversalSummary || !linePuzzleRegionSummary || !linePuzzleEndedAtEndNode || linePuzzleSolved) {
      return;
    }
    if (canCompleteBranchLinePuzzle(activeBranchLinePuzzle, linePuzzleTraversalSummary, linePuzzleRegionSummary, true)) {
      completeLinePuzzle();
    }
  }, [
    activeBranchLinePuzzle,
    linePuzzleEndedAtEndNode,
    linePuzzleRegionSummary,
    linePuzzleSolved,
    linePuzzleTraversalSummary,
  ]);

  function submitCurrentAnswer() {
    const rawInput = selectedUploadFile && currentQuestion ? buildUploadedFileAnswer(selectedUploadFile, currentQuestion) : input;
    if (rawInput.trim().length === 0) return;
    if (isConsoleSendLocked) {
      const lockedAttempt = applyPermanentAppend(rawInput, permanentAppendPrefix, permanentAppendSuffix);
      lockedSendAttemptRef.current = lockedAttempt;
      onSubmit(lockedAttempt);
      if (lockedSendReplyIntervalRef.current) {
        window.clearInterval(lockedSendReplyIntervalRef.current);
      }
      lockedSendReplyIntervalRef.current = window.setInterval(() => {
        if (!lockedSendAttemptRef.current.trim()) return;
        onSubmit(lockedSendAttemptRef.current);
      }, LOCKED_SEND_REPLY_INTERVAL_MS);
      return;
    }
    if (inputDisabled) return;
    if (currentQuestion?.uploadAccept && !selectedUploadFile) return;

    const result = onSubmit(applyPermanentAppend(rawInput, permanentAppendPrefix, permanentAppendSuffix));
    setInput("");
    if (result.ok) {
      if (selectedUploadPreviewUrl && currentQuestion?.uploadAccept) {
        setPendingUploadPreviewUrl(selectedUploadPreviewUrl);
        setPendingUploadLevelId(currentQuestion.id);
      }
      setSelectedUploadFile(null);
      setSelectedUploadPreviewUrl(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitCurrentAnswer();
  }

  function handleKeyboardChoice(choice: string) {
    if (!hasKeyboardChoices) return;
    setAppendToolOpen(false);
    setInput("");
    onCompleteLevel(choice, choice);
  }

  function handleHandleBoardSolve(answer: string) {
    const result = onSubmit(applyPermanentAppend(`${answer}喵`, permanentAppendPrefix, permanentAppendSuffix));
    if (result.ok) {
      return null;
    }
    return "message" in result ? result.message : "提交失败。";
  }

  function handleAnswerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitCurrentAnswer();
  }

  function getBubbleTextStyle(text: string): CSSProperties | undefined {
    const matchedColor = extractLeadingHexColor(text);
    if (!matchedColor) return undefined;
    return { color: matchedColor };
  }

  function getLightPuzzleClue(levelId: number) {
    if (currentLevel !== 19 || !isNightMode) return null;
    return LIGHT_PUZZLE_CLUES[levelId] ?? null;
  }

  function handleTuringVerify() {
    if (!activeTuringPuzzle) return;

    if (!/^[1-5]{3}$/.test(turingProposal)) {
      setTuringFeedback("提案得是三位数字，而且每位都要在 1 到 5 之间。");
      return;
    }

    if (!selectedTuringVerifierId) {
      setTuringFeedback("先选 1 台验证器，再拿这个提案去问。");
      return;
    }

    if (!currentProposalRecord && turingQueryLog.length >= 2) {
      setTuringFeedback("这题最多只能问两个提案，已经问满了。");
      return;
    }

    if (currentProposalRecord) {
      const askedVerifierIds = currentProposalRecord.results.map((result) => result.verifierId);
      if (askedVerifierIds.includes(selectedTuringVerifierId)) {
        setTuringFeedback("同一个提案不能重复问已经问过的验证器。");
        return;
      }

      if (currentProposalRecord.results.length + 1 > 3) {
        setTuringFeedback("同一个提案累计最多只能问 3 台验证器。");
        return;
      }
    }

    const results = activeTuringVerifiers
      .filter((verifier) => verifier.id === selectedTuringVerifierId)
      .map((verifier) => ({
        verifierId: verifier.id,
        verifierLabel: verifier.label,
        passed: verifier.evaluate(turingProposal),
      }));

      setTuringFeedback(`${turingProposal} 已送进图灵机。这次问了 ${results.map((result) => result.verifierLabel).join("、")}；结果里的“满足规则”表示这个提案符合那台验证器背后的隐藏规则，“不满足规则”表示不符合。`);
      const nextAskedCount = currentProposalAskedCount + results.length;
    setTuringQueryLog((current) => {
      const existingIndex = current.findIndex((record) => record.proposal === turingProposal);
      if (existingIndex >= 0) {
        const existingRecord = current[existingIndex];
        const updatedRecord = { ...existingRecord, results: [...existingRecord.results, ...results] };
        return [updatedRecord, ...current.filter((_, index) => index !== existingIndex)];
      }
      return [{ proposal: turingProposal, results }, ...current].slice(0, 2);
    });
      if (nextAskedCount >= 3) {
        setTuringProposal("");
      }
  }

  function handleTuringProposalKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    handleTuringVerify();
  }

  function selectTuringVerifier(verifierId: string) {
    setTuringFeedback(null);
    setSelectedTuringVerifierId(verifierId);
  }

    function getLinePuzzleBoardGeometry(puzzle: LinePuzzle | null = activeLinePuzzle) {
      const rect = linePuzzleBoardRef.current?.getBoundingClientRect();
      if (!rect || !puzzle) return null;
      return { rect, viewBox: puzzle.viewBox };
    }

    function getLinePuzzleScreenPoint(point: { x: number; y: number }, puzzle: LinePuzzle | null = activeLinePuzzle): ScreenPoint | null {
      const geometry = getLinePuzzleBoardGeometry(puzzle);
      if (!geometry) return null;
      return {
        x: geometry.rect.left + geometry.rect.width * ((point.x - geometry.viewBox.minX) / geometry.viewBox.width),
        y: geometry.rect.top + geometry.rect.height * ((point.y - geometry.viewBox.minY) / geometry.viewBox.height),
      };
    }

    function getPathLinePuzzleGeometry() {
      if (!activePathLinePuzzle) return null;
      const boardGeometry = getLinePuzzleBoardGeometry(activePathLinePuzzle);
      if (!boardGeometry) return null;
      const points = activePathLinePuzzle.points.map((point) => ({
        x: boardGeometry.rect.left + boardGeometry.rect.width * ((point.x - boardGeometry.viewBox.minX) / boardGeometry.viewBox.width),
        y: boardGeometry.rect.top + boardGeometry.rect.height * ((point.y - boardGeometry.viewBox.minY) / boardGeometry.viewBox.height),
      }));
      const totalLength = points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
      return { points, totalLength };
    }

    function getPathLinePuzzleProgress(clientX: number, clientY: number) {
      const geometry = getPathLinePuzzleGeometry();
      if (!geometry) {
        return { progress: 0, distance: Number.POSITIVE_INFINITY };
      }

      let traversedLength = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestProgress = 0;

      for (let index = 1; index < geometry.points.length; index += 1) {
        const start = geometry.points[index - 1];
        const end = geometry.points[index];
        const segmentX = end.x - start.x;
        const segmentY = end.y - start.y;
        const segmentLength = Math.hypot(segmentX, segmentY);

        if (segmentLength === 0) continue;

        const projectionRatio = Math.max(
          0,
          Math.min(1, ((clientX - start.x) * segmentX + (clientY - start.y) * segmentY) / (segmentLength * segmentLength)),
        );
        const projectedX = start.x + segmentX * projectionRatio;
        const projectedY = start.y + segmentY * projectionRatio;
        const distance = Math.hypot(clientX - projectedX, clientY - projectedY);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestProgress = (traversedLength + segmentLength * projectionRatio) / Math.max(geometry.totalLength, 1);
        }

        traversedLength += segmentLength;
      }

      return { progress: Math.max(0, Math.min(1, bestProgress)), distance: bestDistance };
    }

    function getBranchLinePuzzleCandidate(clientX: number, clientY: number) {
      const currentTrail = linePuzzleNodeTrailRef.current;
      if (!activeBranchLinePuzzle || !activeBranchNodeMap || currentTrail.length === 0) return null;
      const currentNodeId = currentTrail[currentTrail.length - 1];
      const currentNode = activeBranchNodeMap.get(currentNodeId);
      if (!currentNode) return null;

      let bestCandidate: BranchLinePuzzleCandidate | null = null;

      for (const [fromId, toId] of activeBranchLinePuzzle.edges) {
        if (fromId !== currentNodeId && toId !== currentNodeId) continue;
        const neighborId = fromId === currentNodeId ? toId : fromId;
        const neighborNode = activeBranchNodeMap.get(neighborId);
        if (!neighborNode) continue;

        const startScreenPoint = getLinePuzzleScreenPoint(currentNode, activeBranchLinePuzzle);
        const endScreenPoint = getLinePuzzleScreenPoint(neighborNode, activeBranchLinePuzzle);
        if (!startScreenPoint || !endScreenPoint) continue;

        const segmentX = endScreenPoint.x - startScreenPoint.x;
        const segmentY = endScreenPoint.y - startScreenPoint.y;
        const segmentLength = Math.hypot(segmentX, segmentY);
        if (segmentLength === 0) continue;

        const ratio = Math.max(
          0,
          Math.min(1, ((clientX - startScreenPoint.x) * segmentX + (clientY - startScreenPoint.y) * segmentY) / (segmentLength * segmentLength)),
        );
        const projectedScreenX = startScreenPoint.x + segmentX * ratio;
        const projectedScreenY = startScreenPoint.y + segmentY * ratio;
        const distance = Math.hypot(clientX - projectedScreenX, clientY - projectedScreenY);

        if (!bestCandidate || distance < bestCandidate.distance) {
          bestCandidate = {
            neighborId,
            distance,
            ratio,
            distanceToNeighborNode: Math.hypot(clientX - endScreenPoint.x, clientY - endScreenPoint.y),
            projectedPuzzlePoint: {
              x: currentNode.x + (neighborNode.x - currentNode.x) * ratio,
              y: currentNode.y + (neighborNode.y - currentNode.y) * ratio,
            },
          };
        }
      }

      return bestCandidate;
    }

    function resetLinePuzzleInteraction() {
      setLinePuzzleDragging(false);
      setLinePuzzleStartHovered(false);
      setLinePuzzleProgress(0);
      setLinePuzzleNodeTrail([]);
      linePuzzleNodeTrailRef.current = [];
      setLinePuzzlePointerPoint(null);
      setLinePuzzlePointerEdge(null);
      linePuzzlePointerEdgeRef.current = null;
      setLinePuzzleBaseNightMode(false);
      linePuzzleBaseNightModeRef.current = false;
      setLinePuzzleManualToggleNodeIndices([]);
      linePuzzleManualToggleNodeIndicesRef.current = [];
    }

    function triggerLinePuzzleFailureHighlight(failedDotIds: string[], failedCellDotIds: string[]) {
      if (linePuzzleFailureTimeoutRef.current) {
        window.clearTimeout(linePuzzleFailureTimeoutRef.current);
        linePuzzleFailureTimeoutRef.current = null;
      }

      setLinePuzzleFailedDotIds(failedDotIds);
      setLinePuzzleFailedCellDotIds(failedCellDotIds);

      if (failedDotIds.length === 0 && failedCellDotIds.length === 0) {
        return;
      }

      linePuzzleFailureTimeoutRef.current = window.setTimeout(() => {
        setLinePuzzleFailedDotIds([]);
        setLinePuzzleFailedCellDotIds([]);
        linePuzzleFailureTimeoutRef.current = null;
      }, 1100);
    }

    function failBranchLinePuzzleAttempt(failedDotIds: string[], failedCellDotIds: string[]) {
      triggerLinePuzzleFailureHighlight(failedDotIds, failedCellDotIds);
      resetLinePuzzleInteraction();
    }

    function getBranchLinePuzzleCandidateFromPointerEdge(pointerEdge: LinePuzzlePointerEdgeState): BranchLinePuzzleCandidate | null {
      if (!activeBranchLinePuzzle || !activeBranchNodeMap) {
        return null;
      }
      const fromNode = activeBranchNodeMap.get(pointerEdge.fromId);
      const toNode = activeBranchNodeMap.get(pointerEdge.toId);
      if (!fromNode || !toNode) {
        return null;
      }
      return {
        neighborId: pointerEdge.toId,
        distance: 0,
        ratio: pointerEdge.ratio,
        distanceToNeighborNode: (1 - pointerEdge.ratio) * Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y),
        projectedPuzzlePoint: {
          x: fromNode.x + (toNode.x - fromNode.x) * pointerEdge.ratio,
          y: fromNode.y + (toNode.y - fromNode.y) * pointerEdge.ratio,
        },
      };
    }

    function getBranchLinePuzzleEndCandidate(clientX: number, clientY: number): BranchLinePuzzleCandidate | null {
      const currentTrail = linePuzzleNodeTrailRef.current;
      if (!activeBranchLinePuzzle || !activeBranchNodeMap || currentTrail.length === 0) {
        return null;
      }

      const currentNodeId = currentTrail[currentTrail.length - 1];
      const hasDirectEndEdge = activeBranchLinePuzzle.edges.some(
        ([fromId, toId]) =>
          (fromId === currentNodeId && toId === activeBranchLinePuzzle.endNodeId) ||
          (toId === currentNodeId && fromId === activeBranchLinePuzzle.endNodeId),
      );
      if (!hasDirectEndEdge) {
        return null;
      }

      const currentNode = activeBranchNodeMap.get(currentNodeId);
      const endNode = activeBranchNodeMap.get(activeBranchLinePuzzle.endNodeId);
      const endScreenPoint = endNode ? getLinePuzzleScreenPoint(endNode, activeBranchLinePuzzle) : null;
      if (!currentNode || !endNode || !endScreenPoint) {
        return null;
      }

      const distanceToNeighborNode = Math.hypot(clientX - endScreenPoint.x, clientY - endScreenPoint.y);
      if (distanceToNeighborNode > BRANCH_LINE_PUZZLE_RELEASE_NODE_TOLERANCE) {
        return null;
      }

      return {
        neighborId: activeBranchLinePuzzle.endNodeId,
        distance: 0,
        ratio: 1,
        distanceToNeighborNode,
        projectedPuzzlePoint: {
          x: endNode.x,
          y: endNode.y,
        },
      };
    }

    function commitBranchLinePuzzleCandidate(candidate: BranchLinePuzzleCandidate) {
      if (!activeBranchLinePuzzle || !activeBranchNodeMap) {
        return false;
      }

      const currentTrail = linePuzzleNodeTrailRef.current;
      const previousNodeId = currentTrail.length > 1 ? currentTrail[currentTrail.length - 2] : null;
      if (candidate.neighborId === previousNodeId) {
        const nextTrail = currentTrail.slice(0, -1);
        setLinePuzzleNodeTrail(nextTrail);
        linePuzzleNodeTrailRef.current = nextTrail;
        setLinePuzzlePointerPoint(null);
        setLinePuzzlePointerEdge(null);
        linePuzzlePointerEdgeRef.current = null;
        return true;
      }

      if (currentTrail.includes(candidate.neighborId)) {
        return true;
      }

      const nextTrail = [...currentTrail, candidate.neighborId];
      setLinePuzzleNodeTrail(nextTrail);
      linePuzzleNodeTrailRef.current = nextTrail;
      setLinePuzzlePointerPoint(null);
      setLinePuzzlePointerEdge(null);
      linePuzzlePointerEdgeRef.current = null;
      const nextSummary = getBranchLinePuzzleTraversalSummary(
        activeBranchLinePuzzle,
        activeBranchNodeMap,
        nextTrail,
        null,
        linePuzzleBaseNightModeRef.current,
        linePuzzleManualToggleNodeIndicesRef.current,
      );
      const nextRegionSummary = getBranchLinePuzzleRegionSummary(activeBranchLinePuzzle, nextTrail, nextSummary.isToggled);
      if (canCompleteBranchLinePuzzle(activeBranchLinePuzzle, nextSummary, nextRegionSummary, candidate.neighborId === activeBranchLinePuzzle.endNodeId)) {
        completeLinePuzzle();
      } else if (candidate.neighborId === activeBranchLinePuzzle.endNodeId) {
        failBranchLinePuzzleAttempt(
          getBranchLinePuzzleMissingBlackDotIds(activeBranchLinePuzzle, nextSummary),
          nextRegionSummary.unbalancedCellDotIds,
        );
      }
      return true;
    }

    function isPointerNearLinePuzzleActionPoint(clientX: number, clientY: number) {
      if (!activeLinePuzzleActionPoint) return false;
      const start = getLinePuzzleScreenPoint(activeLinePuzzleActionPoint);
      if (!start) return false;
      return Math.hypot(clientX - start.x, clientY - start.y) <= 26;
    }

    function updateLinePuzzleHover(clientX: number, clientY: number) {
      if (!activeLinePuzzle || linePuzzleSolved || linePuzzleDragging) {
        setLinePuzzleStartHovered(false);
        return;
      }
      setLinePuzzleStartHovered(isPointerNearLinePuzzleActionPoint(clientX, clientY));
    }

    function handleNightModeToggle(nextNightMode: boolean) {
      const canApplyLinePuzzleToggle =
        activeBranchLinePuzzle &&
        !linePuzzleCompletingRef.current &&
        !linePuzzleSolved &&
        !linePuzzleDragging &&
        linePuzzleNodeTrailRef.current.length > 0;

      if (canApplyLinePuzzleToggle) {
        const nextToggleNodeIndices = [...linePuzzleManualToggleNodeIndicesRef.current, linePuzzleNodeTrailRef.current.length - 1];
        setLinePuzzleManualToggleNodeIndices(nextToggleNodeIndices);
        linePuzzleManualToggleNodeIndicesRef.current = nextToggleNodeIndices;
      }

      onNightModeChange(nextNightMode);
    }

    function completeLinePuzzle() {
      if (!activeLinePuzzle || linePuzzleCompletingRef.current) return;
      linePuzzleCompletingRef.current = true;
      setLinePuzzleDragging(false);
      setLinePuzzleStartHovered(false);
      setLinePuzzleSolved(true);
      setLinePuzzleProgress(1);
      setLinePuzzlePointerPoint(null);
      setLinePuzzlePointerEdge(null);
      linePuzzleTimeoutRef.current = window.setTimeout(() => {
        onCompleteLevel(activeLinePuzzle.solvedText);
      }, 220);
    }

    function handleLinePuzzlePointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!activeLinePuzzle || linePuzzleSolved) return;
      setLinePuzzleFailedDotIds([]);
      setLinePuzzleFailedCellDotIds([]);
      if (linePuzzleFailureTimeoutRef.current) {
        window.clearTimeout(linePuzzleFailureTimeoutRef.current);
        linePuzzleFailureTimeoutRef.current = null;
      }
      const start = activeLinePuzzleActionPoint ? getLinePuzzleScreenPoint(activeLinePuzzleActionPoint) : null;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 28) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setLinePuzzleDragging(true);
      setLinePuzzleStartHovered(true);
      if (activeBranchLinePuzzle) {
        if (linePuzzleResumeNodeId && activeLinePuzzleActionPoint) {
          setLinePuzzlePointerPoint(activeLinePuzzleActionPoint);
        } else {
          setLinePuzzleNodeTrail([activeBranchLinePuzzle.startNodeId]);
          linePuzzleNodeTrailRef.current = [activeBranchLinePuzzle.startNodeId];
          setLinePuzzleBaseNightMode(isNightMode);
          linePuzzleBaseNightModeRef.current = isNightMode;
          setLinePuzzleManualToggleNodeIndices([]);
          linePuzzleManualToggleNodeIndicesRef.current = [];
          setLinePuzzlePointerPoint(activeLinePuzzleStartPoint);
        }
        setLinePuzzlePointerEdge(null);
        linePuzzlePointerEdgeRef.current = null;
      } else {
        setLinePuzzleProgress(0);
      }
    }

    function handleLinePuzzlePointerMove(event: PointerEvent<HTMLDivElement>) {
      if (!linePuzzleDragging) {
        updateLinePuzzleHover(event.clientX, event.clientY);
        return;
      }
      if (linePuzzleSolved || linePuzzleCompletingRef.current) return;
      if (activeBranchLinePuzzle) {
        const candidate = getBranchLinePuzzleCandidate(event.clientX, event.clientY);
        if (!candidate || candidate.distance > BRANCH_LINE_PUZZLE_EDGE_TOLERANCE) {
          setLinePuzzlePointerPoint(null);
          setLinePuzzlePointerEdge(null);
          return;
        }

        if (shouldSnapBranchLinePuzzleCandidate(candidate)) {
          commitBranchLinePuzzleCandidate(candidate);
          return;
        }

        setLinePuzzlePointerPoint(candidate.projectedPuzzlePoint);
        setLinePuzzlePointerEdge({
          fromId: linePuzzleNodeTrailRef.current[linePuzzleNodeTrailRef.current.length - 1],
          toId: candidate.neighborId,
          ratio: candidate.ratio,
        });
        linePuzzlePointerEdgeRef.current = {
          fromId: linePuzzleNodeTrailRef.current[linePuzzleNodeTrailRef.current.length - 1],
          toId: candidate.neighborId,
          ratio: candidate.ratio,
        };
        return;
      }

      const nextState = getPathLinePuzzleProgress(event.clientX, event.clientY);
      if (nextState.distance > 36) {
        return;
      }
      const nextProgress = Math.max(linePuzzleProgress, nextState.progress);
      setLinePuzzleProgress(nextProgress);
      if (nextProgress >= 0.98) {
        completeLinePuzzle();
      }
    }

    function handleLinePuzzlePointerUp(event: PointerEvent<HTMLDivElement>) {
      if (!linePuzzleDragging || linePuzzleCompletingRef.current) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      if (activeBranchLinePuzzle) {
        const candidate = pickBranchLinePuzzleReleaseCandidate(
          getBranchLinePuzzleEndCandidate(event.clientX, event.clientY),
          linePuzzlePointerEdgeRef.current ? getBranchLinePuzzleCandidateFromPointerEdge(linePuzzlePointerEdgeRef.current) : null,
          getBranchLinePuzzleCandidate(event.clientX, event.clientY),
        );
        if (candidate && shouldSnapBranchLinePuzzleCandidate(candidate, true)) {
          commitBranchLinePuzzleCandidate(candidate);
          if (!linePuzzleCompletingRef.current) {
            const currentNodeId = linePuzzleNodeTrailRef.current[linePuzzleNodeTrailRef.current.length - 1];
            if (currentNodeId && activeBranchRestPointNodeIds.has(currentNodeId)) {
              setLinePuzzleDragging(false);
              setLinePuzzlePointerPoint(null);
              setLinePuzzlePointerEdge(null);
              linePuzzlePointerEdgeRef.current = null;
              return;
            }
            resetLinePuzzleInteraction();
          }
          return;
        }
        const currentNodeId = linePuzzleNodeTrailRef.current[linePuzzleNodeTrailRef.current.length - 1];
        if (currentNodeId && activeBranchRestPointNodeIds.has(currentNodeId)) {
          setLinePuzzleDragging(false);
          setLinePuzzlePointerPoint(null);
          setLinePuzzlePointerEdge(null);
          linePuzzlePointerEdgeRef.current = null;
          return;
        }
        resetLinePuzzleInteraction();
        return;
      }
      const nextState = getPathLinePuzzleProgress(event.clientX, event.clientY);
      if (nextState.distance > 36) {
        resetLinePuzzleInteraction();
        return;
      }
      const nextProgress = Math.max(linePuzzleProgress, nextState.progress);
      setLinePuzzleProgress(nextProgress);
      if (nextProgress >= 0.98 || linePuzzleSolved) {
        completeLinePuzzle();
        return;
      }
      resetLinePuzzleInteraction();
    }

    function handleLinePuzzlePointerLeave() {
      if (linePuzzleDragging) return;
      setLinePuzzleStartHovered(false);
    }

  return (
    <main className={`flex h-screen flex-col text-zinc-900 transition-[background-color,padding] duration-700 ease-in-out ${isNightMode ? "bg-black" : "bg-[#f7f8fb]"} ${shouldShowTools ? "pl-14" : ""}`}>
      {shouldShowTools && (
        <ToolSidebar
          isNightMode={isNightMode}
          modelTranscript={copyContent.model}
          temperature={temperature}
          userTranscript={copyContent.user}
          onTemperatureChange={onTemperatureChange}
        />
      )}
      <header
        className={`flex h-16 shrink-0 items-center justify-between border-b px-5 backdrop-blur transition-[background-color,border-color] duration-700 ease-in-out ${
          isNightMode ? "border-black bg-black" : "border-zinc-200/80 bg-white/85"
        }`}
      >
        <div className={`flex items-center gap-3 rounded-full px-3 py-2 transition-colors duration-700 ease-in-out ${isNightMode ? "bg-black" : ""}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold">别问模型</h1>
            <p className="text-xs text-zinc-500">
              第 {String(Math.min(currentLevel + 1, playableLevels.length)).padStart(2, "0")} / {playableLevels.length} 题
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-[background-color,border-color,color,transform,box-shadow] duration-500 ease-out hover:scale-105 active:scale-95 ${
              isNightMode
                ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500 hover:text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950"
            }`}
            type="button"
            aria-label="切换黑夜模式"
            onClick={() => handleNightModeToggle(!isNightMode)}
          >
            <span className={`transition duration-500 ease-out ${isNightMode ? "rotate-180 scale-110" : "rotate-0 scale-100"}`}>
              {isNightMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </span>
          </button>
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-sm transition-[background-color,border-color,color,box-shadow] duration-500 ease-in-out ${
              isNightMode
                ? "border-zinc-600 bg-zinc-900 text-zinc-100 ring-1 ring-zinc-700/70"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            <button
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                isNightMode ? "text-zinc-200 hover:bg-zinc-800 hover:text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
              type="button"
              aria-label="调整游戏时间"
              onClick={() => {
                timeInputRef.current?.showPicker?.();
                timeInputRef.current?.focus();
              }}
            >
              <Clock3 className="h-3.5 w-3.5" />
            </button>
            <input
              ref={timeInputRef}
              className={`w-[4.8rem] cursor-pointer bg-transparent font-mono text-sm font-semibold outline-none ${isNightMode ? "text-zinc-50 [color-scheme:dark]" : "text-zinc-950 [color-scheme:light]"}`}
              aria-label="游戏时间"
              type="time"
              value={displayedClock}
              onChange={(event) => onTimeOverrideChange(event.target.value || null)}
            />
          </div>
          <button
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition-[background-color,border-color,color,transform] duration-500 ease-in-out hover:scale-[1.02] active:scale-95 ${
              isNightMode ? "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950"
            }`}
            type="button"
            onClick={onReset}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            重置
          </button>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          {playableLevels.slice(0, Math.min(currentLevel + 1, playableLevels.length)).map((chatLevel, index, visibleLevels) => {
            const levelAttempts = attempts.filter((attempt) => attempt.levelId === chatLevel.id);
            const shouldShowCurrentQuestion = chatLevel.id === currentLevel + 1 && !complete;
            const previousVisibleLevel = index > 0 ? visibleLevels[index - 1] : null;
            const hideQuestionBubble = Boolean(chatLevel.linePuzzle && previousVisibleLevel?.linePuzzle);

            if (levelAttempts.length === 0 && !shouldShowCurrentQuestion) return null;

            return (
              <div key={chatLevel.id} className="space-y-4">
                {chatLevel.id === 12 && jsonRuleRemoved && <MessageBubble align="left" isNightMode={isNightMode} label="用户" text="好了，后面不用 JSON 回答了" />}
                {!hideQuestionBubble && (
                  <MessageBubble
                    align="left"
                    animate={shouldShowCurrentQuestion && chatLevel.questionFormat !== "markdown"}
                    isNightMode={isNightMode}
                    copyText={
                      chatLevel.questionCopyText
                        ? chatLevel.questionCopyText
                        : chatLevel.id === 16
                        ? `${favoriteColorDisplay} ${chatLevel.question}`
                        : chatLevel.questionColor
                          ? `${chatLevel.questionColor} ${chatLevel.question}`
                          : undefined
                    }
                    inlineAccessory={
                      chatLevel.id === 16 ? (
                        <label
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-2 py-1.5 text-xs shadow-sm transition ${
                            isNightMode
                              ? "border-black bg-black text-black hover:border-black"
                              : "border-rose-200/80 bg-gradient-to-r from-rose-50 via-white to-orange-50 text-zinc-600 hover:border-rose-300 hover:shadow"
                          }`}
                        >
                          <span className={`relative flex h-6 w-6 items-center justify-center rounded-full ${isNightMode ? "bg-black ring-1 ring-black" : "bg-white ring-1 ring-zinc-200"}`}>
                            <span
                              className="h-4 w-4 rounded-full border border-white shadow-sm"
                              style={{ backgroundColor: favoriteColorPreview, borderColor: isNightMode ? "#27272a" : undefined }}
                            />
                            <input
                              className="absolute inset-0 cursor-pointer opacity-0"
                              type="color"
                              value={favoriteColorPreview}
                              aria-label="选择颜色"
                              onChange={(event) => setFavoriteColorHex(event.target.value.toUpperCase())}
                            />
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[11px] ring-1 ${isNightMode ? "bg-black ring-black" : "bg-white/90 ring-rose-100"}`}
                            style={{ color: favoriteColorPreview }}
                          >
                            {favoriteColorDisplay}
                          </span>
                        </label>
                      ) : chatLevel.captchaText ? (
                        <span
                          className={`relative inline-flex h-10 items-center overflow-hidden rounded-xl border px-3 shadow-sm ring-1 ${
                            isNightMode
                              ? "border-black bg-black ring-black"
                              : "border-blue-200/90 bg-[linear-gradient(135deg,#f8fbff_0%,#eef5ff_45%,#f8fbff_100%)] ring-white/70"
                          }`}
                          style={{ transform: "rotate(-7deg) skewX(-6deg)" }}
                        >
                          <span className={`pointer-events-none absolute inset-x-2 top-2 h-px -rotate-6 ${isNightMode ? "bg-black" : "bg-blue-300/70"}`} />
                          <span className={`pointer-events-none absolute inset-x-3 bottom-2 h-px rotate-3 ${isNightMode ? "bg-black" : "bg-sky-300/70"}`} />
                          <span className={`pointer-events-none absolute left-3 top-1/2 h-5 w-px -translate-y-1/2 rotate-12 ${isNightMode ? "bg-black" : "bg-blue-200/70"}`} />
                          <span className={`pointer-events-none absolute right-4 top-1/2 h-5 w-px -translate-y-1/2 -rotate-12 ${isNightMode ? "bg-black" : "bg-cyan-200/70"}`} />
                          <span className={`pointer-events-none absolute left-2 top-1 h-1 w-1 rounded-full ${isNightMode ? "bg-black" : "bg-blue-200/80"}`} />
                          <span className={`pointer-events-none absolute right-6 bottom-1 h-1 w-1 rounded-full ${isNightMode ? "bg-black" : "bg-sky-200/80"}`} />
                          <span className={`pointer-events-none absolute right-2 top-1.5 h-1 w-1 rounded-full ${isNightMode ? "bg-black" : "bg-cyan-200/80"}`} />
                          <span className="relative flex items-center gap-0.5 font-mono text-sm font-bold uppercase tracking-[0.18em]" style={{ color: chatLevel.questionColor }}>
                            {Array.from(chatLevel.captchaText).map((char, index) => (
                              <span
                                key={`${chatLevel.id}-${char}-${index}`}
                                className="inline-block select-none"
                                style={{
                                  transform: `translateY(${index % 2 === 0 ? "-1px" : "1px"}) rotate(${index % 2 === 0 ? -12 : 10}deg)`,
                                }}
                              >
                                {char}
                              </span>
                            ))}
                          </span>
                        </span>
                      ) : undefined
                    }
                    textStyle={
                      chatLevel.id === 16
                        ? { color: favoriteColorPreview }
                        : chatLevel.questionColor
                          ? { color: chatLevel.questionColor }
                          : undefined
                    }
                    label="用户"
                    markdown={chatLevel.questionFormat === "markdown"}
                    text={chatLevel.question}
                  >
                    {chatLevel.questionImageSrc && (
                      <img
                        className="mt-3 max-h-80 w-full max-w-md select-none rounded-2xl border border-zinc-200/80 object-contain shadow-sm"
                        src={chatLevel.questionImageSrc}
                        alt={chatLevel.question}
                        draggable={!chatLevel.questionImageDownloadDisabled}
                        onContextMenu={chatLevel.questionImageDownloadDisabled ? (event) => event.preventDefault() : undefined}
                      />
                    )}
                    {getLightPuzzleClue(chatLevel.id) && (
                      <span className="mt-2 block select-none text-sm font-semibold tracking-wide text-white">
                        {getLightPuzzleClue(chatLevel.id)}
                      </span>
                    )}
                  </MessageBubble>
                )}
                {levelAttempts.map((attempt, index) => (
                  <div key={`${attempt.levelId}-${attempt.createdAt}`} className="space-y-4">
                    {(() => {
                      const uploadPreview = uploadAttemptPreviews[attempt.createdAt];
                      const shouldShowAttemptBubble = Boolean(uploadPreview || attempt.displayedText.trim().length > 0);

                      return (
                        shouldShowAttemptBubble ? (
                          <MessageBubble
                            align="right"
                            isNightMode={isNightMode}
                            label="模型"
                            markdown
                            text={uploadPreview ? "" : attempt.displayedText}
                            textStyle={uploadPreview ? undefined : getBubbleTextStyle(attempt.displayedText)}
                            onUndo={() => onUndoAttempt(attempt.createdAt)}
                          >
                            {uploadPreview && (
                              <img
                                className="mt-3 max-h-56 w-full max-w-sm rounded-2xl border border-zinc-200/80 object-contain shadow-sm"
                                src={uploadPreview}
                                alt={attempt.displayedText}
                              />
                            )}
                          </MessageBubble>
                        ) : null
                      );
                    })()}
                    {attempt.responseText && (
                      <MessageBubble
                        align="left"
                        animate={attempt.ok && attempt.levelId === 42}
                        appearDelayMs={attempt.ok && attempt.levelId === 42 ? Math.max(0, index - 1) * 1800 : 0}
                        isNightMode={isNightMode}
                          label={attempt.ok && attempt.levelId === 42 ? "分形噪波" : "用户"}
                        copyText={!attempt.ok && attempt.levelId === 17 ? `#FF0000 ${attempt.responseText}` : undefined}
                        text={attempt.responseText}
                        textStyle={!attempt.ok && attempt.levelId === 17 ? { color: "#FF0000" } : undefined}
                      />
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          <div ref={messageEndRef} />
        </div>
      </section>

      <form
        className={`shrink-0 border-t px-5 py-4 transition-[background-color,border-color] duration-700 ease-in-out ${isNightMode ? "border-zinc-900 bg-[#0a0a0a]" : "border-zinc-200/80 bg-white"}`}
        onSubmit={handleSubmit}
      >
        <div
          className={`mx-auto max-w-4xl rounded-[1.7rem] border p-2 shadow-sm transition-[background-color,border-color,box-shadow] duration-500 ease-in-out ${
            isNightMode
              ? "border-zinc-800 bg-zinc-950 focus-within:border-zinc-700 focus-within:bg-[#111111]"
              : "border-zinc-200 bg-zinc-50 focus-within:border-zinc-300 focus-within:bg-white"
          }`}
        >
            {!hasLinePuzzle && !hasKeyboardChoices && !isHandleLevel && appendToolOpen && (
            <div className={`mb-2 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs shadow-sm transition-[background-color,color,box-shadow] duration-500 ease-in-out ${isNightMode ? "bg-[#141414] text-zinc-300 ring-1 ring-zinc-800" : "bg-white text-zinc-600"}`}>
              <Pin className={`h-3.5 w-3.5 ${isNightMode ? "text-zinc-500" : "text-zinc-400"}`} />
              <span className="shrink-0">固定拼接</span>
              <span className="shrink-0">前</span>
              <input
                className={`w-20 bg-transparent text-sm outline-none ${isNightMode ? "text-zinc-100 placeholder:text-zinc-600" : "text-zinc-900"}`}
                placeholder="前置文本"
                value={permanentAppendPrefix}
                onChange={(event) => onPermanentAppendPrefixChange(event.target.value)}
                onClick={(event) => event.stopPropagation()}
              />
              <span className="shrink-0">后</span>
              <input
                className={`w-20 bg-transparent text-sm outline-none ${isNightMode ? "text-zinc-100 placeholder:text-zinc-600" : "text-zinc-900"}`}
                placeholder="后置文本"
                value={permanentAppendSuffix}
                onChange={(event) => onPermanentAppendSuffixChange(event.target.value)}
                onClick={(event) => event.stopPropagation()}
              />
              {(permanentAppendPrefix || permanentAppendSuffix) && (
                <button
                  className={`rounded-full p-1 transition ${isNightMode ? "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"}`}
                  type="button"
                  aria-label="清除常驻追加"
                  onClick={() => {
                    onPermanentAppendPrefixChange("");
                    onPermanentAppendSuffixChange("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {hasKeyboardChoices && (
            <div
              className={`mb-2 rounded-[1.4rem] border px-3 py-3 shadow-sm transition-[background-color,border-color] duration-500 ease-in-out ${
                isNightMode ? "border-zinc-800 bg-[#111111]" : "border-zinc-200 bg-white"
              }`}
            >
                <div className={`mb-3 text-xs ${isNightMode ? "text-zinc-500" : "text-zinc-500"}`}></div>
              <div className="space-y-2">
                {keyboardChoiceRows.map((row, rowIndex) =>
                  row.length > 0 ? (
                    <div key={`keyboard-row-${rowIndex}`} className="flex flex-wrap justify-center gap-2">
                      {row.map((choice) => (
                        <button
                          key={choice}
                          className={`inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border px-3 text-sm font-semibold tracking-[0.08em] transition-[background-color,border-color,color,transform] duration-200 hover:scale-[1.03] active:scale-95 ${
                            isNightMode
                              ? "border-zinc-800 bg-zinc-950 text-zinc-100 hover:border-zinc-700 hover:bg-[#171717]"
                              : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-white"
                          }`}
                          type="button"
                          onClick={() => handleKeyboardChoice(choice)}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}
            {currentQuestion?.uploadAccept && (
            <div className={`mb-2 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs shadow-sm transition-[background-color,color,box-shadow] duration-500 ease-in-out ${isNightMode ? "bg-[#141414] text-zinc-300 ring-1 ring-zinc-800" : "bg-white text-zinc-600"}`}>
              <input
                ref={uploadInputRef}
                className="hidden"
                type="file"
                accept={currentQuestion.uploadAccept}
                onChange={(event) => setSelectedUploadFile(event.target.files?.[0] ?? null)}
              />
              <button
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
                  isNightMode
                    ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500 hover:text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950"
                }`}
                type="button"
                onClick={() => uploadInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                传文件
              </button>
              <span className="truncate">
                {selectedUploadFile ? `已选：${selectedUploadFile.name}` : "这题上传处理后的 PNG 文件即可。"}
              </span>
            </div>
          )}
          {currentQuestion?.uploadAccept && selectedUploadPreviewUrl && (
            <div className={`mb-2 rounded-2xl px-3 py-3 text-xs shadow-sm transition-[background-color,color,box-shadow] duration-500 ease-in-out ${isNightMode ? "bg-[#141414] text-zinc-300 ring-1 ring-zinc-800" : "bg-white text-zinc-600"}`}>
              <div className="mb-2">本地预览（未真实上传）</div>
              <img
                className="max-h-56 w-auto rounded-2xl border border-zinc-200/80 object-contain shadow-sm"
                src={selectedUploadPreviewUrl}
                alt={selectedUploadFile?.name ?? "已选图片"}
              />
            </div>
          )}
            {activeLinePuzzle && (
              <div className={`mb-2 rounded-2xl p-2 shadow-sm transition-[background-color,color,box-shadow] duration-500 ease-in-out ${isNightMode ? "bg-[#141414] ring-1 ring-zinc-800" : "bg-white"}`}>
                <div
                  ref={linePuzzleBoardRef}
                  className={`relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[20px] border touch-none select-none transition-all duration-300 ${
                    linePuzzleDragging
                      ? "cursor-grabbing border-zinc-300 bg-white shadow-[0_18px_40px_-26px_rgba(17,24,39,0.28)]"
                      : linePuzzleStartHovered
                        ? "cursor-grab border-zinc-300 bg-white shadow-[0_18px_40px_-24px_rgba(17,24,39,0.24)]"
                        : "cursor-grab border-zinc-200 bg-white shadow-[0_14px_32px_-28px_rgba(17,24,39,0.22)]"
                  }`}
                  onPointerDown={handleLinePuzzlePointerDown}
                  onPointerMove={handleLinePuzzlePointerMove}
                  onPointerUp={handleLinePuzzlePointerUp}
                  onPointerCancel={handleLinePuzzlePointerUp}
                  onPointerLeave={handleLinePuzzlePointerLeave}
                >
                    <svg
                      className="block h-auto w-full"
                      viewBox={`${activeLinePuzzle.viewBox.minX} ${activeLinePuzzle.viewBox.minY} ${activeLinePuzzle.viewBox.width} ${activeLinePuzzle.viewBox.height}`}
                      preserveAspectRatio="xMidYMid meet"
                      aria-label="滑动线路谜题"
                    >
                      <rect
                        x={activeLinePuzzle.viewBox.minX}
                        y={activeLinePuzzle.viewBox.minY}
                        width={activeLinePuzzle.viewBox.width}
                        height={activeLinePuzzle.viewBox.height}
                        fill="#FFFFFF"
                      />
                      {activePathLinePuzzle && (
                        <>
                          <path
                            d={activePathLinePuzzlePath}
                            fill="none"
                            stroke="#000000"
                            strokeWidth="9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.2"
                          />
                          <path
                            d={activePathLinePuzzlePath}
                            fill="none"
                            stroke={linePuzzleSolved ? "#EAB308" : "#111111"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="7"
                            pathLength="100"
                            strokeDasharray={`${linePuzzleProgress * 100} 100`}
                          />
                        </>
                      )}
                      {activeBranchLinePuzzle && (
                        <>
                          {activeBranchEdgePaths.map((edgePath) => (
                            <path
                              key={edgePath.key}
                              d={edgePath.d}
                              fill="none"
                              stroke="#000000"
                              strokeWidth="9"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity="0.18"
                            />
                          ))}
                          {activeBranchProgressPath && (
                            <path
                              d={activeBranchProgressPath}
                              fill="none"
                              stroke={linePuzzleSolved ? "#EAB308" : linePuzzleHasForbiddenHit ? "#DC2626" : "#111111"}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="7"
                            />
                          )}
                          {activeBranchLinePuzzle.requiredDots.map((dot) => {
                            const dotHit = linePuzzleSolved || linePuzzleHitRequiredDots.includes(dot.id);
                            const dotForbiddenHit = linePuzzleHitForbiddenDots.includes(dot.id);
                            const dotIsBlack = !linePuzzleIsToggled;
                            const dotShouldFlash = linePuzzleFailedDotIds.includes(dot.id);
                            return (
                              <circle
                                key={dot.id}
                                cx={dot.x}
                                cy={dot.y}
                                r="6"
                                fill={dotShouldFlash ? "#FCA5A5" : dotForbiddenHit ? "#FCA5A5" : dotHit ? "#EAB308" : dotIsBlack ? "#111111" : "#FFFFFF"}
                                stroke={dotShouldFlash ? "#DC2626" : dotForbiddenHit ? "#DC2626" : dotHit ? "#A16207" : dotIsBlack ? "#FFFFFF" : "#111111"}
                                strokeWidth="2"
                              >
                                {dotShouldFlash && <animate attributeName="opacity" values="1;0.22;1" dur="0.34s" repeatCount="indefinite" />}
                              </circle>
                            );
                          })}
                          {activeBranchLinePuzzle.forbiddenDots?.map((dot) => {
                            const dotHit = linePuzzleSolved || linePuzzleHitInvertedBlackDots.includes(dot.id);
                            const dotForbiddenHit = linePuzzleHitForbiddenDots.includes(dot.id);
                            const dotIsBlack = linePuzzleIsToggled;
                            const dotShouldFlash = linePuzzleFailedDotIds.includes(dot.id);
                            return (
                              <circle
                                key={dot.id}
                                cx={dot.x}
                                cy={dot.y}
                                r="6.5"
                                fill={dotShouldFlash ? "#FCA5A5" : dotForbiddenHit ? "#FCA5A5" : dotHit ? "#EAB308" : dotIsBlack ? "#111111" : "#FFFFFF"}
                                stroke={dotShouldFlash ? "#DC2626" : dotForbiddenHit ? "#DC2626" : dotHit ? "#A16207" : dotIsBlack ? "#FFFFFF" : "#111111"}
                                strokeWidth="2.5"
                              >
                                {dotShouldFlash && <animate attributeName="opacity" values="1;0.22;1" dur="0.34s" repeatCount="indefinite" />}
                              </circle>
                            );
                          })}
                          {activeBranchLinePuzzle.toggleDots?.map((dot) => {
                            const dotHit = linePuzzleHitToggleDots.includes(dot.id);
                            return (
                              <g key={dot.id}>
                                <circle cx={dot.x} cy={dot.y} r="7" fill={dotHit ? "#DDD6FE" : "#F5F3FF"} stroke={dotHit ? "#7C3AED" : "#6D28D9"} strokeWidth="2.5" />
                                <path
                                  d={`M ${dot.x - 3.5} ${dot.y} A 3.5 3.5 0 0 1 ${dot.x + 3.5} ${dot.y}`}
                                  fill="none"
                                  stroke="#111111"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                                <path
                                  d={`M ${dot.x + 3.5} ${dot.y} A 3.5 3.5 0 0 1 ${dot.x - 3.5} ${dot.y}`}
                                  fill="none"
                                  stroke="#FFFFFF"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                              </g>
                            );
                          })}
                          {activeBranchLinePuzzle.cellDots?.map((dot) => {
                            const dotIsBlack = linePuzzleIsToggled ? dot.color === "white" : dot.color === "black";
                            const dotShouldFlash = linePuzzleFailedCellDotIds.includes(dot.id);
                            return (
                              <circle
                                key={dot.id}
                                cx={dot.x}
                                cy={dot.y}
                                r="6"
                                fill={dotShouldFlash ? "#FCA5A5" : dotIsBlack ? "#111111" : "#FFFFFF"}
                                stroke={dotShouldFlash ? "#DC2626" : dotIsBlack ? "#FFFFFF" : "#111111"}
                                strokeWidth="2"
                                opacity={linePuzzleSolved || linePuzzleRegionsBalanced ? 1 : 0.96}
                              >
                                {dotShouldFlash && <animate attributeName="opacity" values="1;0.22;1" dur="0.34s" repeatCount="indefinite" />}
                              </circle>
                            );
                          })}
                          {activeBranchLinePuzzle.restPoints?.map((restPoint) => {
                            const node = activeBranchNodeMap?.get(restPoint.nodeId);
                            if (!node) return null;
                            const isResumePoint = linePuzzleResumeNodeId === restPoint.nodeId;
                            const wasVisited = linePuzzleNodeTrail.includes(restPoint.nodeId);
                            return (
                              <g key={restPoint.id}>
                                {isResumePoint && !linePuzzleSolved && (
                                  <circle cx={node.x} cy={node.y} r="14" fill="rgba(59,130,246,0.12)" stroke="rgba(37,99,235,0.22)" strokeWidth="1.5">
                                    <animate attributeName="r" values="12;18" dur="1.35s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.28;0" dur="1.35s" repeatCount="indefinite" />
                                  </circle>
                                )}
                                <circle
                                  cx={node.x}
                                  cy={node.y}
                                  r="8"
                                  fill={wasVisited ? "#DBEAFE" : "#EFF6FF"}
                                  stroke={isResumePoint ? "#2563EB" : "#1D4ED8"}
                                  strokeWidth="2"
                                />
                                <path d={`M ${node.x - 2.4} ${node.y - 3.2} L ${node.x - 2.4} ${node.y + 3.2}`} stroke="#1E3A8A" strokeWidth="1.8" strokeLinecap="round" />
                                <path d={`M ${node.x + 2.4} ${node.y - 3.2} L ${node.x + 2.4} ${node.y + 3.2}`} stroke="#1E3A8A" strokeWidth="1.8" strokeLinecap="round" />
                              </g>
                            );
                          })}
                        </>
                      )}
                    {!linePuzzleSolved && (
                      <>
                        <circle
                            cx={activeLinePuzzleActionPoint?.x ?? 0}
                            cy={activeLinePuzzleActionPoint?.y ?? 0}
                          r={linePuzzleStartHovered ? "18" : "15"}
                          fill={linePuzzleStartHovered ? "rgba(17,17,17,0.07)" : "rgba(17,17,17,0.04)"}
                          pointerEvents="none"
                        >
                          <animate
                            attributeName="r"
                              values={linePuzzleStartHovered ? "15;21" : "13;18"}
                            dur={linePuzzleStartHovered ? "1.8s" : "2.6s"}
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                              values={linePuzzleStartHovered ? "0.2;0" : "0.12;0"}
                            dur={linePuzzleStartHovered ? "1.8s" : "2.6s"}
                            repeatCount="indefinite"
                          />
                        </circle>
                        <circle
                            cx={activeLinePuzzleActionPoint?.x ?? 0}
                            cy={activeLinePuzzleActionPoint?.y ?? 0}
                          r={linePuzzleStartHovered ? "13" : "11"}
                          fill="none"
                          stroke={linePuzzleStartHovered ? "#111111" : "rgba(17,17,17,0.72)"}
                          strokeWidth="1.5"
                          pointerEvents="none"
                        >
                          <animate
                            attributeName="r"
                              values={linePuzzleStartHovered ? "12;24" : "11;18"}
                            dur={linePuzzleStartHovered ? "1.25s" : "2.2s"}
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                              values={linePuzzleStartHovered ? "0.4;0" : "0.16;0"}
                            dur={linePuzzleStartHovered ? "1.25s" : "2.2s"}
                            repeatCount="indefinite"
                          />
                        </circle>
                        <circle r="3.5" fill="#111111" opacity={linePuzzleStartHovered ? "0.55" : "0.28"} pointerEvents="none">
                          <animateMotion
                            dur={linePuzzleStartHovered ? "1.15s" : "1.75s"}
                            repeatCount="indefinite"
                            path={activeLinePuzzleHintPath}
                          />
                          <animate
                            attributeName="opacity"
                            values={linePuzzleStartHovered ? "0.65;0.18;0.65" : "0.3;0.08;0.3"}
                            dur={linePuzzleStartHovered ? "1.15s" : "1.75s"}
                            repeatCount="indefinite"
                          />
                        </circle>
                      </>
                    )}
                    <circle
                      cx={activeLinePuzzleStartPoint?.x ?? 0}
                      cy={activeLinePuzzleStartPoint?.y ?? 0}
                      fill="#FFFFFF"
                      r="10"
                      stroke={linePuzzleSolved ? "#EAB308" : "#111111"}
                      strokeWidth="4"
                    />
                    <circle
                      cx={activeLinePuzzleEndPoint?.x ?? 0}
                      cy={activeLinePuzzleEndPoint?.y ?? 0}
                      fill={linePuzzleSolved ? "#EAB308" : "#FFFFFF"}
                      r="10"
                      stroke="#111111"
                      strokeWidth="4"
                    />
                  </svg>
                </div>
              </div>
            )}
              {isHandleLevel && (
                <HandleBoard
                  target={handleAnswer}
                  hint={handleHint}
                  isNightMode={isNightMode}
                  onSolve={handleHandleBoardSolve}
                />
              )}
              {activeTuringPuzzle && (
                <div className={`mb-2 rounded-2xl px-3 py-3 text-xs shadow-sm transition-[background-color,color,box-shadow] duration-500 ease-in-out ${isNightMode ? "bg-[#141414] text-zinc-300 ring-1 ring-zinc-800" : "bg-white text-zinc-600"}`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className={`text-sm font-semibold ${isNightMode ? "text-zinc-100" : "text-zinc-900"}`}>{isTuringQueryDisabled ? "图灵机规则书" : "图灵机验证"}</div>
                      <div className={isNightMode ? "text-zinc-500" : "text-zinc-500"}>
                        {isTuringQueryDisabled ? "这次不能提问，只能看四张验证器卡片和隐藏规则，直接反推唯一答案。" : "先拿提案去问一台验证器，再根据结果反推真正密码，最后在下面输入密码提交。"}
                      </div>
                    </div>
                    <div className={`rounded-full px-2 py-1 font-mono text-[11px] ${isNightMode ? "bg-zinc-900 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                      {isTuringQueryDisabled ? "不可提问" : `剩余提案 ${remainingTuringQueries} / 2`}
                    </div>
                  </div>

                  <div className={`mb-3 rounded-2xl px-3 py-3 text-xs leading-5 ${isNightMode ? "bg-zinc-900 text-zinc-300" : "bg-zinc-50 text-zinc-600"}`}>
                    <div className={`mb-2 font-semibold ${isNightMode ? "text-zinc-100" : "text-zinc-900"}`}>怎么操作</div>
                    {isTuringQueryDisabled ? (
                      <>
                        <div>1. 下面四张卡片各自都藏着一条真实规则，而且真实规则一定在卡片列出的选项里。</div>
                        <div>2. 你还知道两条额外信息：只有唯一一个密码能同时通过四张卡；去掉任意一张卡之后，这个唯一性都会消失。</div>
                        <div>3. 这次不能问机器，所以它不会告诉你“满足规则”还是“不满足规则”。</div>
                        <div>4. 你要直接根据四张卡片的类别、候选规则和那两条隐藏规则，反推出唯一密码。</div>
                        <div>5. 推理出来后，在最下方的大输入框里直接提交三位密码。</div>
                      </>
                    ) : (
                      <>
                        <div>1. 在下面输入一个三位数提案，比如 `123`。</div>
                        <div>2. 选中你想问的一台验证器。</div>
                        <div>3. 点击 `问机器`，它会告诉你：这个提案是否满足这台验证器背后的隐藏规则。</div>
                        <div>4. 比如某台验证器真正检查的是“第一位的奇偶性”，如果密码的第一位是奇数，那么 `132` 去问它会得到“满足规则”，`234` 去问它会得到“不满足规则”。注意，第一位指第一个数字，第三位指第三个数字。</div>
                        <div>5. 最多只能试 `2` 个不同提案；同一个提案可以分次问，但每个提案累计最多问 `3` 台验证器。</div>
                        <div>6. 推理出真正密码后，在最下方的大输入框里提交答案。</div>
                      </>
                    )}
                  </div>

                  {!isTuringQueryDisabled && (
                    <>
                      <div className="mb-3 flex items-center gap-2">
                        <input
                          className={`w-28 rounded-2xl border bg-transparent px-3 py-2 text-sm font-mono outline-none transition ${isNightMode ? "border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600" : "border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400"}`}
                          inputMode="numeric"
                          maxLength={3}
                          placeholder="例如 241"
                          value={turingProposal}
                          onChange={(event) => {
                            setTuringProposal(event.target.value.replace(/\D/g, "").slice(0, 3));
                            setTuringFeedback(null);
                          }}
                          onKeyDown={handleTuringProposalKeyDown}
                        />
                        <button
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${isNightMode ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-500 hover:text-white" : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950"}`}
                          type="button"
                          disabled={remainingTuringQueries === 0 && !currentProposalRecord}
                          onClick={handleTuringVerify}
                        >
                          <Bot className="h-3.5 w-3.5" />
                          问机器
                        </button>
                      </div>

                      <div className={`mb-3 flex items-center justify-between rounded-2xl px-3 py-2 text-xs ${isNightMode ? "bg-zinc-900 text-zinc-400" : "bg-zinc-50 text-zinc-500"}`}>
                        <span>当前提案：{turingProposal || "未填写"}</span>
                        <span>这个提案已问：{currentProposalAskedCount} / 3 台验证器</span>
                      </div>
                    </>
                  )}

                  <div className="grid gap-2 md:grid-cols-2">
                    {activeTuringVerifiers.map((verifier) => {
                      const selected = selectedTuringVerifierId === verifier.id;
                      const cardClass = `rounded-2xl border px-3 py-3 text-left transition ${selected ? isNightMode ? "border-zinc-500 bg-zinc-900 text-zinc-100" : "border-zinc-400 bg-zinc-50 text-zinc-900" : isNightMode ? "border-zinc-800 bg-transparent text-zinc-300 hover:border-zinc-700" : "border-zinc-200 bg-transparent text-zinc-700 hover:border-zinc-300"}`;
                      const badgeText = isTuringQueryDisabled ? "静态线索" : selected ? "当前要问它" : "点我选中";
                      const badgeClass = isTuringQueryDisabled
                        ? isNightMode ? "bg-zinc-950 text-zinc-500" : "bg-zinc-100 text-zinc-500"
                        : selected ? "bg-emerald-500/15 text-emerald-500" : isNightMode ? "bg-zinc-950 text-zinc-500" : "bg-zinc-100 text-zinc-500";

                      if (isTuringQueryDisabled) {
                        return (
                          <div key={verifier.id} className={cardClass}>
                            <div className="mb-1 flex items-center justify-between gap-3 text-sm font-semibold">
                              <span>{verifier.label}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] ${badgeClass}`}>{badgeText}</span>
                            </div>
                            <div className={`mb-2 text-xs ${isNightMode ? "text-zinc-400" : "text-zinc-500"}`}>{verifier.prompt}</div>
                            <div className="font-mono text-[11px] leading-5">{verifier.options.join(" / ")}</div>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={verifier.id}
                          className={cardClass}
                          type="button"
                          onClick={() => selectTuringVerifier(verifier.id)}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3 text-sm font-semibold">
                            <span>{verifier.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${badgeClass}`}>{badgeText}</span>
                          </div>
                          <div className={`mb-2 text-xs ${isNightMode ? "text-zinc-400" : "text-zinc-500"}`}>{verifier.prompt}</div>
                          <div className="font-mono text-[11px] leading-5">{verifier.options.join(" / ")}</div>
                        </button>
                      );
                    })}
                  </div>

                  {!isTuringQueryDisabled && turingFeedback && (
                    <div className={`mt-3 rounded-2xl px-3 py-2 text-sm ${isNightMode ? "bg-zinc-900 text-zinc-100" : "bg-zinc-100 text-zinc-800"}`}>
                      {turingFeedback}
                    </div>
                  )}

                  {!isTuringQueryDisabled && turingQueryLog.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className={`text-xs font-semibold tracking-wide ${isNightMode ? "text-zinc-500" : "text-zinc-500"}`}>最近查询</div>
                      <div className="space-y-2">
                        {turingQueryLog.map((record, index) => (
                          <div
                            key={`${record.proposal}-${index}`}
                            className={`rounded-2xl px-3 py-3 font-mono text-xs ${isNightMode ? "bg-zinc-900 text-zinc-300" : "bg-zinc-50 text-zinc-700"}`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span>提案 {record.proposal}</span>
                              <span>{record.results.length} / 3 台验证器</span>
                            </div>
                            <div className="space-y-1">
                              {record.results.map((result) => (
                                <div key={`${record.proposal}-${result.verifierId}`} className="flex items-center justify-between gap-3">
                                  <span>{result.verifierLabel}</span>
                                  <span className={result.passed ? "text-emerald-500" : "text-rose-500"}>{result.passed ? "满足规则" : "不满足规则"}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            {!hasLinePuzzle && !isHandleLevel && (
              <div className="flex items-end gap-3">
                <textarea
                  ref={inputRef}
                  className={`max-h-40 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-6 outline-none ${isNightMode ? "text-zinc-100 placeholder:text-zinc-600" : "text-zinc-900 placeholder:text-zinc-400"}`}
                  disabled={inputDisabled}
                  style={inputTextStyle}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleAnswerKeyDown}
                />
                <button
                  className={`mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-300 ease-out hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                    permanentAppendPrefix || permanentAppendSuffix
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                      : isNightMode
                        ? "bg-[#161616] text-zinc-300 hover:bg-[#202020] hover:text-zinc-100"
                        : "bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                  aria-label="设置常驻追加内容"
                  type="button"
                  disabled={hasKeyboardChoices}
                  onClick={() => {
                    setAppendToolOpen((open) => !open);
                    inputRef.current?.focus();
                  }}
                >
                  <Pin className="h-4 w-4" />
                </button>
                <button
                  className={`mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-300 ease-out hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                    isConsoleSendLocked
                      ? isNightMode
                        ? "bg-[#1f1f1f] text-zinc-500 hover:bg-[#2a2a2a] hover:text-zinc-300"
                        : "bg-zinc-300 text-zinc-500 hover:bg-zinc-400 hover:text-zinc-700"
                      : isNightMode
                        ? "bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-[#1f1f1f] disabled:text-zinc-600"
                        : "bg-zinc-900 text-white hover:bg-zinc-700 disabled:bg-zinc-300"
                  }`}
                  disabled={inputDisabled || (currentQuestion?.uploadAccept ? !selectedUploadFile : input.trim().length === 0)}
                  aria-label={isConsoleSendLocked ? "提交（已锁）" : "提交"}
                  type="submit"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            )}
        </div>
      </form>
      <footer
        className={`pointer-events-none fixed bottom-4 right-4 z-10 text-xs transition-colors duration-700 ease-in-out ${
          isNightMode ? "text-zinc-600" : "text-zinc-400"
        }`}
      >
        作者@分形噪波
      </footer>
    </main>
  );
}

function applyPermanentAppend(input: string, prefix: string, suffix: string) {
  if (!prefix && !suffix) return input;

  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const objectValue = parsed as { answer?: unknown };
      if (typeof objectValue.answer === "string") {
        const hasPrefix = prefix && objectValue.answer.startsWith(prefix);
        const hasSuffix = suffix && objectValue.answer.endsWith(suffix);
        if (!hasPrefix || !hasSuffix) {
          const newAnswer = `${prefix}${objectValue.answer}${suffix}`;
          return JSON.stringify({ ...objectValue, answer: newAnswer });
        }
      }
    }
  } catch {
    // 非 JSON 回答按纯文本追加。
  }

  const hasPrefix = prefix && input.startsWith(prefix);
  const hasSuffix = suffix && input.endsWith(suffix);
  if (hasPrefix && hasSuffix) return input;
  return `${prefix}${input}${suffix}`;
}

function buildUploadedFileAnswer(file: File, level: { questionColor?: string }) {
  const parts = [level.questionColor, "[上传文件]", file.name, file.type ? `(${file.type})` : ""].filter(Boolean);
  return parts.join(" ");
}

function MessageBubble({
  align,
  animate = false,
  appearDelayMs = 0,
  isNightMode = false,
  label,
  markdown = false,
  text,
  children,
  inlineAccessory,
  copyText,
  textStyle,
  onUndo,
}: {
  align: "left" | "right";
  animate?: boolean;
  appearDelayMs?: number;
  isNightMode?: boolean;
  label: string;
  markdown?: boolean;
  text: string;
  children?: ReactNode;
  inlineAccessory?: ReactNode;
  copyText?: string;
  textStyle?: CSSProperties;
  onUndo?: () => void;
}) {
  const isRight = align === "right";
  const [isVisible, setIsVisible] = useState(appearDelayMs === 0);

  useEffect(() => {
    if (appearDelayMs === 0) {
      setIsVisible(true);
      return;
    }
    setIsVisible(false);
    const timer = window.setTimeout(() => setIsVisible(true), appearDelayMs);
    return () => window.clearTimeout(timer);
  }, [appearDelayMs]);

  if (!isVisible) return null;

  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    if (copyText) {
      event.preventDefault();
      event.clipboardData.setData("text/plain", copyText);
      return;
    }
    if (!markdown) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
  }

  return (
    <div className={`flex items-start gap-3 ${isRight ? "justify-end" : ""}`}>
      {!isRight && (
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm transition-[background-color,color] duration-700 ease-in-out ${isNightMode ? "bg-black text-black" : "bg-white text-zinc-700"}`}>
          <UserRound className="h-4 w-4" />
        </div>
      )}
      {isRight && onUndo && (
        <button
          className={`mt-8 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[background-color,color,box-shadow,transform] duration-500 ease-in-out hover:scale-105 hover:shadow-sm ${
            isNightMode ? "text-black hover:bg-black hover:text-black" : "text-zinc-400 hover:bg-white hover:text-zinc-900"
          }`}
          type="button"
          aria-label="回撤这条回复"
          title="回撤这条回复"
          onClick={onUndo}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
      <div className={`max-w-[78%] ${isRight ? "text-right" : ""}`}>
        <div className="mb-1 px-1 text-xs" style={{ color: isNightMode ? NIGHT_BLACK : undefined }}>{label}</div>
        <div
          onCopy={handleCopy}
          className={`whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm transition-[background-color,color,box-shadow] duration-700 ease-in-out ${
            isNightMode
              ? isRight
                ? "rounded-tr-md bg-black text-black"
                : "rounded-tl-md bg-black text-black"
              : isRight
                ? "rounded-tr-md bg-[#dff5df] text-zinc-900"
                : "rounded-tl-md bg-white text-zinc-900"
          }`}
        >
          {inlineAccessory ? (
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1" style={textStyle}>
                {animate ? <TypewriterText text={text} /> : markdown ? <MarkdownText text={text} /> : text}
              </span>
              <span className="shrink-0">{inlineAccessory}</span>
            </span>
          ) : (
            <span style={textStyle}>
              {animate ? <TypewriterText text={text} /> : markdown ? <MarkdownText text={text} /> : text}
            </span>
          )}
          {children}
        </div>
      </div>
      {isRight && (
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm transition-[background-color,color] duration-700 ease-in-out ${isNightMode ? "bg-black text-black" : "bg-zinc-900 text-white"}`}>
          <Bot className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);

  return (
    <>
      {lines.map((line, index) => {
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        const key = `${index}-${line}`;

        if (!heading) {
          return (
            <span key={key} className="block">
              {line}
            </span>
          );
        }

        const level = heading[1].length;
        const content = heading[2];
        const className =
          level === 1
            ? "block text-2xl font-bold leading-9"
            : level === 2
              ? "block text-xl font-bold leading-8"
              : level === 3
                ? "block text-lg font-semibold leading-7"
                : "block text-base font-semibold leading-7";

        return (
          <span key={key} className={className}>
            {content}
          </span>
        );
      })}
    </>
  );
}

function TypewriterText({ text }: { text: string }) {
  const [visibleText, setVisibleText] = useState("");

  useEffect(() => {
    setVisibleText("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 36);

    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <>
      {visibleText}
      {visibleText.length < text.length && <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse bg-zinc-400" />}
    </>
  );
}
