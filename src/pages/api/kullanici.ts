import type { APIRoute } from 'astro';
import { db } from '../../db';
import { kullanicilar } from '../../db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { jwtVerify } from 'jose';

export const prerender = false;
const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

// YARDIMCI GÜVENLİK FONKSİYONU: SADECE YÖNETİCİLER
async function yoneticiMi(cookies: any) {
    try {
        const token = cookies.get('auth_token')?.value;
        if (!token) return false;
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload.rol === 'yonetici';
    } catch (e) { return false; }
}

// 1. KULLANICILARI LİSTELE (GET)
export const GET: APIRoute = async ({ cookies }) => {
    if (!await yoneticiMi(cookies)) return new Response(JSON.stringify({ error: "Yetkisiz Erişim!" }), { status: 403 });

    try {
        const liste = await db.select({
            id: kullanicilar.id,
            kullaniciAdi: kullanicilar.kullaniciAdi,
            rol: kullanicilar.rol,
            adSoyad: kullanicilar.adSoyad
        }).from(kullanicilar).orderBy(kullanicilar.id);
        
        return new Response(JSON.stringify(liste), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: "Kullanıcılar çekilemedi." }), { status: 500 });
    }
};

// 2. YENİ KULLANICI EKLE (POST)
export const POST: APIRoute = async ({ request, cookies }) => {
    if (!await yoneticiMi(cookies)) return new Response(JSON.stringify({ error: "Yetkisiz Erişim!" }), { status: 403 });

    try {
        const body = await request.json();
        
        // Şifreyi güvenli hale getir (hash)
        const hashliSifre = await bcrypt.hash(body.sifre, 10);
        
        await db.insert(kullanicilar).values({
            kullaniciAdi: body.kullaniciAdi.toLowerCase(), // Kullanıcı adını hep küçük harf yap
            sifreHash: hashliSifre,
            rol: body.rol,
            adSoyad: body.adSoyad
        });
        
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        if (error.code === '23505') { 
            return new Response(JSON.stringify({ error: "Bu kullanıcı adı zaten alınmış." }), { status: 400 });
        }
        return new Response(JSON.stringify({ error: "Hesap oluşturulamadı." }), { status: 500 });
    }
};

// 3. ŞİFRE SIFIRLAMA (Yönetici Tarafından - PUT)
export const PUT: APIRoute = async ({ request, cookies }) => {
    if (!await yoneticiMi(cookies)) return new Response(JSON.stringify({ error: "Yetkisiz Erişim!" }), { status: 403 });

    try {
        const body = await request.json();
        
        if (!body.id || !body.yeniSifre) {
            return new Response(JSON.stringify({ error: "Eksik bilgi gönderildi." }), { status: 400 });
        }

        const hashliSifre = await bcrypt.hash(body.yeniSifre, 10);
        
        await db.update(kullanicilar)
            .set({ sifreHash: hashliSifre })
            .where(eq(kullanicilar.id, parseInt(body.id)));
            
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: "Şifre güncellenemedi." }), { status: 500 });
    }
};

// 4. KULLANICI SİLME (DELETE)
export const DELETE: APIRoute = async ({ request, cookies }) => {
    if (!await yoneticiMi(cookies)) return new Response(JSON.stringify({ error: "Yetkisiz Erişim!" }), { status: 403 });

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        
        if (!id) return new Response(JSON.stringify({ error: "Silinecek ID bulunamadı." }), { status: 400 });
        
        await db.delete(kullanicilar).where(eq(kullanicilar.id, parseInt(id)));
        
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: "Kullanıcı silinirken sunucu hatası oluştu." }), { status: 500 });
    }
};