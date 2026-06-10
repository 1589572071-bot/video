import type { ProductInput, UserAssetInventory } from "./types/pipeline";

/** Step2 Mock 商品解析（含 user_asset_inventory） */
export function parseProductFromText(
  desc: string,
  options: {
    productImagesCount?: number;
    productVideoClipsCount?: number;
  } = {}
): ProductInput & { schema_version: string } {
  const text = desc.trim();
  const inventory: UserAssetInventory = {
    product_images_count: options.productImagesCount ?? 0,
    product_video_clips_count: options.productVideoClipsCount ?? 0,
    has_logo_pack: false,
    has_endcard: false,
  };

  if (!text) {
    return {
      schema_version: "product/v1",
      product_name: "未知商品",
      category: "其他",
      visual_description: "暂无描述",
      usage_method: "直接使用",
      core_selling_points: ["高品质"],
      target_audience: "广大消费者",
      usage_scene: "日常使用",
      pain_point_gain_point: "提升体验",
      user_asset_inventory: inventory,
    };
  }

  const lower = text.toLowerCase();
  let category = "其他";
  let product_name = text.split(/[，。,.、]/)[0].trim();

  if (lower.includes("眼影") || lower.includes("眼妆")) {
    category = "眼影";
    product_name = product_name.includes("眼影") ? product_name : product_name + "眼影";
  } else if (lower.includes("面霜") || lower.includes("保湿") || lower.includes("护肤")) {
    category = "面霜";
  } else if (lower.includes("内衣") || lower.includes("文胸")) {
    category = "内衣";
  } else if (lower.includes("零食") || lower.includes("脆") || lower.includes("辣")) {
    category = "膨化零食";
  } else if (lower.includes("口红") || lower.includes("唇釉")) {
    category = "口红";
  }

  let visual_description = text;
  if (lower.includes("眼影")) {
    visual_description =
      "大地色系眼影盘，哑光与微闪粉质混合，色彩过渡自然，边缘晕染柔和";
  } else if (lower.includes("面霜")) {
    visual_description =
      "乳白色丝滑霜体，细腻无颗粒，触感清爽，玻璃瓶身透光度高";
  }

  let usage_method = "直接使用";
  if (lower.includes("眼影")) {
    usage_method = "用指腹或眼影刷蘸取，由浅至深晕染于眼窝与眼尾";
  } else if (lower.includes("面霜")) {
    usage_method = "洁面后取适量，用指腹轻拍于面部及颈部";
  } else if (category === "膨化零食") {
    usage_method = "开袋即食";
  }

  const core_selling_points: string[] = [];
  if (lower.includes("消肿")) core_selling_points.push("眼周消肿提亮");
  if (lower.includes("耐用") || lower.includes("持久")) core_selling_points.push("妆效持久不卡纹");
  if (lower.includes("好看")) core_selling_points.push("自然大地色系");
  if (lower.includes("香辣") || lower.includes("辣")) core_selling_points.push("香辣过瘾");
  if (core_selling_points.length === 0) core_selling_points.push("具体功效待补充");

  let target_audience = "目标用户";
  if (lower.includes("眼影") || lower.includes("消肿")) {
    target_audience = "25-35岁都市白领女性，长期熬夜加班，晨起眼周浮肿";
  }

  let usage_scene = "日常场景";
  if (lower.includes("眼影")) {
    usage_scene = "早晨通勤前5分钟快速上妆、深夜加班后补妆";
  }

  let pain_point_gain_point = "提升体验";
  if (lower.includes("眼影") && lower.includes("消肿")) {
    pain_point_gain_point =
      "晨起眼周浮肿显疲惫；上妆后眼神清亮有神，妆效持久不卡纹";
  }

  return {
    schema_version: "product/v1",
    product_name,
    category,
    visual_description,
    usage_method,
    core_selling_points,
    target_audience,
    usage_scene,
    pain_point_gain_point,
    user_asset_inventory: inventory,
  };
}
