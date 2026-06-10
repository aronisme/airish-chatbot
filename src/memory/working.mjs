import { Redis } from '@upstash/redis';

// Inisialisasi Upstash Redis Client
// Gunakan || '' agar tidak error saat build time jika env belum di-set
const redis = new Redis({
  url: (process.env.UPSTASH_REDISV2_REST_URL || 'https://dummy.upstash.io').trim(),
  token: (process.env.UPSTASH_REDISV2_REST_TOKEN || 'dummy').trim(),
});

/**
 * Mengambil histori percakapan terakhir (Working Memory) dari Redis.
 * Karena kita menggunakan RPUSH, pesan terlama ada di kiri (index 0) 
 * dan terbaru di kanan. lrange(key, -limit, -1) mengambil limit pesan terakhir.
 */
export async function getWorkingMemory(userId, limit = 10) {
    const key = `user:${userId}:working_memory`;
    try {
        const history = await redis.lrange(key, -limit, -1);
        // Upstash Redis SDK otomatis mem-parsing JSON strings kembali ke Object
        return history || [];
    } catch (e) {
        console.error("Redis Get Working Memory Error:", e);
        return [];
    }
}

/**
 * Menyimpan satu pesan ke dalam Working Memory (Redis)
 * Membatasi ukuran list maksimal 20 pesan.
 */
export async function saveWorkingMemory(userId, role, content) {
    const key = `user:${userId}:working_memory`;
    const message = { role, content };
    
    try {
        await redis.rpush(key, JSON.stringify(message));
        await redis.ltrim(key, -20, -1); // Simpan maksimal 20 pesan terakhir saja
    } catch (e) {
        console.error("Redis Save Working Memory Error:", e);
    }
}

/**
 * Mengambil Soul State (kondisi mental volatil seperti energy dan mood)
 * Beserta mekanisme Emotional Decay (Pemulihan energi berdasarkan waktu)
 */
export async function getSoulState(userId) {
    const key = `user:${userId}:soul_state`;
    try {
        const stateStr = await redis.get(key);
        if (!stateStr) return { mood: 'calm', energy: 100, last_updated: Date.now() };

        // Upstash Redis bisa mengembalikan object langsung atau string JSON
        let state = typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
        
        // --- EMOTIONAL DECAY MECHANISM ---
        const now = Date.now();
        const lastUpdated = state.last_updated || now;
        const minutesPassed = Math.floor((now - lastUpdated) / 60000);

        if (minutesPassed > 0) {
            // Pulihkan 1 energi setiap 1 menit berlalu
            state.energy = Math.min(100, state.energy + minutesPassed);
            
            // Jika sudah lewat 30 menit tanpa pesan, mood kembali calm secara natural
            if (minutesPassed > 30) {
                state.mood = 'calm';
            }
        }
        
        // Selalu perbarui timestamp tiap kali state ditarik
        state.last_updated = now;
        return state;

    } catch (e) {
        console.error("Redis Get Soul State Error:", e);
        return { mood: 'calm', energy: 100, last_updated: Date.now() };
    }
}

/**
 * Menyimpan pembaruan Soul State
 */
export async function saveSoulState(userId, state) {
    const key = `user:${userId}:soul_state`;
    try {
        state.last_updated = Date.now();
        await redis.set(key, JSON.stringify(state));
    } catch (e) {
        console.error("Redis Save Soul State Error:", e);
    }
}
