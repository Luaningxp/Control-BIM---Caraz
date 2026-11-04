import { supabaseClient } from './db.js';

export async function checkUser() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) return null;
    return user;
}
