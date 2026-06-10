import { json, optionsResponse, readJson, vercelHandler } from "../src/http.mjs";
import { createClient } from "@supabase/supabase-js";
import { AI_TOOLS, executeTool, analyzeImage } from "../src/skills/index.mjs";
import { getWorkingMemory, saveWorkingMemory, getSoulState, saveSoulState } from "../src/memory/working.mjs";
import { getSemanticMemory } from "../src/memory/semantic.mjs";
import { parseUserMessage } from "../src/perception/parser.mjs";
import { calculateSoulState } from "../src/soul/engine.mjs";
import { buildContext } from "../src/context/builder.mjs";
import { retrieveEpisodicMemories } from "../src/memory/episodic.mjs";
import { runReflectionEngine } from "../src/soul/reflection.mjs";
import redis from "../src/redis.mjs";

// --- KONFIGURASI SUPABASE ---
const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "dummy_key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- KONFIGURASI BOT ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const DEFAULT_REF_IMAGE = "https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png";

// --- LOGGER ---
async function logEvent(level, event, details, telegram_id = null) {
    try {
        await supabase.from('bot_logs').insert({
            level,
            event,
            details,
            telegram_id
        });
        console.log(`[${level}] ${event} - ${details}`);
    } catch (e) {
        console.error("Gagal menyimpan log:", e);
    }
}

// --- TELEGRAM API ---
function formatTelegramHTML(text) {
    if (!text) return text;
    let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<b>$1</b>');
    html = html.replace(/\*([\s\S]*?)\*/g, '<i>$1</i>');
    html = html.replace(/__([\s\S]*?)__/g, '<u>$1</u>');
    html = html.replace(/(^|\s)_([\s\S]*?)_(\s|$)/g, '$1<i>$2</i>$3');
    html = html.replace(/`([\s\S]*?)`/g, '<code>$1</code>');
    return html;
}

async function sendTelegram(method, payload) {
    if (method === 'sendMessage' && payload.text && !payload.parse_mode) {
        payload.text = formatTelegramHTML(payload.text);
        payload.parse_mode = 'HTML';
    }
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store'
        });
        const data = await response.json();
        await logEvent('INFO', `Telegram API Res (${method})`, JSON.stringify(data));
        return data;
    } catch (error) {
        await logEvent('ERROR', 'Telegram Fetch Exception', `Method: ${method}, Err: ${error.message}`);
        return null;
    }
}

async function sendTelegramPhotoBuffer(chatId, buffer) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('photo', new Blob([buffer], { type: 'image/jpeg' }), 'selfie.jpg');

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });
        return response.ok;
    } catch (error) {
        await logEvent('ERROR', 'Telegram Photo Upload Exception', `Err: ${error.message}`);
        return false;
    }
}

// AI_TOOLS dipindahkan ke src/skills/index.mjs

// --- MISTRAL AI ---
const mistralKeys = (process.env.MISTRAL_KEYS || "").split(',').map(k => k.trim()).filter(Boolean);
function getRandomMistralKey() {
    if (mistralKeys.length === 0) return "";
    return mistralKeys[Math.floor(Math.random() * mistralKeys.length)];
}

async function queryMistral(systemPrompt, history, userMessage, toolResponseMessages = null) {
    const url = "https://api.mistral.ai/v1/chat/completions";
    const apiKey = getRandomMistralKey();

    let messages = toolResponseMessages;
    if (!messages) {
        messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(h => ({
                role: h.role === 'user' ? 'user' : 'assistant',
                content: h.content
            })),
            { role: 'user', content: userMessage }
        ];
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const body = {
        model: "mistral-large-latest",
        messages,
    };
    if (!toolResponseMessages) {
        body.tools = AI_TOOLS;
        body.tool_choice = "auto";
    }

    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Mistral Error: ${response.status} - ${await response.text()}`);
    return response.json();
}

// --- QWEN TEXT AI ---
async function queryQwen(systemPrompt, history, userMessage, toolResponseMessages = null) {
    const apiKey = process.env.QWEN_API_KEY || 'sk-ws-H.ILHDHP.fakn.MEYCIQDGQZgkorFTHh9mN1IlzQTeZ8zRIs6mpfQd9UiznuGVOgIhAKIPOHid-8zDdxd5uk0Fpz70IajHWahhfqgiFvq6NL1m';
    const url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

    let messages = toolResponseMessages;
    if (!messages) {
        messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(h => ({
                role: h.role === 'user' ? 'user' : 'assistant',
                content: h.content
            })),
            { role: 'user', content: userMessage }
        ];
    }

    const body = {
        model: "qwen-plus",
        messages,
    };
    if (!toolResponseMessages) {
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

// analyzeImage dipindahkan ke src/skills/vision.mjs

// --- AI FALLBACK SYSTEM ---
async function queryLLMWithFallback(systemPrompt, history, userMessage, toolResponseMessages = null) {
    try {
        await logEvent('INFO', 'AI Request', `Mengirim request ke Mistral Large.`);
        return await queryMistral(systemPrompt, history, userMessage, toolResponseMessages);
    } catch (error) {
        await logEvent('WARN', 'Mistral Failed, Fallback to Qwen', error.message);
        return await queryQwen(systemPrompt, history, userMessage, toolResponseMessages);
    }
}

// --- QWEN IMAGE AI (ALIBABA DASHSCOPE) ---
async function generateQwenImage(prompt) {
    const apiKey = process.env.QWEN_API_KEY || 'sk-ws-H.ILHDHP.fakn.MEYCIQDGQZgkorFTHh9mN1IlzQTeZ8zRIs6mpfQd9UiznuGVOgIhAKIPOHid-8zDdxd5uk0Fpz70IajHWahhfqgiFvq6NL1m';
    const host = 'https://ws-9eq65lbzoayak8np.ap-southeast-1.maas.aliyuncs.com';
    const endpoint = `${host}/api/v1/services/aigc/multimodal-generation/generation`;
    const refImageUrl = 'https://fatsproxyai.vercel.app/airish.jpg';

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "qwen-image-edit",
            input: {
                messages: [
                    {
                        role: "user",
                        content: [
                            { image: refImageUrl },
                            { text: prompt }
                        ]
                    }
                ]
            },
            parameters: {
                size: "1024*1024",
                n: 1
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qwen AI Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const results = data.output?.choices || data.output?.results;
    if (results && results.length > 0) {
        const content = results[0].message?.content;
        let imageUrl = null;
        
        if (Array.isArray(content)) {
            const imgBlock = content.find(c => c.image);
            if (imgBlock) imageUrl = imgBlock.image;
        }

        if (imageUrl) {
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) throw new Error("Failed to download generated image from Qwen");
            return await imgRes.arrayBuffer();
        }
    }
    throw new Error("Gambar tidak ditemukan di dalam respons Qwen");
}

// --- MAIN PROCESSOR ---
async function processMessage(body) {
    if (!body.message) return;
    
    let text = body.message.text || body.message.caption || "";
    const photoInfo = body.message.photo;
    
    if (!text && !photoInfo) {
        await logEvent('WARN', 'Webhook Message Ignored', 'Bukan pesan teks atau foto.');
        return;
    }
    
    const chatId = body.message.chat.id;
    const userId = body.message.from.id;

    if (photoInfo && photoInfo.length > 0) {
        await sendTelegram('sendMessage', { chat_id: chatId, text: "Bentar ya, aku perhatikan dulu fotonya... 👁️" });
        await sendTelegram('sendChatAction', { chat_id: chatId, action: 'typing' });

        try {
            const photo = photoInfo[photoInfo.length - 1]; // Resolusi tertinggi
            const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${photo.file_id}`);
            const fileData = await fileRes.json();
            if (fileData.ok) {
                const imageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
                const imgRes = await fetch(imageUrl);
                const arrayBuffer = await imgRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const imageBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                
                const description = await analyzeImage(imageBase64);
                text = `[Pengguna mengirim foto: ${description}]. ${text}`;
                await logEvent('INFO', 'Vision AI Success', `Melihat gambar: ${description}`, userId);
            }
        } catch (e) {
            await logEvent('ERROR', 'Vision AI Failed', e.message, userId);
            text = `[Pengguna mengirim foto, tapi kamu gagal melihatnya]. ${text}`;
        }
    }

    await logEvent('INFO', 'Message Received', `Dari user ${userId}: "${text}"`, userId);

    try {
        await sendTelegram('sendChatAction', { chat_id: chatId, action: 'typing' });

        // 1. Registrasi & Ambil Data User (Timezone)
        await logEvent('INFO', 'Supabase Fetch User', `telegram_id: ${userId}`, userId);
        let { data: userData } = await supabase.from('users').select('*').eq('telegram_id', userId).single();
        if (!userData) {
            const { data: newUser } = await supabase.from('users').insert({ telegram_id: userId }).select().single();
            userData = newUser || { timezone: 'Asia/Jakarta' };
        }
        
        const userTimezone = userData.timezone || 'Asia/Jakarta';
        const currentTime = new Date().toLocaleString('id-ID', { 
            timeZone: userTimezone, 
            dateStyle: 'full', 
            timeStyle: 'short' 
        });
        
        let { data: persona } = await supabase.from('personas').select('*').eq('telegram_id', userId).single();
        
        let refImage = DEFAULT_REF_IMAGE;
        if (persona && persona.reference_image_url) {
            refImage = persona.reference_image_url;
            await logEvent('INFO', 'Persona Loaded', `Menggunakan Persona: ${persona.name}`, userId);
        }

        // 2. Ambil Chat History & Long Term Memory
        const history = await getWorkingMemory(userId, 10);
        let memoryString = await getSemanticMemory(supabase, userId);
        
        const episodicMemories = await retrieveEpisodicMemories(supabase, userId, text);
        if (episodicMemories) {
            memoryString = (memoryString || "") + "\n\n[MEMORI MASA LALU YANG RELEVAN]\n" + episodicMemories;
        }
        
        // Simpan pesan user
        await saveWorkingMemory(userId, 'user', text);

        // --- SOUL ENGINE PROCESSING (Perception & State) ---
        const currentState = await getSoulState(userId);
        const perception = await parseUserMessage(text);
        const newState = calculateSoulState(currentState, perception);
        await saveSoulState(userId, newState);
        
        await logEvent('INFO', 'Soul State Updated', `Mood: ${newState.mood}, Energy: ${newState.energy}, Emotion Detected: ${perception.emotion}`, userId);

        // --- CONTEXT BUILDER ---
        const relationship = userData.relationship || null;
        const systemPrompt = buildContext({ 
            persona, 
            currentTime, 
            userTimezone, 
            relationship, 
            memoryString, 
            soulState: newState 
        });

        // 3. Panggil AI (Qwen with Mistral Fallback)
        const aiRes = await queryLLMWithFallback(systemPrompt, history || [], text);
        const choice = aiRes.choices?.[0];
        const message = choice?.message;

        // 4. Handle Tools
        if (message?.tool_calls && message.tool_calls.length > 0) {
            const toolCall = message.tool_calls[0];
            const callName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            
            await logEvent('INFO', 'AI Tool Triggered', `Memanggil Tool: ${callName}`, userId);
            
            const context = { chatId, userId, history: history || [], systemPrompt, text, toolCall, message };
            const services = { sendTelegram, sendTelegramPhotoBuffer, generateQwenImage, logEvent, supabase, queryLLMWithFallback };
            
            await executeTool(callName, args, context, services);
        } else {
            const replyText = message?.content || "Maaf, aku tidak mengerti.";
            
            // Pisahkan pesan berdasarkan karakter pipe "|" agar menjadi banyak bubble chat
            let bubbles = replyText.split('|').map(b => b.trim()).filter(b => b.length > 0);
            
            // FALLBACK: Jika AI bandel membalas paragraf panjang tanpa pipe, paksa pecah per kalimat!
            if (bubbles.length === 1 && replyText.length > 120) {
                // Memecah berdasarkan titik/tanya/seru yang diikuti spasi
                bubbles = replyText.split(/(?<=[.?!])\s+/).map(b => b.trim()).filter(b => b.length > 0);
            }
            
            for (const bubble of bubbles) {
                // Tampilkan status "typing" sejenak sebelum mengirim bubble selanjutnya
                await sendTelegram('sendChatAction', { chat_id: chatId, action: 'typing' });
                
                // Jeda dinamis berdasarkan panjang teks (antara 0.5s - 2s) agar natural
                const typingDelay = Math.min(2000, Math.max(500, bubble.length * 30));
                await new Promise(resolve => setTimeout(resolve, typingDelay));
                
                await sendTelegram('sendMessage', { chat_id: chatId, text: bubble });
            }
            
            // Simpan ke memory sebagai satu kesatuan utuh
            await saveWorkingMemory(userId, 'assistant', replyText);
        }

        // --- REFLECTION ENGINE ---
        // Dijalankan setelah merespons user (Aman dalam limit 60 detik)
        const recentHistory = await getWorkingMemory(userId, 6);
        await runReflectionEngine(supabase, userId, recentHistory);

    } catch (error) {
        await logEvent('ERROR', 'Process Message Exception', `Err: ${error.message}`, userId);
    }
}

// --- MAIN HANDLER ---
async function handler(event) {
    if (event.httpMethod === "OPTIONS") return optionsResponse();

    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret) {
        const receivedSecret = event.headers["x-telegram-bot-api-secret-token"] || (event.queryStringParameters && event.queryStringParameters.secret);
        if (receivedSecret !== webhookSecret) {
            return json(401, { ok: false, error: "Invalid webhook secret" });
        }
    }

    const body = readJson(event);
    const updateId = body.update_id;
    
    // --- DEDUPLICATION MECHANISM ---
    // Mencegah Telegram mengirim ulang webhook jika respon agak lambat (karena ngetik & reflection)
    if (redis && updateId) {
        const lockKey = `lock:update:${updateId}`;
        const isNew = await redis.setnx(lockKey, "1");
        if (!isNew) {
            console.log(`[Deduplication] Mengabaikan duplicate webhook update_id: ${updateId}`);
            return json(200, { ok: true, note: "Duplicate ignored" });
        }
        // Kunci bertahan 1 jam, cukup untuk mencegah retry dari Telegram
        await redis.expire(lockKey, 3600);
    }

    await logEvent('INFO', 'Webhook Invoked', `Payload update_id: ${updateId}`);

    await processMessage(body);

    return json(200, { ok: true });
}

export const maxDuration = 60;
export default vercelHandler(handler);
