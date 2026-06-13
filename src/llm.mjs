// src/llm.mjs
import { AI_TOOLS } from "./skills/index.mjs";

const mistralKeys = (process.env.MISTRAL_KEYS || "").split(',').map(k => k.trim()).filter(Boolean);

function getRandomMistralKey() {
    if (mistralKeys.length === 0) return "";
    return mistralKeys[Math.floor(Math.random() * mistralKeys.length)];
}

export async function queryMistral(systemPrompt, history = [], userMessage = "", toolResponseMessages = null, jsonMode = false) {
    const url = "https://api.mistral.ai/v1/chat/completions";
    const apiKey = getRandomMistralKey();

    let messages = toolResponseMessages;
    if (!messages) {
        messages = [{ role: 'system', content: systemPrompt }];
        if (history && history.length > 0) {
            messages.push(...history.map(h => ({
                role: h.role === 'user' ? 'user' : 'assistant',
                content: h.content
            })));
        }
        if (userMessage) {
            messages.push({ role: 'user', content: userMessage });
        }
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const body = {
        model: "mistral-large-latest",
        messages,
    };
    
    if (jsonMode) {
        body.response_format = { type: "json_object" };
    } else if (!toolResponseMessages && AI_TOOLS) {
        body.tools = AI_TOOLS;
        body.tool_choice = "auto";
    }

    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Mistral Error: ${response.status} - ${await response.text()}`);
    return response.json();
}

export async function queryQwen(systemPrompt, history = [], userMessage = "", toolResponseMessages = null, jsonMode = false) {
    const apiKey = process.env.QWEN_API_KEY || 'sk-ws-H.ILHDHP.fakn.MEYCIQDGQZgkorFTHh9mN1IlzQTeZ8zRIs6mpfQd9UiznuGVOgIhAKIPOHid-8zDdxd5uk0Fpz70IajHWahhfqgiFvq6NL1m';
    const url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

    let messages = toolResponseMessages;
    if (!messages) {
        messages = [{ role: 'system', content: systemPrompt }];
        if (history && history.length > 0) {
            messages.push(...history.map(h => ({
                role: h.role === 'user' ? 'user' : 'assistant',
                content: h.content
            })));
        }
        if (userMessage) {
            messages.push({ role: 'user', content: userMessage });
        }
    }

    const body = {
        model: "qwen-turbo", // Use a fast and cheap model for Qwen
        messages,
    };
    
    if (jsonMode) {
        body.response_format = { type: "json_object" };
    } else if (!toolResponseMessages && AI_TOOLS) {
        body.tools = AI_TOOLS;
        body.tool_choice = "auto";
    }

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Qwen Text Error: ${response.status} - ${await response.text()}`);
    return response.json();
}

export async function queryLLMWithFallback(systemPrompt, history = [], userMessage = "", toolResponseMessages = null, jsonMode = false, logger = null) {
    try {
        if(logger) await logger('INFO', 'AI Request', `Mengirim request ke Mistral Large. JSON: ${jsonMode}`);
        return await queryMistral(systemPrompt, history, userMessage, toolResponseMessages, jsonMode);
    } catch (error) {
        if(logger) await logger('WARN', 'Mistral Failed, Fallback to Qwen', error.message);
        return await queryQwen(systemPrompt, history, userMessage, toolResponseMessages, jsonMode);
    }
}

// --- GROQ (Qwen3-32B) untuk tugas background ringan (Chronos) ---
const groqKeys = (process.env.GROQ_KEYS || "").split(',').map(k => k.trim()).filter(Boolean);

function getRandomGroqKey() {
    if (groqKeys.length === 0) return "";
    return groqKeys[Math.floor(Math.random() * groqKeys.length)];
}

export async function queryGroq(systemPrompt, userMessage = "", jsonMode = false, modelName = "llama-3.3-70b-versatile") {
    const apiKey = getRandomGroqKey();
    const url = "https://api.groq.com/openai/v1/chat/completions";

    const messages = [
        { role: 'system', content: systemPrompt },
    ];
    if (userMessage) {
        messages.push({ role: 'user', content: userMessage });
    }

    const body = {
        model: modelName,
        messages,
    };
    if (jsonMode) {
        body.response_format = { type: "json_object" };
    }

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Groq Error: ${response.status} - ${await response.text()}`);
    return response.json();
}

/**
 * LLM khusus untuk Chronos Engine (background tasks).
 * Rotasi model untuk mencegah rate limit dan down time.
 */
export async function queryChronosLLM(systemPrompt, userMessage = "", jsonMode = false) {
    const providers = ['groq_llama', 'qwen_turbo', 'groq_gemma'];
    let startIndex = Math.floor(Math.random() * providers.length);
    let lastError = null;

    for (let i = 0; i < providers.length; i++) {
        const provider = providers[(startIndex + i) % providers.length];
        console.log(`[CHRONOS LLM] Mencoba provider: ${provider}...`);
        
        try {
            if (provider === 'groq_llama') {
                return await queryGroq(systemPrompt, userMessage, jsonMode, "llama-3.3-70b-versatile");
            } else if (provider === 'groq_gemma') {
                return await queryGroq(systemPrompt, userMessage, jsonMode, "llama-3.1-8b-instant");
            } else if (provider === 'qwen_turbo') {
                return await queryQwen(systemPrompt, [], userMessage, null, jsonMode);
            }
        } catch (error) {
            console.warn(`[CHRONOS LLM] Provider ${provider} gagal: ${error.message}`);
            lastError = error;
        }
    }

    throw new Error(`Semua provider Chronos LLM gagal! Error terakhir: ${lastError?.message}`);
}
