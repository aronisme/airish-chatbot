// src/soul/desire.mjs

export function calculateDesires(currentDesires = {}, perception, textLength = 0) {
    let connection = currentDesires.connection !== undefined ? currentDesires.connection : 0.5;
    let curiosity = currentDesires.curiosity !== undefined ? currentDesires.curiosity : 0.2;
    let autonomy = currentDesires.autonomy !== undefined ? currentDesires.autonomy : 0.5;

    // 1. Connection Drive
    if (perception.intent === 'greeting' || perception.intent === 'personal_question') {
        connection = Math.min(1.0, connection + 0.2);
    } else if (textLength > 100) {
        connection = Math.max(0.2, connection - 0.1); 
    }

    // 2. Curiosity Drive
    if (perception.intent === 'question' || perception.intent === 'clarification') {
        curiosity = Math.min(1.0, curiosity + 0.1);
    } else if (perception.intent === 'inform' && textLength < 30) {
        curiosity = Math.min(1.0, curiosity + 0.3); 
    } else if (textLength > 150) {
        curiosity = Math.max(0.1, curiosity - 0.3); 
    }

    // 3. Autonomy Drive
    if (perception.intent === 'command') {
        autonomy = Math.min(1.0, autonomy + 0.2);
    } else {
        autonomy = Math.max(0.3, autonomy - 0.05); 
    }

    // Decay perlahan ke baseline
    connection = +(connection * 0.95 + 0.5 * 0.05).toFixed(2);
    curiosity = +(curiosity * 0.90 + 0.2 * 0.10).toFixed(2);
    autonomy = +(autonomy * 0.95 + 0.5 * 0.05).toFixed(2);

    return {
        connection,
        curiosity,
        autonomy
    };
}
