import type { APIRoute } from 'astro';
import { db } from '../../db';
import { musteriler, rezervasyonlar } from '../../db/schema';
import { ilike, or } from 'drizzle-orm';
import { jwtVerify } from 'jose';

export const prerender = false;
const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

// İsim formati: "Gizem TOSUN"
function isimFormatla(isim: string) {
    if (!isim) return "";
    const parcalar = isim.trim().split(/\s+/);
    if (parcalar.length === 1) {
        return parcalar[0].charAt(0).toLocaleUpperCase('tr-TR') + parcalar[0].slice(1).toLocaleLowerCase('tr-TR');
    }
    const sonKelime = parcalar.pop()?.toLocaleUpperCase('tr-TR') || '';
    const ilkKisim = parcalar.map(p => p.charAt(0).toLocaleUpperCase('tr-TR') + p.slice(1).toLocaleLowerCase('tr-TR')).join(' ');
    return ilkKisim + ' ' + sonKelime;
}

// Telefon formatı: "0(563) 829 29 72"
function telefonFormatla(tel: string) {
    if (!tel) return '';
    const temiz = tel.replace(/\D/g, '');
    if (temiz.length === 11 && temiz.startsWith('0')) {
        return `0(${temiz.substring(1,4)}) ${temiz.substring(4,7)} ${temiz.substring(7,9)} ${temiz.substring(9,11)}`;
    }
    return tel; 
}

export const GET: APIRoute = async ({ request, cookies }) => {
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
        const url = new URL(request.url);
        const q = url.searchParams.get('q');

        if (!q || q.length < 2) {
            return new Response(JSON.stringify([]), { status: 200 });
        }

        const aramaMetni = `%${q}%`;

        // 1. Müşteriler tablosunda ara
        const mSonuclar = await db.select().from(musteriler).where(
            or(
                ilike(musteriler.adSoyad, aramaMetni),
                ilike(musteriler.telefon, aramaMetni)
            )
        ).limit(20);

        // 2. Rezervasyonlar tablosunda ara
        const rSonuclar = await db.select({
            adSoyad: rezervasyonlar.kisiAdi,
            telefon: rezervasyonlar.telefon
        }).from(rezervasyonlar).where(
            or(
                ilike(rezervasyonlar.kisiAdi, aramaMetni),
                ilike(rezervasyonlar.telefon, aramaMetni)
            )
        ).limit(20);

        // Tüm sonuçları birleştir
        const tumSonuclar = [...mSonuclar, ...rSonuclar];

        // MÜKERRER KAYITLARI TEMİZLE (Deduplication)
        const islenenAnahtarlar = new Set();
        const tekilListe: { adSoyad: string, telefon: string }[] = [];

        tumSonuclar.forEach(k => {
            const duzgunIsim = isimFormatla(k.adSoyad);
            const telTemiz = k.telefon ? k.telefon.replace(/\D/g, '') : '';
            
            // Tekilleştirme anahtarı: Telefon varsa telefon, yoksa isim kullan
            const benzersizAnahtar = telTemiz ? telTemiz : duzgunIsim.toLocaleLowerCase('tr-TR');

            if (!islenenAnahtarlar.has(benzersizAnahtar)) {
                islenenAnahtarlar.add(benzersizAnahtar);
                
                tekilListe.push({
                    adSoyad: duzgunIsim,
                    telefon: telefonFormatla(k.telefon || '')
                });
            }
        });

        // Alfabeye göre sırala
        tekilListe.sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, 'tr'));

        // Sadece ilk 8 benzersiz sonucu döndür
        return new Response(JSON.stringify(tekilListe.slice(0, 8)), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error("Müşteri arama hatası:", error);
        return new Response(JSON.stringify([]), { status: 500 });
    }
};