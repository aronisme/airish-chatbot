import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function test() {
    const { data: persona, error } = await supabase.from('personas').select('*').limit(1).single();
    console.log("Keys:", Object.keys(persona));
}

test();
