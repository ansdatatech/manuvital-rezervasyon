import type { APIRoute } from 'astro';
import { db } from '../../db';
import { rezervasyonlar } from '../../db/schema';
import { jwtVerify } from 'jose';

export const prerender = false;
const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

export const GET: APIRoute = async ({ cookies }) => {
    // --- YÖNETİCİ GÜVENLİK DUVARI ---
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: "Yetkisiz erişim!" }), { status: 401 });
    
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        if (payload.rol !== 'yonetici') {
            return new Response(JSON.stringify({ error: "İstatistikleri sadece yöneticiler görebilir!" }), { status: 403 });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: "Geçersiz veya süresi dolmuş oturum!" }), { status: 403 });
    }
    // --------------------------------

    try {
        // Tüm rezervasyon geçmişini çek
        const tumKayitlar = await db.select().from(rezervasyonlar);
        
        return new Response(JSON.stringify({ 
            success: true, 
            rezervasyonlar: tumKayitlar 
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: "Veriler çekilemedi." }), { status: 500 });
    }
};