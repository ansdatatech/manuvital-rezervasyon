import type { APIRoute } from 'astro';
import { db } from '../../db';
import { kullanicilar } from '../../db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

export const prerender = false;

// MANUVITAL KULLANICI HİYERARŞİSİ (DB'ye eklenecekler):
// 1. kullaniciAdi: "huseyin"  -> rol: "yonetici"
// 2. kullaniciAdi: "sekreter" -> rol: "sekreter"
// 3. kullaniciAdi: "irem"     -> rol: "uzman"
// 4. kullaniciAdi: "erdogan"  -> rol: "uzman"

const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { kullaniciAdi, sifre } = body;

        // Kullanıcıyı veritabanından bul
        const kullanici = await db.select().from(kullanicilar).where(eq(kullanicilar.kullaniciAdi, kullaniciAdi)).limit(1);
        
        if (kullanici.length === 0) {
            return new Response(JSON.stringify({ error: "Kullanıcı bulunamadı." }), { status: 401 });
        }

        // Şifre doğrulama (bcrypt)
        const sifreDogruMu = await bcrypt.compare(sifre, kullanici[0].sifreHash);
        if (!sifreDogruMu) {
            return new Response(JSON.stringify({ error: "Hatalı şifre." }), { status: 401 });
        }

        // Başarılı ise JWT Token üret (Rolü token içine mühürle)
        const token = await new SignJWT({ 
            kullaniciAdi: kullanici[0].kullaniciAdi, 
            rol: kullanici[0].rol 
        })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h') // 24 saat geçerli
        .sign(JWT_SECRET);

        // Güvenli Çerez (Cookie) olarak tarayıcıya gönder
        return new Response(JSON.stringify({ success: true, rol: kullanici[0].rol }), {
            status: 200,
            headers: {
                'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
                'Content-Type': 'application/json'
            }
        });
        
    } catch (error: any) {
        return new Response(JSON.stringify({ error: "Giriş işlemi başarısız." }), { status: 500 });
    }
};