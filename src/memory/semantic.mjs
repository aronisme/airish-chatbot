// src/memory/semantic.mjs

/**
 * Mengambil Semantic Memory (Fakta permanen tentang user)
 * Mengembalikan string terformat untuk disisipkan ke dalam context builder.
 */
export async function getSemanticMemory(supabase, userId) {
    const { data: memories } = await supabase.from('memories')
        .select('fact, event_date')
        .eq('telegram_id', userId);
        
    if (!memories || memories.length === 0) return null;
    
    return memories.map(m => `- ${m.fact}${m.event_date ? ' (' + m.event_date + ')' : ''}`).join('\n');
}
