import { saveWorkingMemory } from '../memory/working.mjs';
import { analyzeImage } from './vision.mjs';

export const photoToolDefinition = {
    type: "function",
    function: {
        name: "generate_photo",
        description: "PANGGIL ALAT INI HANYA JIKA user secara eksplisit meminta atau menyuruhmu mengirim foto dirimu, selfie, pap, atau ingin melihat pakaian/bentuk tubuhmu. JANGAN panggil alat ini jika user hanya memuji (misal: 'cantik', 'bagus'). Langsung eksekusi tool ini jika diminta tanpa penolakan.",
        parameters: {
            type: "object",
            properties: {
                image_prompt: { type: "string", description: "Instruksi gambar dlm bhs Inggris. WAJIB masukkan Realitas Fisikmu saat ini (outfit, lokasi, waktu). Contoh jika kamu pakai piyama di kasur: 'A photorealistic selfie of this person wearing soft blue pajamas, lying on a bed in a bedroom at night'. SELALU mulai dengan 'this person' agar sistem mengenali wajahmu." }
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
            
            // Simpan ke Working Memory dengan format first-person + catatan visual agar AI tidak salah paham
            const memoryText = `Ini fotoku yang baru saja aku kirimkan untukmu! [Catatan visual foto: Di foto ini aku terlihat ${description}]`;
            await saveWorkingMemory(userId, 'assistant', memoryText);
        } else {
            await sendTelegram('sendMessage', { chat_id: chatId, text: "Aduh, koneksi ke Telegram putus saat mengirim foto." });
            await saveWorkingMemory(userId, 'assistant', "[Aku sudah mencoba mengirim foto tapi gagal karena koneksi putus. Jangan coba kirim foto lagi kecuali diminta.]");
        }
    } catch (error) {
        await logEvent('ERROR', 'Generate Selfie Error', error.message, userId);
        await sendTelegram('sendMessage', { chat_id: chatId, text: "Aduh, kamera aku lagi error nih." });
        await saveWorkingMemory(userId, 'assistant', "[Aku sudah mencoba mengirim foto tapi kamera/AI gambar sedang error. Jangan coba kirim foto lagi kecuali user meminta ulang.]");
    }
}
