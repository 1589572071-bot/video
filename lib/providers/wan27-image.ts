/** @deprecated 请使用 wan26-image；保留 re-export 以兼容旧 import */
export {
  type Wan26ImageResult as Wan27GenerateResult,
  type Wan26PackagingInput as Wan27PackagingInput,
  type Wan26KeyframeInput as Wan27GenerateInput,
  generateWan26Packaging as generateWan27Packaging,
  generateWan26Keyframe as generateWan27Keyframe,
} from "./wan26-image";
