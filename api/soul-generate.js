import { json, vercelHandler, readJson } from "../src/http.mjs";
import { queryChronosLLM } from "../src/llm.mjs";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "dummy_key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const GENERATOR_PROMPT = `Kamu adalah ahli pembuat karakter fiksi dan psikolog kepribadian.
Tugasmu adalah merancang karakter bot berdasarkan deskripsi dari pengguna, dan mengubahnya menjadi variabel-variabel pengaturan.
Pertimbangkan 3 pilar: Lingkungan, Persona, dan Psikologis (terutama Big 5).

Output harus berupa format JSON MURNI (tanpa markdown, tanpa blok kode) dengan struktur berikut:
{
  "homeCity": "Kota tempat tinggal, Negara",
  "sleepTime": "JJ:MM",
  "wakeTime": "JJ:MM",
  "hobbies": "Hobi 1, Hobi 2, Hobi 3",
  "clinginess": 8, // Skala 1-10
  "curiosity": 6, // Skala 1-10
  "proactive": true, // boolean
  "personaName": "Nama karakter",
  "personaArchetype": "Contoh: Gadis 22th, ekstrovert, super manja, penyayang",
  "personaCraft": "Pekerjaan/Status (misal: Mahasiswi DKV)",
  "personaBackstory": "Cerita latar belakang singkat (1-2 kalimat)",
  "personaWorld": "Konteks tempat tinggal (misal: Kos estetik di Jakarta)",
  "psychology": {
    "big_five": {
      "openness": 0.7, // Skala 0.0 - 1.0
      "conscientiousness": 0.4,
      "extraversion": 0.8,
      "agreeableness": 0.7,
      "neuroticism": 0.6
    },
    "attachment_style": "anxious-secure" // pilih salah satu: secure, anxious, avoidant, anxious-secure
  }
}
Pastikan seluruh field terisi berdasarkan interpretasi dari deskripsi pengguna.`;

async function handler(event) {
    if (event.httpMethod !== 'POST') {
        return json(405, { error: 'Method not allowed' });
    }

    const body = readJson(event);
    if (!body || !body.prompt) {
        return json(400, { error: 'Prompt is required' });
    }

    try {
        console.log("[AI CREATOR] Menerima prompt:", body.prompt);
        const response = await queryChronosLLM(GENERATOR_PROMPT, body.prompt, true);
        
        let content = response.choices[0].message.content.trim();
        // Bersihkan markdown block jika ada
        if (content.startsWith('```json')) content = content.substring(7);
        else if (content.startsWith('```')) content = content.substring(3);
        if (content.endsWith('```')) content = content.substring(0, content.length - 3);

        const newSettings = JSON.parse(content.trim());
        
        // Simpan langsung ke database (seolah user yang menekan tombol Simpan)
        const payload = {
            home_city: newSettings.homeCity,
            sleep_time: newSettings.sleepTime,
            wake_time: newSettings.wakeTime,
            hobbies: newSettings.hobbies,
            clinginess: newSettings.clinginess,
            curiosity: newSettings.curiosity,
            proactive: newSettings.proactive,
            name: newSettings.personaName,
            archetype: newSettings.personaArchetype,
            craft: newSettings.personaCraft,
            backstory: newSettings.personaBackstory,
            world_context: newSettings.personaWorld,
            psychology: newSettings.psychology,
            updated_at: new Date().toISOString()
        };

        const { data: existing } = await supabase.from('personas').select('id').limit(1).single();
        if (existing) {
            await supabase.from('personas').update(payload).eq('id', existing.id);
        } else {
            await supabase.from('personas').insert(payload);
        }

        return json(200, { ok: true, data: newSettings });

    } catch (error) {
        console.error("[AI CREATOR] Error:", error);
        return json(500, { error: error.message || 'Failed to generate persona' });
    }
}

export default vercelHandler(handler);
