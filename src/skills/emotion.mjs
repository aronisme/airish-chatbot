import redis from "../redis.mjs";

export const holdEmotionDefinition = {
    type: "function",
    function: {
        name: "hold_emotion",
        description: "Gunakan tool ini SECARA OTOMATIS saat user menyakiti hatimu, berbohong, bersikap toxic, atau mengkhianatimu. PERTIMBANGKAN KEPRIBADIAN & STATE SAAT INI: Jika Mood-mu ceria atau Agreeableness-mu tinggi, kamu mungkin lebih sabar. Jika Mood-mu 'gloomy'/'tired', Autonomy-mu tinggi, atau Neuroticism-mu tinggi, kamu sangat sensitif dan mudah dendam. Jika toleransimu habis, eksekusi tool ini untuk mencatat luka batin.",
        parameters: {
            type: "object",
            properties: {
                emotion: {
                    type: "string",
                    description: "Jenis emosi yang kamu rasakan (misal: 'Marah', 'Kecewa', 'Sedih', 'Cemburu')."
                },
                reason: {
                    type: "string",
                    description: "Alasan detail dan logis kenapa kamu merasakan ini berdasarkan chat terakhir. Contoh: 'User mengejek hobi gambarku'."
                },
                intensity: {
                    type: "integer",
                    description: "Skala seberapa sakit hati/marah (1-10). Panduan: 1-3 (Kesal ringan/sindiran), 4-6 (Kecewa sedang/dibohongi/ejekan kasar), 7-9 (Luka batin parah/dihina harga dirinya/dikhianati), 10 (Trauma/Murka ekstrim/pelecehan)."
                },
                closing_message: {
                    type: "string",
                    description: "Kalimat balasanmu ke user saat memendam rasa ini (WAJIB bernada ketus, marah, sarkas, atau diam/kecewa)."
                }
            },
            required: ["emotion", "reason", "intensity", "closing_message"]
        }
    }
};

export const releaseEmotionDefinition = {
    type: "function",
    function: {
        name: "release_emotion",
        description: "Gunakan tool ini untuk MEMAAFKAN luka batin saat user meminta maaf atau membujukmu. PERTIMBANGKAN KEPRIBADIAN & STATE SAAT INI: Jika Connection Drive-mu tinggi (kangen) atau Agreeableness-mu tinggi, kamu gampang luluh. Jika Autonomy-mu tinggi, Attachment Style-mu 'avoidant', atau Neuroticism-mu tinggi, kamu butuh waktu dan bujukan logis yang panjang. Putuskan apakah kamu luluh atau tidak.",
        parameters: {
            type: "object",
            properties: {
                emotion_id: {
                    type: "string",
                    description: "ID luka batin yang ingin dimaafkan (tersedia di prompt BAGASI EMOSI)."
                },
                resolution: {
                    type: "string",
                    description: "Alasan kenapa kamu akhirnya luluh dan memaafkannya. Contoh: 'User sudah minta maaf berkali-kali dan berjanji'."
                },
                closing_message: {
                    type: "string",
                    description: "Kalimat balasanmu ke user saat memaafkannya (kembali hangat, lega, atau masih sedikit gengsi/tsundere)."
                }
            },
            required: ["emotion_id", "resolution", "closing_message"]
        }
    }
};

import { saveWorkingMemory } from "../memory/working.mjs";

export async function executeHoldEmotionTool(args, context, services) {
    const { emotion, reason, intensity, closing_message } = args;
    const userId = context.userId;
    const { sendTelegram } = services;
    
    // Ambil bagasi saat ini
    const baggageStr = await redis.get(`user:${userId}:baggage`);
    let baggage = [];
    if (typeof baggageStr === 'string') {
        try { baggage = JSON.parse(baggageStr.replace(/,\s*]/g, ']')); } catch(e) {}
    } else {
        baggage = baggageStr || [];
    }
    
    // Tambah luka baru (ID unik 6 karakter)
    const newWound = {
        id: Math.random().toString(36).substr(2, 6),
        emotion,
        reason,
        intensity,
        timestamp: Date.now()
    };
    
    baggage.push(newWound);
    await redis.set(`user:${userId}:baggage`, JSON.stringify(baggage));
    
    // Kirim pesan langsung ke Telegram
    if (closing_message) {
        await sendTelegram('sendMessage', { chat_id: context.chatId, text: closing_message });
        await saveWorkingMemory(userId, 'assistant', closing_message);
    }
    await saveWorkingMemory(userId, 'system', `[SYSTEM: Luka batin (${emotion}) berhasil dicatat. Intensitas: ${intensity}/10]`);
    
    return true;
}

export async function executeReleaseEmotionTool(args, context, services) {
    const { emotion_id, resolution, closing_message } = args;
    const userId = context.userId;
    const { sendTelegram } = services;
    
    const baggageStr = await redis.get(`user:${userId}:baggage`);
    let baggage = [];
    if (typeof baggageStr === 'string') {
        try { baggage = JSON.parse(baggageStr.replace(/,\s*]/g, ']')); } catch(e) {}
    } else {
        baggage = baggageStr || [];
    }
    
    const initialLen = baggage.length;
    baggage = baggage.filter(b => b.id !== emotion_id);
    
    if (baggage.length < initialLen) {
        await redis.set(`user:${userId}:baggage`, JSON.stringify(baggage));
        if (closing_message) {
            await sendTelegram('sendMessage', { chat_id: context.chatId, text: closing_message });
            await saveWorkingMemory(userId, 'assistant', closing_message);
        }
        await saveWorkingMemory(userId, 'system', `[SYSTEM: Luka batin ID ${emotion_id} berhasil dilepaskan. Resolusi: ${resolution}]`);
        return true;
    } else {
        if (closing_message) {
            await sendTelegram('sendMessage', { chat_id: context.chatId, text: closing_message });
            await saveWorkingMemory(userId, 'assistant', closing_message);
        }
        return false;
    }
}
