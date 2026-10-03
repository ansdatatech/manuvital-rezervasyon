import type { APIRoute } from 'astro';
import { db } from '../../db';
import { musteriler } from '../../db/schema';
import { desc } from 'drizzle-orm';
import { jwtVerify } from 'jose';

export const prerender = false;
const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

export const GET: APIRoute = async ({ cookies }) => {
    
    // --- API GÜVENLİK DUVARI ---
    const token = cookies.get('auth_token')?.value;
    if (!token) {
        return new Response(JSON.stringify({ error: "Yetkisiz erişim! (Token yok)" }), { status: 401 });
    }
    try {
        await jwtVerify(token, JWT_SECRET);
    } catch (error) {
        return new Response(JSON.stringify({ error: "Geçersiz veya süresi dolmuş oturum!" }), { status: 403 });
    }
    // ---------------------------

    try {
        // Müşterileri son eklenenden geriye doğru çek
        const liste = await db.select().from(musteriler).orderBy(desc(musteriler.id));
        
        return new Response(JSON.stringify(liste), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: "Veri çekilemedi." }), { status: 500 });
    }
};