import redis from "../src/redis.mjs";
import chronos from "../api/chronos.js";

async function run() {
    console.log("[SCRATCH] Menghapus agenda lama di Redis...");
    await redis.del('soul:chronos:agenda');
    
    console.log("[SCRATCH] Menjalankan Chronos (Pulse)...");
    const req = {method: 'POST', headers: {}, body: {}};
    const res = {status: () => res, send: () => {}};
    
    try {
        await chronos(req, res);
    } catch(e) {
        console.error(e);
    }
    
    console.log("\n=================================");
    console.log("HASIL AGENDA BARU:");
    const newAgenda = await redis.get('soul:chronos:agenda');
    console.log(newAgenda);
    console.log("=================================");
    
    console.log("[SCRATCH] Selesai!");
    process.exit(0);
}
run();
