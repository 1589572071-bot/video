export type NodeType =
  | "VideoAnalyze"
  | "ProductParse"
  | "GapDetect"
  | "ScriptStitch"
  | "WanKeyframe"
  | "HappyHorseT2V"
  | "HappyHorseI2V"
  | "HappyHorseR2V"
  | "Concat";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

export interface NodeGraph {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
