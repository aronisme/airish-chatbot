// src/soul/engine.mjs

/**
 * Soul Engine Murni (NON-LLM).
 * Menghitung State (Energy & Mood) Airish berdasarkan emosi dan intent dari User (Perception).
 * Ini memastikan kepribadian yang stabil dan tidak ada halusinasi dari LLM.
 */
export function calculateSoulState(currentState, perception, identity = {}) {
    let newEnergy = currentState.energy;
    let moodValue = currentState.mood_value !== undefined ? currentState.mood_value : 0;

    // Ambil Personality Traits (Fallback ke 0.5 jika tidak ada)
    const extraversion = identity?.big_five?.extraversion ?? 0.5;
    const neuroticism = identity?.big_five?.neuroticism ?? 0.5;
    const agreeableness = identity?.big_five?.agreeableness ?? 0.5;

    // 1. Kalkulasi Energy Drain
    // Ekstrovert mendapat pengurangan cost karena senang ngobrol. Introver costnya lebih mahal.
    let energyCost = 2 + ((0.5 - extraversion) * 2); 
    
    if (perception.intent === "question" || perception.intent === "command") {
        energyCost += 2;
    }
    if (perception.emotion === "angry" || perception.emotion === "anxious") {
        // Neuroticism tinggi membuat energi terkuras lebih parah saat menghadapi konflik
        energyCost += (4 * neuroticism);
    }
    if (perception.topic_shift) {
        energyCost += 1;
    }
    newEnergy = Math.max(0, newEnergy - energyCost);

    // 2. Kalkulasi Mood (Lapisan Menengah / Akumulatif)
    let moodDelta = 0;
    
    // Evaluasi Emosi & Hostility User
    if (perception.emotion === 'happy' || perception.emotion === 'excited') moodDelta = +10;
    if (perception.emotion === 'angry' || perception.hostility > 0.5) {
        // Semakin agreeable, semakin sabar (mood tidak terlalu drop). 
        // Semakin neurotic, mentalnya semakin hancur kalau dimarahi.
        let penalty = 15 * (1 + neuroticism) * (1.5 - agreeableness);
        moodDelta = -penalty;
    }
    if (perception.emotion === 'sad') moodDelta = -5; 
    
    // Evaluasi Intent
    if (perception.intent === 'greeting' || perception.intent === 'compliment') moodDelta += 5;

    // Terapkan Delta ke Mood Value (Dibatasi -100 s/d 100)
    moodValue = Math.max(-100, Math.min(100, moodValue + moodDelta));

    // Peluruhan (Decay) perlahan kembali ke Netral (0) setiap pesan
    moodValue = Math.round(moodValue * 0.95);

    // 3. Terjemahkan Angka ke Label Teks untuk LLM
    let newMood = "calm";
    if (newEnergy < 25) {
        newMood = "tired";
    } else if (moodValue > 60) {
        newMood = "excited";
    } else if (moodValue > 20) {
        newMood = "cheerful";
    } else if (moodValue < -60) {
        newMood = "depressed/hostile";
    } else if (moodValue < -20) {
        newMood = "gloomy";
    } else {
        // Fallback: Jika mood netral, berikan empati sesaat jika user butuh
        if (perception.emotion === 'sad' || perception.emotion === 'anxious') {
            newMood = "concerned";
        } else if (perception.intent === 'question' || perception.intent === 'request') {
            newMood = "helpful";
        } else {
            newMood = "calm";
        }
    }

    return {
        energy: newEnergy,
        mood: newMood,
        mood_value: moodValue,
        last_updated: Date.now()
    };
}
