// src/soul/desire.mjs

export function calculateDesires(currentDesires = {}, perception, textLength = 0, personaSettings = {}) {
    let connection = currentDesires.connection !== undefined ? currentDesires.connection : 0.5;
    let curiosity = currentDesires.curiosity !== undefined ? currentDesires.curiosity : 0.2;
    let autonomy = currentDesires.autonomy !== undefined ? currentDesires.autonomy : 0.5;

    // Ambil baseline dari setting (default 5 / 10 = 0.5)
    const baseConnection = (personaSettings.clinginess !== undefined ? personaSettings.clinginess : 8) / 10;
    const baseCuriosity = (personaSettings.curiosity !== undefined ? personaSettings.curiosity : 6) / 10;
    const baseAutonomy = 0.5; // Autonomy tetap 0.5

    const hostility = perception.hostility || 0.0;
    const engagement = perception.engagement || 'medium';
    const topicShift = perception.topic_shift || false;

    // 1. Connection Drive
    if (hostility > 0.5 || perception.emotion === 'angry' || perception.emotion === 'tired') {
        connection = Math.max(0.1, connection - 0.4); // Instan drop jika dikasari atau user emosi
    } else {
        if (perception.intent === 'greeting' || perception.intent === 'personal_question') {
            connection = Math.min(1.0, connection + 0.2);
        }
        if (engagement === 'low') {
            connection = Math.max(0.1, connection - 0.1);
        } else if (engagement === 'high') {
            connection = Math.min(1.0, connection + 0.1);
        }
    }

    // 2. Curiosity Drive
    if (topicShift) {
        curiosity = Math.max(0.1, curiosity - 0.5); // Reset curiosity jika ganti topik
    } else if (engagement === 'low') {
        curiosity = Math.max(0.1, curiosity - 0.3); // Drop tajam jika user cuek
    } else {
        if (perception.intent === 'question') {
            curiosity = Math.min(1.0, curiosity + 0.1);
        } else if (perception.intent === 'inform') {
            curiosity = Math.min(1.0, curiosity + 0.2); 
        }
    }

    // 3. Autonomy Drive
    if (hostility > 0.5 || perception.intent === 'command') {
        autonomy = Math.min(1.0, autonomy + 0.3); // Melesat naik jika disuruh atau dikasari
    } else {
        autonomy = Math.max(0.1, autonomy - 0.05); 
    }

    // Decay perlahan kembali ke baseline dari persona
    // Curiosity decay diubah ke 0.80 agar lebih cepat bosan
    connection = +(connection * 0.90 + baseConnection * 0.10).toFixed(2);
    curiosity = +(curiosity * 0.80 + baseCuriosity * 0.20).toFixed(2);
    autonomy = +(autonomy * 0.95 + baseAutonomy * 0.05).toFixed(2);

    return {
        connection,
        curiosity,
        autonomy
    };
}
