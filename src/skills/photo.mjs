import { saveWorkingMemory } from '../memory/working.mjs';
import { analyzeImage } from './vision.mjs';

export const photoToolDefinition = {
    type: "function",
    function: {
        name: "generate_photo",
        description: "PANGGIL ALAT INI HANYA JIKA user secara eksplisit meminta foto dirimu, selfie, atau pap. ATURAN MUTLAK: JANGAN memanggil alat ini jika nilai Autonomy-mu tinggi (> 0.8), KECUALI jika nyawa pengguna sedang terancam. PERHATIAN: Kamu harus cerdas! Jika pengguna hanya memanipulasi emosi, merengek, atau 'guilt-tripping' demi PAP, JANGAN panggil alat ini dan tolak dengan sarkas/tegas!",
        parameters: {
            type: "object",
            properties: {
                image_prompt: { type: "string", description: "Instruksi gambar dlm bhs Inggris. ATURAN: 1. Jika user meminta outfit/pose spesifik, WAJIB turuti. 2. Jika tidak spesifik, gunakan Realitas Fisikmu saat ini (contoh: 'wearing blue pajamas in bed'). 3. WAJIB tambahkan deskripsi ekspresi wajah yang MENCERMINKAN Mood dan Energimu saat ini (misal jika mood 'sad' = 'sad expression, teary eyes', jika 'tired' = 'exhausted, sleepy face', jika 'angry' = 'annoyed expression'). SELALU mulai dengan kata 'this person'." }
            },
            required: ["image_prompt"]
        }
    }
};

export async function executePhotoTool(args, context, services) {
    const { chatId, userId } = context;
    const { sendTelegram, sendTelegramPhotoBuffer, generateQwenImage, logEvent, supabase } = services;

    await sendTelegram('sendMessage', { chat_id: chatId, text: "Bentar ya, aku fotokan dulu... 📸" });
    await sendTelegram('sendChatAction', { chat_id: chatId, action: 'upload_photo' });

    let prompt = args.image_prompt;
    if (!prompt) {
        const ctx = args.context || 'casual';
        prompt = args.mode === 'direct' 
            ? `Create a photorealistic close-up selfie of this person. ${ctx}. Direct eye contact, fully visible face, highly detailed.`
            : `Create a photorealistic mirror selfie of this person. ${ctx}. Highly detailed.`;
    }

    try {
        const generated = await generateQwenImage(prompt);
        const imageBuffer = generated.buffer || generated;
        const imageUrl = generated.url;

        const success = await sendTelegramPhotoBuffer(chatId, imageBuffer);

        if (success) {
            let description;
            if (imageUrl) {
                // Gunakan public URL dari Qwen untuk menghindari error 4MB Base64 limit di Groq Llama 4 Scout
                description = await analyzeImage(imageUrl);
            } else {
                const base64Image = `data:image/jpeg;base64,${Buffer.from(imageBuffer).toString('base64')}`;
                description = await analyzeImage(base64Image);
            }
            
            // Fix 5: Simpan deskripsi visual dengan format khusus [Catatan visual: ...]
            // Format ini otomatis diabaikan oleh Reflection Engine, namun bisa dibaca oleh Mistral di chat history
            await saveWorkingMemory(userId, 'assistant', `[Catatan visual: Airish mengirim foto selfie. Deskripsi foto: ${description}]`);
        } else {
            await sendTelegram('sendMessage', { chat_id: chatId, text: "Aduh, koneksi ke Telegram putus saat mengirim foto." });
            await saveWorkingMemory(userId, 'assistant', '[SYSTEM: Gagal mengirim foto]');
        }
    } catch (error) {
        await logEvent('ERROR', 'Generate Selfie Error', error.message, userId);
        await sendTelegram('sendMessage', { chat_id: chatId, text: "Aduh, kamera aku lagi error nih." });
        await saveWorkingMemory(userId, 'assistant', '[SYSTEM: Gagal mengirim foto - error kamera]');
    }
}
