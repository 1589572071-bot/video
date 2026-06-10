import type { NodeGraph } from "./types";

/** MetaCut 默认线性模板 = 当前 Step1–4 流程（无 Wan2.7 逐镜生图） */
export const DEFAULT_LINEAR_GRAPH: NodeGraph = {
  id: "metacut-linear-v1",
  name: "MetaCut 线性流程（默认）",
  nodes: [
    { id: "n1", type: "VideoAnalyze", label: "参考视频解析 · Doubao", x: 0, y: 0 },
    { id: "n2", type: "ProductParse", label: "商品多模态 · Step2", x: 0, y: 120 },
    { id: "n3", type: "GapDetect", label: "缺口检测 gapPlan", x: 0, y: 240 },
    { id: "n4", type: "ScriptStitch", label: "剧本缝合 · manifest", x: 0, y: 360 },
    { id: "n5", type: "HappyHorseT2V", label: "HappyHorse T2V 区块1", x: 0, y: 480 },
    { id: "n6", type: "HappyHorseI2V", label: "HappyHorse I2V", x: 0, y: 600 },
    { id: "n7", type: "Concat", label: "FFmpeg 拼接成片", x: 0, y: 720 },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n3" },
    { id: "e2", from: "n2", to: "n3" },
    { id: "e3", from: "n3", to: "n4" },
    { id: "e4", from: "n4", to: "n5" },
    { id: "e5", from: "n5", to: "n6" },
    { id: "e6", from: "n6", to: "n7" },
  ],
};

export function getDefaultGraph(): NodeGraph {
  return JSON.parse(JSON.stringify(DEFAULT_LINEAR_GRAPH)) as NodeGraph;
}
