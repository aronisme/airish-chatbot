function getRandomGroqKey() {
    const groqKeys = (process.env.GROQ_KEYS || "").split(',').map(k => k.trim()).filter(Boolean);
    if (groqKeys.length === 0) return "";
    return groqKeys[Math.floor(Math.random() * groqKeys.length)];
}

// --- GROQ VISION AI ---
export async function analyzeImage(imageBase64) {
    const apiKey = getRandomGroqKey();
    if (!apiKey) return "Deskripsi tidak tersedia (GROQ_KEYS tidak ada).";

    const url = "https://api.groq.com/openai/v1/chat/completions";
    const body = {
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: "Tolong deskripsikan foto selfie/pap ini dengan sangat komprehensif dalam bahasa Indonesia. Ceritakan detail yang sangat spesifik meliputi: 1) Pakaian yang dipakai (warna, bentuk potongan baju/celana/pakaian dalam, tekstur/bahan, renda/tali/motif), 2) Pose tubuh dan gestur tangan, 3) Ekspresi wajah dan riasan (makeup), serta 4) Suasana latar belakang (background) tempat foto ini diambil. (Maksimal 4-5 kalimat)" },
                    { type: "image_url", image_url: { url: imageBase64 } }
                ]
            }
        ],
        temperature: 0.2
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            console.error("Groq Vision Error:", await response.text());
            return "Foto yang dikirim tidak jelas.";
        }
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "Gambar tidak diketahui.";
    } catch (error) {
        console.error("Groq Vision Exception:", error);
        return "Terjadi kesalahan saat melihat foto.";
    }
}

// --- GROQ VISION AI (LLaMA 3.2 Backup) ---
export async function analyzeImageWithGroq(imageBase64) {
    const apiKey = getRandomGroqKey();
    if (!apiKey) return "Deskripsi tidak tersedia (GROQ_KEYS tidak ada).";

    const url = "https://api.groq.com/openai/v1/chat/completions";
    const body = {
        model: "llama-3.2-11b-vision-preview",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: "Deskripsikan secara singkat dan detail apa yang terlihat di foto selfie ini. Fokus pada penampilan, pakaian, pose, dan ekspresi wajah. (Maksimal 2 kalimat)" },
                    { type: "image_url", image_url: { url: imageBase64 } }
                ]
            }
        ],
        temperature: 0.2
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            console.error("Groq Vision Error:", await response.text());
            return "Foto yang dikirim tidak jelas.";
        }
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "Gambar tidak dapat dianalisis.";
    } catch (error) {
        console.error("Groq Vision Exception:", error);
        return "Terjadi kesalahan saat melihat foto.";
    }
}
