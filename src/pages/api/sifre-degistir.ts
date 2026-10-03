import type { APIRoute } from 'astro';
import { db } from '../../db';
import { kullanicilar } from '../../db/schema';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { jwtVerify } from 'jose';

export const prerender = false;
const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

export const POST: APIRoute = async ({ request, cookies }) => {
    // --- GÜVENLİK KONTROLÜ (Kimlik tespiti) ---
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: "Yetkisiz erişim! (Token yok)" }), { status: 401 });
    
    let aktifKullaniciAdi = '';
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        aktifKullaniciAdi = payload.kullaniciAdi as string;
    } catch (e) {
        return new Response(JSON.stringify({ error: "Geçersiz veya süresi dolmuş oturum!" }), { status: 403 });
    }
    // ------------------------------------------

    try {
        const body = await request.json();
        
        // 2. Veritabanından kullanıcıyı bul
        const kullanici = await db.select().from(kullanicilar).where(eq(kullanicilar.kullaniciAdi, aktifKullaniciAdi)).limit(1);
        if (kullanici.length === 0) return new Response(JSON.stringify({ error: "Kullanıcı bulunamadı." }), { status: 404 });

        // 3. Eski şifreyi doğrula
        const sifreDogruMu = await bcrypt.compare(body.eskiSifre, kullanici[0].sifreHash);
        if (!sifreDogruMu) return new Response(JSON.stringify({ error: "Mevcut şifrenizi yanlış girdiniz!" }), { status: 400 });

        // 4. Yeni şifreyi hashle ve kaydet
        const yeniSifreHash = await bcrypt.hash(body.yeniSifre, 10);
        await db.update(kullanicilar).set({ sifreHash: yeniSifreHash }).where(eq(kullanicilar.id, kullanici[0].id));

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: "İşlem başarısız oldu." }), { status: 500 });
    }
};