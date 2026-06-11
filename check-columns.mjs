import { createClient } from "@supabase/supabase-js";
import fs from 'fs';

const envPath = './.env';
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            let val = match[2].trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            process.env[match[1].trim()] = val;
        }
    });
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkColumns() {
    const { data, error } = await supabase.from('personas').select('*').limit(1);
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Columns:", Object.keys(data[0] || {}));
        console.log("Row Data:", data[0]);
    }
}
checkColumns();
