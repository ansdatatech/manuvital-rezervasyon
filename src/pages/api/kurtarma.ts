import type { APIRoute } from 'astro';
import { SignJWT } from 'jose';

// Sistemdeki mevcut şifreleme anahtarını alıyoruz
const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

export const GET: APIRoute = async ({ cookies, redirect }) => {
    // Şifre sormadan doğrudan "yonetici" yetkisiyle sana bir anahtar (token) üretiyoruz
    const token = await new SignJWT({ rol: 'yonetici', kullaniciAdi: 'kurucu_sahin' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(JWT_SECRET);

    // Anahtarı tarayıcına yerleştiriyoruz
    cookies.set('auth_token', token, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 60 * 60 * 2
    });

    // Seni doğrudan ayarlar sayfasına ışınlıyoruz
    return redirect('/ayarlar');
};