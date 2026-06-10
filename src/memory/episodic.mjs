// src/memory/episodic.mjs

const mistralKeys = (process.env.MISTRAL_KEYS || process.env.MISTRAL_API_KEY || "").split(',').map(k => k.trim()).filter(Boolean);

function getRandomMistralKey() {
    if (mistralKeys.length === 0) return "";
    return mistralKeys[Math.floor(Math.random() * mistralKeys.length)];
}

/**
 * Menghasilkan Vektor Embedding menggunakan model Mistral.
 * Model ini menghasilkan dimensi 1024 yang cocok dengan pgvector kita.
 */
export async function getMistralEmbedding(text) {
    const apiKey = getRandomMistralKey();
    if (!apiKey) throw new Error("MISTRAL_KEYS tidak tersedia untuk fitur Embedding.");
    
    const response = await fetch("https://api.mistral.ai/v1/embeddings", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "mistral-embed",
            input: [text]
        })
    });
    
    if (!response.ok) {
        throw new Error(`Mistral Embedding Error: ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.data[0].embedding;
}

/**
 * Sistem RAG (Retrieval-Augmented Generation).
 * Mencari memori masa lalu yang paling relevan dengan pesan user saat ini.
 */
export async function retrieveEpisodicMemories(supabase, userId, currentMessage, threshold = 0.5, limit = 3) {
    try {
        const embedding = await getMistralEmbedding(currentMessage);
        
        // Memanggil fungsi SQL yang telah kita buat di Supabase
        const { data, error } = await supabase.rpc('match_episodic_memories', {
            query_embedding: embedding,
            match_threshold: threshold,
            match_count: limit,
            user_id: userId
        });
        
        if (error) {
            console.error("RAG Retrieval Error:", error);
            return null;
        }
        
        if (!data || data.length === 0) return null;
        
        // Format hasilnya agar bisa dibaca LLM
        return data.map(m => `- Kejadian: ${m.event_text} (Emosi: ${m.emotion})`).join('\n');
    } catch (e) {
        console.error("retrieveEpisodicMemories Exception:", e);
        return null;
    }
}

/**
 * Menyimpan memori baru beserta vektor semantiknya.
 */
export async function saveEpisodicMemory(supabase, userId, eventText, emotion) {
    try {
        const embedding = await getMistralEmbedding(eventText);
        
        await supabase.from('episodic_memories').insert({
            telegram_id: userId,
            event_text: eventText,
            emotion: emotion,
            embedding: embedding
        });
    } catch (e) {
        console.error("saveEpisodicMemory Exception:", e);
    }
}
