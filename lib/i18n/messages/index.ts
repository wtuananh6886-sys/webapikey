import type { Locale } from "../constants";
import type { MessageTree } from "./vi";
import { vi } from "./vi";
import { en } from "./en";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";

export const messages: Record<Locale, MessageTree> = {
  vi,
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
};
