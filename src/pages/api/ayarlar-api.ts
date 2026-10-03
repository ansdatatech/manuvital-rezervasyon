import type { APIRoute } from 'astro';
import { db } from '../../db';
import { sistemAyarlari } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { jwtVerify } from 'jose';

export const prerender = false;
const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

export const GET: APIRoute = async ({ cookies }) => {
    // --- API GÜVENLİK DUVARI ---
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: "Yetkisiz erişim!" }), { status: 401 });
    try { await jwtVerify(token, JWT_SECRET); } catch (e) { return new Response(JSON.stringify({ error: "Geçersiz oturum!" }), { status: 403 }); }
    // ---------------------------

    try {
        let ayar = await db.select().from(sistemAyarlari).limit(1);
        
        // Eğer tablo boşsa varsayılan saatleri oluştur
        if (ayar.length === 0) {
            const yeniAyar = await db.insert(sistemAyarlari).values({ baslangicSaati: 8, bitisSaati: 22 }).returning();
            ayar = yeniAyar;
        }
        
        return new Response(JSON.stringify(ayar[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: "Ayarlar çekilemedi." }), { status: 500 });
    }
};

export const PUT: APIRoute = async ({ request, cookies }) => {
    // --- YÖNETİCİ GÜVENLİK DUVARI ---
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: "Yetkisiz erişim!" }), { status: 401 });
    
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        if (payload.rol !== 'yonetici') {
            return new Response(JSON.stringify({ error: "Sadece yöneticiler değiştirebilir!" }), { status: 403 });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: "Geçersiz oturum!" }), { status: 403 });
    }
    // --------------------------------

    try {
        const body = await request.json();
        
        // İlgili ayarı güncelle (ID'si 1 olanı)
        await db.update(sistemAyarlari).set({
            baslangicSaati: parseInt(body.baslangicSaati),
            bitisSaati: parseInt(body.bitisSaati),
            alanSayisi: parseInt(body.alanSayisi)
        }).where(eq(sistemAyarlari.id, body.id));

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: "Güncelleme başarısız." }), { status: 500 });
    }
};