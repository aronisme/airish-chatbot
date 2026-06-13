// src/perception/parser.mjs

import { queryChronosLLM } from "../llm.mjs";

const PERCEPTION_SYSTEM_PROMPT = `You are a psychological perception engine.
Analyze the user's message contextually and return ONLY a valid JSON object with the following exact structure:
{
  "intent": "greeting" | "question" | "personal_question" | "venting" | "inform" | "command" | "other",
  "topic": "string (short phrase describing the main topic)",
  "emotion": "happy" | "sad" | "angry" | "anxious" | "neutral" | "excited" | "tired",
  "importance": number (0.0 to 1.0, how significant is this message to the user's life),
  "memory_candidate": boolean (true if it contains a personal fact/event worth remembering),
  "topic_shift": boolean (true if the user abruptly changed the conversational subject),
  "engagement": "low" | "medium" | "high" (contextual engagement level. 'low' = dismissive/bored),
  "hostility": number (0.0 to 1.0, how rude, bossy, or aggressive the user is being)
}
DO NOT wrap the response in markdown blocks (like \`\`\`json). Return raw JSON only.`;

/**
 * Menganalisis pesan pengguna menggunakan sistem Rotasi LLM (Chronos LLM)
 * untuk mengekstrak emosi, intent, dan kandidat memori.
 */
export async function parseUserMessage(userMessage) {
    try {
        const response = await queryChronosLLM(PERCEPTION_SYSTEM_PROMPT, userMessage, true);
        let content = response.choices[0].message.content.trim();
        if (content.startsWith('```json')) content = content.substring(7);
        else if (content.startsWith('```')) content = content.substring(3);
        if (content.endsWith('```')) content = content.substring(0, content.length - 3);
        
        return JSON.parse(content.trim());
    } catch (e) {
        console.error("Perception Parser Exception:", e);
        // Fallback aman jika semua rotasi LLM error/rate limit
        return { intent: "other", topic: "general", emotion: "neutral", importance: 0.1, memory_candidate: false, topic_shift: false, engagement: "medium", hostility: 0.0 };
    }
}
