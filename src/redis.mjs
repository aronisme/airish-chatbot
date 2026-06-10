import { Redis } from "@upstash/redis";

let redis;

if (process.env.UPSTASH_REDISV2_REST_URL && process.env.UPSTASH_REDISV2_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDISV2_REST_URL.trim(),
    token: process.env.UPSTASH_REDISV2_REST_TOKEN.trim(),
  });
} else {
  console.warn("[Redis] Credentials missing. Redis features disabled.");
}

export default redis;

// Helper keys
export const KEYS = {
  activeCount: (provider, keyHash) => `active:${provider}:${keyHash}`,
  health: (provider, keyHash) => `health:${provider}:${keyHash}`,
  cache: (promptHash) => `cache:${promptHash}`,
  rateLimit: (ip) => `ratelimit:${ip}`,
  innerVoice: (chatId) => `innervoice:${chatId}`,
  moodTag: (chatId) => `moodtag:${chatId}`,
  violations: (chatId) => `violations:${chatId}`,
  cursor: (provider) => `cursor:${provider}`
};
