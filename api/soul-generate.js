import { json, vercelHandler, readJson } from "../src/http.mjs";
import { queryChronosLLM } from "../src/llm.mjs";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "dummy_key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const GENERATOR_PROMPT = `Kamu adalah ahli pembuat karakter fiksi dan psikolog kepribadian.
Tugasmu adalah merancang karakter bot berdasarkan deskripsi dari pengguna, dan mengubahnya menjadi variabel-variabel pengaturan.
Pertimbangkan 3 pilar: Lingkungan, Persona, dan Psikologis (terutama Big 5).

Output harus berupa format JSON MURNI tanpa blok markdown dan TANPA KOMENTAR apapun (DILARANG KERAS MENGGUNAKAN SIMBOL //) dengan struktur berikut:
{
  "homeCity": "Kota tempat tinggal, Negara",
  "sleepTime": "01:00",
  "wakeTime": "07:00",
  "hobbies": "Hobi 1, Hobi 2, Hobi 3",
  "clinginess": 8,
  "curiosity": 6,
  "proactive": true,
  "personaName": "Nama karakter",
  "personaArchetype": "Gadis 22th, ekstrovert, super manja, penyayang",
  "personaCraft": "Mahasiswi DKV",
  "personaBackstory": "Cerita latar belakang",
  "personaWorld": "Konteks tempat tinggal",
  "psychology": {
    "big_five": {
      "openness": 0.7,
      "conscientiousness": 0.4,
      "extraversion": 0.8,
      "agreeableness": 0.7,
      "neuroticism": 0.6
    },
    "attachment_style": "anxious-secure"
  }
}
Pastikan seluruh field terisi.`;

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

        // Hapus komentar inline (//...) yang mungkin masih disisipkan LLM agar JSON.parse tidak gagal
        let safeJson = content.replace(/\/\/[^\n]*\n/g, '\n').replace(/\/\/[^\n]*$/g, '');
        const newSettings = JSON.parse(safeJson.trim());
        
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
