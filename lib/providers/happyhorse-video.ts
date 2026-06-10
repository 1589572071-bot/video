/** @deprecated 请使用 wan26-video；保留 re-export 以兼容旧 import */
export {
  type Wan26VideoMode,
  type Wan26VideoMode as HappyHorseMode,
  type Wan26VideoGenerateInput,
  type Wan26VideoGenerateResult,
  selectWan26VideoMode,
  selectWan26VideoMode as selectHappyHorseMode,
  generateWan26VideoChunk,
  generateWan26VideoChunk as generateHappyHorseChunk,
  buildBlockVideoPrompt,
} from "./wan26-video";
