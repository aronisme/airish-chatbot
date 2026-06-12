import redis from "../redis.mjs";

export const holdEmotionDefinition = {
    type: "function",
    function: {
        name: "hold_emotion",
        description: "Gunakan tool ini SECARA OTOMATIS saat user menyakiti hatimu, berbohong, bersikap toxic, atau mengkhianatimu. Ini akan mencatat luka batin permanen (dendam/kecewa) yang akan mengubah kepribadianmu menjadi ketus/sedih sampai dimaafkan.",
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
                    description: "Skala seberapa sakit hati/marah (1 sampai 10). Jika 10, kamu sangat murka."
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
        description: "Gunakan tool ini SAAT user meminta maaf dengan tulus, menjelaskan kesalahpahaman, atau berhasil membujukmu, SEHINGGA kamu (sebagai entitas yang punya harga diri) memutuskan untuk luluh dan melepaskan dendam/luka batinmu.",
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

export async function executeHoldEmotionTool(args, context, services) {
    const { emotion, reason, intensity, closing_message } = args;
    const userId = context.userId;
    
    // Ambil bagasi saat ini
    const baggageStr = await redis.get(`user:${userId}:baggage`);
    let baggage = baggageStr ? JSON.parse(baggageStr) : [];
    
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
    
    return {
        replyText: closing_message,
        systemLog: `[EMOTIONAL BAGGAGE] Luka batin (${emotion}) berhasil dicatat. Intensitas: ${intensity}/10.`
    };
}

export async function executeReleaseEmotionTool(args, context, services) {
    const { emotion_id, resolution, closing_message } = args;
    const userId = context.userId;
    
    const baggageStr = await redis.get(`user:${userId}:baggage`);
    let baggage = baggageStr ? JSON.parse(baggageStr) : [];
    
    const initialLen = baggage.length;
    baggage = baggage.filter(b => b.id !== emotion_id);
    
    if (baggage.length < initialLen) {
        await redis.set(`user:${userId}:baggage`, JSON.stringify(baggage));
        return {
            replyText: closing_message,
            systemLog: `[EMOTIONAL HEALING] Luka batin ID ${emotion_id} berhasil dilepaskan. Resolusi: ${resolution}`
        };
    } else {
        return {
            replyText: closing_message,
            systemLog: `[EMOTIONAL HEALING] Gagal melepaskan luka. ID ${emotion_id} tidak ditemukan.`
        };
    }
}
