/**
 * MetaCut 模型配置中心
 *
 * 所有外部模型 API Key / Endpoint 在此集中管理，严禁写死在业务代码中。
 */

const dashscopeBaseUrl =
  process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1";

export const MODEL_CONFIG = {
  // Step1: 视频原子化拆解（Doubao-Seed-2.0-lite）
  videoAnalysis: {
    provider: "doubao",
    model: "doubao-seed-2-0-lite",
    endpoint: process.env.DOUBAO_EP || "",
    apiKey: process.env.DOUBAO_APIKEY || "",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  },

  // 百炼 DashScope（万相2.6 生图 + 生视频）
  bailian: {
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    baseUrl: dashscopeBaseUrl,
    publicOrigin: process.env.METACUT_PUBLIC_ORIGIN || "",
    image: {
      /** 文生图 wan2.6-t2i（对应 MCP modelstudio_wanx26_image_generation） */
      t2iModel:
        process.env.WAN26_T2I_MODEL ||
        process.env.WAN27_IMAGE_MODEL ||
        "wan2.6-t2i",
      /** 图像编辑 wan2.6-image（有商品参考图时，对应 MCP modelstudio_image_edit_wan26） */
      editModel:
        process.env.WAN26_IMAGE_MODEL ||
        process.env.WAN27_IMAGE_FAST_MODEL ||
        "wan2.6-image",
      syncEndpoint: `${dashscopeBaseUrl}/services/aigc/multimodal-generation/generation`,
      asyncEndpoint: `${dashscopeBaseUrl}/services/aigc/image-generation/generation`,
      defaultSize:
        process.env.WAN26_IMAGE_SIZE ||
        process.env.WAN27_IMAGE_SIZE ||
        "720*1280",
    },
    video: {
      t2v:
        process.env.WAN26_T2V_MODEL ||
        process.env.HAPPYHORSE_T2V_MODEL ||
        "wan2.6-t2v",
      i2v:
        process.env.WAN26_I2V_MODEL ||
        process.env.HAPPYHORSE_I2V_MODEL ||
        "wan2.6-i2v-flash",
      r2v:
        process.env.WAN26_R2V_MODEL ||
        process.env.HAPPYHORSE_R2V_MODEL ||
        "wan2.6-r2v-flash",
      endpoint: `${dashscopeBaseUrl}/services/aigc/video-generation/video-synthesis`,
      taskEndpoint: `${dashscopeBaseUrl}/tasks`,
      defaultSize: process.env.WAN26_VIDEO_SIZE || process.env.WAN27_IMAGE_SIZE || "720*1280",
      defaultResolution:
        process.env.WAN26_VIDEO_RESOLUTION ||
        process.env.HAPPYHORSE_RESOLUTION ||
        "720P",
      defaultRatio:
        process.env.WAN26_VIDEO_RATIO || process.env.HAPPYHORSE_RATIO || "9:16",
      pollIntervalMs: Number(process.env.DASHSCOPE_POLL_INTERVAL_MS || "15000"),
      pollTimeoutMs: Number(process.env.DASHSCOPE_POLL_TIMEOUT_MS || "600000"),
    },
  },

  // Step2: 商品多模态拆解（Doubao，复用 DOUBAO_APIKEY / DOUBAO_EP）
  productParse: {
    provider: "doubao",
    model: process.env.DOUBAO_PRODUCT_MODEL || "doubao-seed-2-0-lite",
    endpoint: process.env.DOUBAO_EP || "",
    apiKey: process.env.DOUBAO_APIKEY || "",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  },

  // Step4: 渲染模式（无 Key 时自动 Mock）
  render: {
    mockMode:
      process.env.METACUT_RENDER_MOCK === "true" ||
      (!process.env.DASHSCOPE_API_KEY && process.env.METACUT_RENDER_MOCK !== "false"),
  },
} as const;

export type ModelConfig = typeof MODEL_CONFIG;

export function isBailianConfigured(): boolean {
  return Boolean(MODEL_CONFIG.bailian.apiKey);
}

export function isDoubaoConfigured(): boolean {
  return Boolean(
    MODEL_CONFIG.productParse.apiKey && MODEL_CONFIG.productParse.endpoint
  );
}
