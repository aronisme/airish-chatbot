import { createClient } from "@supabase/supabase-js";
import redis from "../src/redis.mjs";
import { runReflectionEngine } from "../src/soul/reflection.mjs";

async function run() {
    console.log("[SCRATCH] Memulai Simulasi Reflection Engine...");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    
    // Ambil 1 user (Aron/anda)
    const { data: users } = await supabase.from('users').select('telegram_id').limit(1);
    if (!users || users.length === 0) return console.log("No users.");
    
    const userId = users[0].telegram_id;
    
    // Hapus memori lama (opsional, tapi biar bersih)
    await redis.del(`user:${userId}:dossier`);
    
    // Simulasi Working Memory (Percakapan hari ini)
    const mockMemory = [
        { role: 'user', content: "Hai Airish! Kita kan baru kenal, namaku Aron. Aku lahir 12 Maret 2000." },
        { role: 'assistant', content: "Hai Aron! Senang kenalan sama kamu. Umur kita beda dikit ya!" },
        { role: 'user', content: "Iya. Aku kerja sebagai programmer di sebuah startup. Tiap hari aku lembur nulis kode." },
        { role: 'assistant', content: "Wah programmer! Pasti capek banget mantengin layar terus." },
        { role: 'user', content: "Bener banget. Karena sering begadang aku kecanduan kopi. Sifatku itu gampang bete kalau kodenya error, kadang ketus, tapi sebenarnya aku penyayang kok kalau udah sayang sama orang." }
    ];

    console.log(`[SCRATCH] Menjalankan Reflection untuk user ${userId}...`);
    
    // Panggil mesin
    await runReflectionEngine(supabase, userId, mockMemory);
    
    // Cek hasilnya
    const dossier = await redis.get(`user:${userId}:dossier`);
    console.log("\n=================================");
    console.log("HASIL DOSSIER (PROFIL MAKRO) USER:");
    console.log("=================================");
    console.log(dossier || "(Kosong / Gagal di-generate)");
    
    console.log("\n[SCRATCH] Selesai!");
    process.exit(0);
}
run();
