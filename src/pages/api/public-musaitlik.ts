import type { APIRoute } from 'astro';
import { db } from '../../db';
import { rezervasyonlar, kapaliGunler, sistemAyarlari } from '../../db/schema';
import { and, eq, or } from 'drizzle-orm';

export const prerender = false;

// YENİ: İki farklı domain'in konuşmasını sağlayan CORS güvenlik izinleri
const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Herkese açık (veya 'https://www.manuvital.com' yazılabilir)
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// Tarayıcıların güvenlik amaçlı attığı "Ön Uçuş (Preflight)" isteğini karşılar
export const OPTIONS: APIRoute = async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
};

// 1. DIŞARIDAN GELEN MÜSAİTLİK SORGUSU (GET)
export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const tarih = url.searchParams.get('tarih');
        const hocaKey = url.searchParams.get('hoca'); // 'irem' veya 'erdogan'

        if (!tarih || !hocaKey) {
            return new Response(JSON.stringify({ error: "Tarih ve hoca bilgisi zorunludur." }), { status: 400, headers: corsHeaders });
        }

        const hocaKortNo = hocaKey === 'irem' ? 2 : 3;

        const ayarlar = await db.select().from(sistemAyarlari).limit(1);
        const baslangic = ayarlar.length > 0 ? ayarlar[0].baslangicSaati : 8;
        const bitis = ayarlar.length > 0 ? ayarlar[0].bitisSaati : 22;

        let tumSaatler = [];
        for (let i = baslangic; i <= bitis; i++) {
            tumSaatler.push(i.toString().padStart(2, '0') + ':00');
        }

        const simdi = new Date();
        const turkiyeSaatFarki = simdi.getTimezoneOffset() * 60000;
        const suAnkiTurkiyeSaati = new Date(simdi.getTime() - turkiyeSaatFarki);
        const bugunTarihi = suAnkiTurkiyeSaati.toISOString().slice(0, 10);
        
        if (tarih < bugunTarihi) return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });

        let saatFiltreliList = tumSaatler;
        if (tarih === bugunTarihi) {
            const guncelSaatSayisi = suAnkiTurkiyeSaati.getHours();
            saatFiltreliList = tumSaatler.filter(s => parseInt(s.split(':')[0]) > guncelSaatSayisi);
        }

        const gunIndex = new Date(tarih).getDay();
        const izinKayitlari = await db.select().from(kapaliGunler);
        
        const hocaIzinliMi = izinKayitlari.some(iz => {
            const kapsamUyuyor = iz.kapsam === 'TUM' || iz.kapsam === hocaKey;
            let zamanUyuyor = false;
            if (iz.tip === 'tarih' && iz.deger === tarih) zamanUyuyor = true;
            if (iz.tip === 'rutin' && parseInt(iz.deger) === gunIndex) zamanUyuyor = true;
            if (iz.tip === 'aralik') {
                const [bas, bit] = iz.deger.split('_');
                if (tarih >= bas && tarih <= bit) zamanUyuyor = true;
            }
            return kapsamUyuyor && zamanUyuyor;
        });

        if (hocaIzinliMi) return new Response(JSON.stringify([]), { status: 200, headers: corsHeaders });

        const doluKayitlar = await db.select({ saat: rezervasyonlar.saat }).from(rezervasyonlar)
            .where(
                and(
                    eq(rezervasyonlar.tarih, tarih),
                    or(eq(rezervasyonlar.alanId, hocaKortNo), eq(rezervasyonlar.notlar, hocaKey))
                )
            );

        const doluSaatlerListesi = doluKayitlar.map(k => k.saat);
        const bosSaatler = saatFiltreliList.filter(s => !doluSaatlerListesi.includes(s));

        // BAŞARILI YANIT (CORS EKLİ)
        return new Response(JSON.stringify(bosSaatler), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
};

// 2. DIŞARIDAN GELEN TALEP FORMU (POST)
export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        
        if (!body.kisiAdi || !body.telefon || !body.tarih || !body.saat || !body.hoca) {
            return new Response(JSON.stringify({ error: "Eksik bilgi." }), { status: 400, headers: corsHeaders });
        }

        const hocaKey = body.hoca;
        const kortNo = hocaKey === 'irem' ? 2 : 3;

        const cakisiyorMu = await db.select().from(rezervasyonlar).where(
            and(
                eq(rezervasyonlar.tarih, body.tarih),
                eq(rezervasyonlar.saat, body.saat),
                or(eq(rezervasyonlar.alanId, kortNo), eq(rezervasyonlar.notlar, hocaKey))
            )
        ).limit(1);

        if (cakisiyorMu.length > 0) {
            return new Response(JSON.stringify({ error: "Seçilen saat az önce doldu, lütfen yeni bir saat seçin." }), { status: 400, headers: corsHeaders });
        }

        await db.insert(rezervasyonlar).values({
            alanId: kortNo,
            tarih: body.tarih,
            saat: body.saat,
            kisiAdi: body.kisiAdi.trim(),
            telefon: body.telefon.trim(),
            rezervasyonTuru: 'Manuel Terapi Talebi (Web)',
            notlar: hocaKey,
            cinsiyet: 'Bilinmiyor',
            onayDurumu: 'bekliyor' // Bekliyor olarak kayıt
        });

        return new Response(JSON.stringify({ success: true, message: "Talebiniz alındı. İncelenip onay mesajı iletilecektir." }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } catch (error: any) {
         return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
};