// src/soul/engine.mjs

/**
 * Soul Engine Murni (NON-LLM).
 * Menghitung State (Energy & Mood) Airish berdasarkan emosi dan intent dari User (Perception).
 * Ini memastikan kepribadian yang stabil dan tidak ada halusinasi dari LLM.
 */
export function calculateSoulState(currentState, perception) {
    let newEnergy = currentState.energy;
    let newMood = currentState.mood;

    // 1. Kalkulasi Energy Cost
    // Setiap interaksi mengurangi energi. Interaksi emosional tinggi menyita lebih banyak energi.
    let energyCost = 2; // Base cost untuk merespons
    
    if (perception.importance > 0.6) energyCost += 3; // Topik penting
    if (perception.emotion === "angry" || perception.emotion === "sad") energyCost += 4; // Empati melelahkan
    if (perception.intent === "venting") energyCost += 3; // Menjadi pendengar menyita energi

    newEnergy = Math.max(10, newEnergy - energyCost); // Energi tidak bisa kurang dari 10

    // 2. Kalkulasi Mood (Emotional Contagion & Empathy)
    if (newEnergy < 25) {
        // Jika kelelahan, mood selalu lelah tanpa memandang pesan user
        newMood = "tired";
    } else {
        // Jika masih ada energi, sesuaikan mood dengan empati
        switch (perception.emotion) {
            case "sad":
            case "anxious":
                newMood = "concerned";
                break;
            case "happy":
            case "excited":
                newMood = "excited";
                break;
            case "angry":
                newMood = "calm"; // Airish menenangkan diri jika user marah
                break;
            default:
                if (perception.intent === "question" || perception.intent === "request") {
                    newMood = "helpful";
                } else if (perception.intent === "greeting") {
                    newMood = "welcoming";
                } else {
                    newMood = "calm"; // Default mood
                }
                break;
        }
    }

    return {
        energy: newEnergy,
        mood: newMood
    };
}
