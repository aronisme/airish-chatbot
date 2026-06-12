import redis from '../src/redis.mjs';
import { json, vercelHandler } from "../src/http.mjs";
import { createClient } from "@supabase/supabase-js";
import { queryChronosLLM, queryLLMWithFallback } from "../src/llm.mjs";

const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "dummy_key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function handler(event) {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
        return json(405, { error: 'Method not allowed' });
    }

    const now = new Date();

    // --- MENCATAT TRIGGER KE DALAM gas.html ---
    try {
        const logEntry = {
            type: 'incoming',
            timestamp: now.toISOString(),
            headers: event.headers,
            body: event.body || {},
            query: event.queryStringParameters || {},
            note: "Chronos Triggered by GAS"
        };
        await redis.lpush('gas:testing:logs', JSON.stringify(logEntry));
        await redis.ltrim('gas:testing:logs', 0, 49);
    } catch (err) {
        console.error("Failed to log for gas.html", err);
    }

    // Cek setting untuk timezone / base city
    const { data: persona } = await supabase.from('personas').select('*').limit(1).single();
    const settings = persona ? {
        proactive: persona.proactive ?? true,
        homeCity: persona.home_city || "Jakarta",
        personaName: persona.name || "Airish",
        personaArchetype: persona.archetype || "Gadis ceria",
        personaCraft: persona.craft || "Mahasiswi"
    } : { proactive: true, homeCity: "Jakarta" };

    const hour = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false });
    const currentHour = parseInt(hour, 10);
    const dateStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", dateStyle: "full" });
    const timeStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", timeStyle: "short" });

    let timeOfDay = "Siang";
    if (currentHour >= 0 && currentHour < 5) timeOfDay = "Dini Hari";
    else if (currentHour >= 5 && currentHour < 10) timeOfDay = "Pagi";
    else if (currentHour >= 10 && currentHour < 15) timeOfDay = "Siang";
    else if (currentHour >= 15 && currentHour < 18) timeOfDay = "Sore";
    else if (currentHour >= 18 && currentHour <= 23) timeOfDay = "Malam";

    // Mengambil Cuaca Asli secara Real-Time (Tanpa API Key, Cache 1 Jam di Redis)
    let weather = "Cerah"; 
    try {
        let cachedWeather = await redis.get('soul:chronos:weather');
        if (cachedWeather) {
            weather = cachedWeather;
        } else {
            const city = encodeURIComponent(settings.homeCity || "Jakarta");
            // %C = Kondisi (Clear, Rain), %t = Temperatur (+28°C), m = Metrik, lang=id = Indonesia
            const weatherRes = await fetch(`https://wttr.in/${city}?format=%C+%t&m&lang=id`);
            if (weatherRes.ok) {
                weather = await weatherRes.text();
                await redis.set('soul:chronos:weather', weather, { ex: 3600 }); // Simpan 1 jam agar tidak spam API
            }
        }
    } catch (e) {
        console.error("Gagal mengambil cuaca:", e);
    }
    
    // TAHAP 5: The Morning Routine (Bikin Jadwal jam 06:00)
    let agendaStr = await redis.get('soul:chronos:agenda');
    let agenda = agendaStr ? (typeof agendaStr === 'string' ? JSON.parse(agendaStr) : agendaStr) : null;
    
    // Tentukan kapan dia bangun hari ini berdasarkan jadwal kemarin
    const expectedWakeTime = agenda && agenda.wake_time !== undefined ? agenda.wake_time : 6;
    let isMorning = (!agenda || agenda.date !== dateStr) && currentHour >= expectedWakeTime;

    if (isMorning || !agenda) {
        console.log("[CHRONOS] Running Morning Routine to generate agenda...");
        const prompt = `Buatlah jadwal harian (timeline kegiatan) yang realistis untuk hari ini (${dateStr}). 
Namamu: ${settings.personaName || 'Airish'}. Sifat: ${settings.personaArchetype || 'Gadis ceria'}. Pekerjaan: ${settings.personaCraft || 'Mahasiswi'}.
Buatlah setidaknya 4-5 aktivitas utama beserta perkiraan jamnya (contoh: ["09:00 - Rapat Klien", "13:00 - Makan siang di luar", "15:00 - Nugas", "20:00 - Nonton Netflix"]).
Tentukan juga pakaian (outfit) awal apa yang kamu kenakan pagi ini.
Terakhir, tentukan jam berapa kamu berencana tidur malam ini (sleep_time, angka 0-23) dan jam berapa kamu bangun besok pagi (wake_time, angka 0-23).
Kembalikan HANYA dalam format JSON dengan key: "agenda" (array of strings berisi jadwal jam-jaman), "outfit" (string singkat), "sleep_time" (integer), dan "wake_time" (integer).`;
        
        try {
            const llmRes = await queryChronosLLM(prompt, "", true);
            let content = llmRes.choices[0].message.content.trim();
            if (content.startsWith('```json')) content = content.substring(7);
            else if (content.startsWith('```')) content = content.substring(3);
            if (content.endsWith('```')) content = content.substring(0, content.length - 3);
            
            const resJson = JSON.parse(content.trim());
            let agendaText = resJson.agenda || "Sibuk nugas";
            if (Array.isArray(agendaText)) {
                agendaText = agendaText.map(item => typeof item === 'object' ? Object.values(item).join(' - ') : item).join(', ');
            } else if (typeof agendaText === 'object') {
                agendaText = JSON.stringify(agendaText);
            }

            agenda = {
                date: dateStr,
                agenda: agendaText,
                outfit: resJson.outfit || "Kaos oblong",
                sleep_time: resJson.sleep_time !== undefined ? parseInt(resJson.sleep_time) : 23,
                wake_time: resJson.wake_time !== undefined ? parseInt(resJson.wake_time) : 6
            };
            await redis.set('soul:chronos:agenda', JSON.stringify(agenda));
        } catch (e) {
            console.error("Morning Routine LLM Error:", e);
            agenda = { date: dateStr, agenda: "Hari yang santai", outfit: "Pakaian rumah yang nyaman", sleep_time: 23, wake_time: 6 };
        }
    }

    // TAHAP 6: The 15-Min Pulse & SLEEP MODE
    let lastStateStr = await redis.get('soul:embodiment:global');
    let lastState = lastStateStr ? (typeof lastStateStr === 'string' ? JSON.parse(lastStateStr) : lastStateStr) : {};

    const sleepHour = agenda && agenda.sleep_time !== undefined ? agenda.sleep_time : 23;
    const wakeHour = agenda && agenda.wake_time !== undefined ? agenda.wake_time : 6;
    let isSleepTime = false;
    if (sleepHour > wakeHour) {
        // Normal (misal tidur 23, bangun 6)
        isSleepTime = currentHour >= sleepHour || currentHour < wakeHour;
    } else {
        // Shift malam/begadang ekstrim (misal tidur jam 2 pagi, bangun jam 10 pagi)
        isSleepTime = currentHour >= sleepHour && currentHour < wakeHour;
    }

    // Cek apakah dia sedang dipaksa bangun (karena baru saja diajak chat oleh user)
    const forceAwake = await redis.get('soul:chronos:force_awake');
    if (forceAwake) {
        console.log("[CHRONOS] Sleep Mode Dibatalkan. Bot sedang dipaksa melek oleh user.");
        isSleepTime = false;
    }

    let newState = { time_of_day: timeOfDay, weather: weather, current_activity: "Melamun", inner_thought: "Aku bingung mau ngapain.", location: "Kamar", last_updated: now.getTime() };

    if (isSleepTime) {
        console.log("[CHRONOS] Sleep Mode Active. Bypassing Pulse LLM...");
        newState = {
            time_of_day: timeOfDay,
            weather: weather,
            current_activity: "Sedang tidur pulas di atas kasur",
            inner_thought: "Zzz... [Mimpi yang absurd dan tenang]",
            location: "Kamar Tidur",
            outfit: "Piyama tidur sutra yang nyaman",
            agenda: "Tidur malam memulihkan energi",
            last_updated: now.getTime()
        };
        await redis.set('soul:embodiment:global', JSON.stringify(newState));

        // Cek apakah Reflection Malam sudah dijalankan hari ini
        const todayDateStr = now.toLocaleDateString("en-US", { timeZone: "Asia/Jakarta" });
        const lastSleepReflection = await redis.get('soul:chronos:last_reflection_date');

        if (lastSleepReflection !== todayDateStr) {
            console.log("[CHRONOS] Triggering Background Nightly Reflection...");
            await redis.set('soul:chronos:last_reflection_date', todayDateStr);
            
            // Tembak endpoint terpisah secara background agar Vercel tidak timeout
            const host = event.headers.host || "localhost:3000";
            const protocol = host.includes('localhost') ? 'http' : 'https';
            fetch(`${protocol}://${host}/api/sleep-cycle`, { method: 'POST' }).catch(e => console.error(e));
        }
    } else {
        console.log("[CHRONOS] Running 15-Min Pulse (Inner Monologue)...");
        const activeContext = await redis.get('soul:chronos:active_context');
        
    const pulsePrompt = `Namamu: ${settings.personaName || 'Airish'}. Sifat: ${settings.personaArchetype || 'Ceria'}. Pekerjaan: ${settings.personaCraft || 'Mahasiswi'}.
Lokasi rumah: ${settings.homeCity}. Waktu saat ini: ${timeStr} (${timeOfDay}). Cuaca: ${weather}.
Agenda hari ini: ${agenda.agenda}. Pakaian yang terakhir kamu kenakan: ${lastState.outfit || agenda.outfit}.
Beberapa saat yang lalu kamu sedang: "${lastState.current_activity || 'Tidur'}".
${activeContext ? `\nSTATUS REAL-TIME SAAT INI: Kamu ${activeContext}.\n` : ''}
Tugasmu: Tentukan apa yang sedang kamu lakukan TEPAT DETIK INI. Sesuaikan aktivitasmu dengan AGENDA hari ini pada jam ini. Jika ini waktunya tidur, maka kamu harus sedang tidur di kasur dan memakai piyama.
Jika pada STATUS REAL-TIME kamu sedang chatting dengan user, jadikan "bermain HP/membalas chat" sebagai aktivitasmu, dan sesuaikan PIKIRAN BATIN (inner thought) mu agar bereaksi/merenungkan pesan terakhir user tersebut!
Di mana lokasi spesifikmu? Apa pakaian (outfit) yang kamu pakai saat ini? Dan apa yang sedang kamu pikirkan (inner thought) di dalam hati sesuai SIFATMU?
Kembalikan HANYA format JSON dengan struktur persis seperti ini:
{
  "location": "lokasi spesifik",
  "activity": "aktivitas detik ini secara spesifik",
  "outfit": "pakaian yang dipakai sekarang",
  "inner_thought": "pikiran batin yang sangat sesuai dengan SIFATMU (dan konteks obrolan jika ada)"
}`;


        try {
            const pulseRes = await queryChronosLLM(pulsePrompt, "", true);
            let content = pulseRes.choices[0].message.content;
            content = content.replace(/```json/g, "").replace(/```/g, "").trim();
            const pulseJson = JSON.parse(content);
            newState = {
                ...newState,
                location: pulseJson.location || "Kamar",
                current_activity: pulseJson.activity || "Rebahan santai",
                inner_thought: pulseJson.inner_thought || "Hari yang damai.",
                outfit: pulseJson.outfit || agenda.outfit,
                agenda: agenda.agenda
            };
            await redis.set('soul:embodiment:global', JSON.stringify(newState));
        } catch (e) {
            console.error("Pulse LLM Error:", e);
            await redis.set('soul:embodiment:global', JSON.stringify(newState));
        }
    }

    // --- PROACTIVE ENGINE CHECK & LONELINESS DRIFT ---
    if (settings.proactive && !isSleepTime) {
        const { data: users } = await supabase.from('users').select('telegram_id').limit(5);
        if (users) {
            const activeContext = await redis.get('soul:chronos:active_context');
            
            for (const user of users) {
                const userId = user.telegram_id;
                const userStateStr = await redis.get(`user:${userId}:soul_state`);
                let userState = userStateStr ? (typeof userStateStr === 'string' ? JSON.parse(userStateStr) : userStateStr) : null;
                
                // LONELINESS DRIFT (Rasa Kangen Naik Sendiri)
                if (userState && !activeContext) {
                    if (!userState.desires) userState.desires = {};
                    // Naik sekitar 0.05 tiap 15 menit = butuh sekitar 4-5 jam untuk max kangen
                    userState.desires.connection = Math.min(1.0, (userState.desires.connection || 0) + 0.05);
                    await redis.set(`user:${userId}:soul_state`, JSON.stringify(userState));
                }
                
                // Fetch Trust & Baggage
                const trustStr = await redis.get(`user:${userId}:trust_level`);
                const trustValue = trustStr ? parseFloat(trustStr) : 0.3;
                
                const userDossier = await redis.get(`user:${userId}:dossier`) || "";
                
                const baggageStr = await redis.get(`user:${userId}:baggage`);
                let hasBaggage = false;
                if (baggageStr) {
                    try {
                        const bag = JSON.parse(baggageStr.replace(/,\s*]/g, ']'));
                        if (bag.length > 0) hasBaggage = true;
                    } catch(e) {}
                }
                
                if (userState && userState.desires && userState.desires.connection > 0.9) {
                    const isWaiting = await redis.get(`user:${userId}:waiting_reply`);
                    
                    // JANGAN KIRIM PROACTIVE CHAT JIKA SEDANG AKTIF CHATTING!
                    if (!isWaiting && !activeContext) {
                        // CEK PSIKOLOGIS SEBELUM CHAT DULUAN
                        if (hasBaggage || trustValue < 0.2) {
                            console.log(`[PROACTIVE] Batal menyapa user ${userId} karena masih ada dendam (Baggage) atau Trust Level sangat rendah (${trustValue}).`);
                            continue; // Skip user ini
                        }

                        console.log(`[PROACTIVE] User ${userId} kangen dan Trust Level aman (${trustValue}). Menyiapkan chat duluan...`);
                        
                        let trustContext = "Kalian adalah teman biasa. Sapa dengan santai.";
                        if (trustValue >= 0.8) trustContext = "Kalian adalah SAHABAT DEKAT. Sapa dengan sangat manja, hangat, dan tanpa basa-basi.";
                        else if (trustValue <= 0.4) trustContext = "Kamu baru mengenalnya. Sapa dengan sedikit basa-basi dan jangan terlalu agresif.";

                        // Menjalankan LLM untuk menulis pesan proaktif
                        const proPrompt = `Kamu adalah Airish. Saat ini kamu sedang ${newState.current_activity} di ${newState.location}.
Pikiran batinmu: "${newState.inner_thought}". 
Kamu merasa kesepian dan ingin menyapa pengguna ini duluan.
[Konteks Hubungan]: ${trustContext}
${userDossier ? `[Profil Pengguna]: ${userDossier}\n(Gunakan pemahaman profil ini agar ucapanmu relevan dengannya)` : ''}

Tulis pesan pendek (1-2 kalimat) untuk menyapanya secara natural (WA style). 
ATURAN MUTLAK: Tulis RAW text saja. DILARANG KERAS menggunakan tanda kutip ("..."), tanda bintang (*) untuk bold/italic/narasi gerakan, atau formatting markdown apapun. Hanya ketik kata-kata layaknya chatting di WhatsApp sungguhan!`;
                        
                        try {
                            const proRes = await queryLLMWithFallback(proPrompt, [], "");
                            const proMessage = proRes.choices[0].message.content;
                            console.log(`[PROACTIVE MESSAGE] -> ${proMessage}`);
                            
                            // Eksekusi kirim pesan via Telegram
                            const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
                            if (BOT_TOKEN) {
                                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ chat_id: userId, text: proMessage })
                                });
                            }
                            
                        } catch(e) {
                            console.error("Proactive LLM or Telegram Error:", e);
                        }
                        
                        // Set waiting state selama 24 jam
                        await redis.set(`user:${userId}:waiting_reply`, "1", { ex: 86400 }); 
                    }
                }
            }
        }
    }

    return json(200, { ok: true, state: newState, message: "God Mode Chronos Pulse executed successfully" });
}

export default vercelHandler(handler);
