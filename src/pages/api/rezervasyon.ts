import type { APIRoute } from 'astro';
import { db } from '../../db';
import { rezervasyonlar, musteriler } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { jwtVerify } from 'jose';

export const prerender = false;

const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

// --- KİMLİK OKUMA FONKSİYONU ---
async function kimlikGetir(cookies: any) {
    try {
        const token = cookies.get('auth_token')?.value;
        if (!token) return null;
        
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return { rol: payload.rol, kullaniciAdi: payload.kullaniciAdi };
    } catch (e) {
        return null;
    }
}

// --- İLETİMERKEZİ SMS GÖNDERME FONKSİYONU ---
async function smsGonder(telefon: string, mesaj: string) {
    const temizTelefon = telefon.replace(/\D/g, '');
    console.log(`\n📱 [SMS GÖNDERİLDİ - İletiMerkezi API]\n👤 Alıcı: ${temizTelefon}\n💬 Mesaj: ${mesaj}\n`);
    return true;
}

// YARDIMCI FONKSİYON: Bir tarihe X gün ekleyip "YYYY-MM-DD" formatında döndürür
function tarihEkle(baslangicTarihi: string, eklenecekGun: number): string {
    const tarih = new Date(baslangicTarihi);
    tarih.setDate(tarih.getDate() + eklenecekGun);
    return tarih.toISOString().slice(0, 10);
}

// 1. VERİ GETİRME (GET)
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
        const istenenTarih = url.searchParams.get('tarih');
        if (!istenenTarih) return new Response(JSON.stringify({ error: "Tarih eksik!" }), { status: 400 });

        let kayitlar = istenenTarih === 'hepsi' 
            ? await db.select().from(rezervasyonlar) 
            : await db.select().from(rezervasyonlar).where(eq(rezervasyonlar.tarih, istenenTarih));

        return new Response(JSON.stringify(kayitlar), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

// 2. KAYIT EKLEME (POST)
export const POST: APIRoute = async ({ request, cookies }) => {
    const kimlik = await kimlikGetir(cookies);
    if (!kimlik) return new Response(JSON.stringify({ error: "Oturum süresi dolmuş." }), { status: 401 });

    try {
        const body = await request.json();
        const haftaSayisi = parseInt(body.haftaSayisi) || 1; 
        const kortNo = parseInt(body.kortNo);
        const cinsiyet = body.cinsiyet || 'erkek';
        
        // --- AKILLI UZMAN BELİRLEME (Fiziksel Oda ve Cinsiyete Göre) ---
        let uzmanKey = 'huseyin';
        if (kortNo === 1) uzmanKey = 'huseyin';
        else if (kortNo === 2) uzmanKey = 'irem';
        else if (kortNo === 3) uzmanKey = 'erdogan';
        else if (kortNo === 4) {
            uzmanKey = (cinsiyet === 'kadin') ? 'muruvet' : 'erdogan';
        }
        
        // --- GEÇMİŞ TARİH KONTROLÜ ---
        const simdi = new Date();
        const turkiyeSaatFarki = simdi.getTimezoneOffset() * 60000;
        const bugunTarihi = new Date(simdi.getTime() - turkiyeSaatFarki).toISOString().slice(0, 10);

        if (body.tarih < bugunTarihi && kimlik.rol !== 'yonetici') {
            return new Response(JSON.stringify({ error: "Geçmiş tarihlere yeni rezervasyon eklenemez!" }), { status: 400 });
        }

        let basariliKayitSayisi = 0;
        let atlananKayitSayisi = 0;

        for (let i = 0; i < haftaSayisi; i++) {
            const islenecekTarih = tarihEkle(body.tarih, i * 7);

            const cakisiyorMu = await db.select().from(rezervasyonlar).where(
                and(
                    eq(rezervasyonlar.tarih, islenecekTarih), 
                    eq(rezervasyonlar.saat, body.saat), 
                    eq(rezervasyonlar.alanId, kortNo)
                )
            ).limit(1);

            if (cakisiyorMu.length > 0) {
                atlananKayitSayisi++;
                continue; 
            }

            await db.insert(rezervasyonlar).values({
                alanId: kortNo, 
                tarih: islenecekTarih, 
                saat: body.saat,
                kisiAdi: body.kisiAdi, 
                telefon: body.telefon, 
                rezervasyonTuru: body.rezervasyonTuru,
                cinsiyet: cinsiyet,
                notlar: uzmanKey 
            });

            basariliKayitSayisi++;
        }

        if (body.telefon) {
            const mevcut = await db.select().from(musteriler).where(eq(musteriler.adSoyad, body.kisiAdi)).limit(1);
            if (mevcut.length === 0) {
                await db.insert(musteriler).values({ adSoyad: body.kisiAdi, telefon: body.telefon });
            }
            
            if (basariliKayitSayisi > 0) {
                let smsMetni = haftaSayisi > 1 
                    ? `Sayın ${body.kisiAdi}, ${body.saat} saatindeki rezervasyonunuz ${basariliKayitSayisi} hafta boyunca periyodik olarak oluşturulmuştur. - Manuvital`
                    : `Sayın ${body.kisiAdi}, ${body.tarih} tarihi saat ${body.saat} için rezervasyonunuz başarıyla oluşturulmuştur. - Manuvital`;
                await smsGonder(body.telefon, smsMetni);
            }
        }

        if (basariliKayitSayisi === 0) {
            return new Response(JSON.stringify({ error: "Seçtiğiniz saat dilimi tüm haftalar için doludur. Lütfen başka bir saat seçin." }), { status: 400 });
        }

        return new Response(JSON.stringify({ 
            success: true, 
            wpSent: !!body.telefon,
            basariliKayit: basariliKayitSayisi,
            atlananKayit: atlananKayitSayisi
        }), { status: 200 });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

// 3. KAYIT DÜZENLEME (PUT)
export const PUT: APIRoute = async ({ request, cookies }) => {
    const kimlik = await kimlikGetir(cookies);
    if (!kimlik) return new Response(JSON.stringify({ error: "Oturum süresi dolmuş." }), { status: 401 });

    try {
        const body = await request.json();
        
        const guncellenecek = await db.select().from(rezervasyonlar).where(eq(rezervasyonlar.id, parseInt(body.id))).limit(1);
        if (guncellenecek.length === 0) return new Response(JSON.stringify({ error: "Kayıt bulunamadı!" }), { status: 404 });
        
        if (kimlik.rol === 'uzman' && guncellenecek[0].notlar !== kimlik.kullaniciAdi) {
             return new Response(JSON.stringify({ error: "Sadece kendi oluşturduğunuz dersleri düzenleyebilirsiniz!" }), { status: 403 });
        }

        const kortNo = parseInt(guncellenecek[0].alanId || 1);
        const cinsiyet = body.cinsiyet || guncellenecek[0].cinsiyet || 'erkek';

        let uzmanKey = guncellenecek[0].notlar;
        if (kortNo === 4) {
            uzmanKey = (cinsiyet === 'kadin') ? 'muruvet' : 'erdogan';
        }

        await db.update(rezervasyonlar).set({
            kisiAdi: body.kisiAdi, 
            telefon: body.telefon, 
            rezervasyonTuru: body.rezervasyonTuru,
            cinsiyet: cinsiyet,
            notlar: uzmanKey
        }).where(eq(rezervasyonlar.id, parseInt(body.id)));

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

// 4. KAYIT SİLME (DELETE)
export const DELETE: APIRoute = async ({ request, cookies }) => {
    const kimlik = await kimlikGetir(cookies);
    if (!kimlik) return new Response(JSON.stringify({ error: "Oturum süresi dolmuş." }), { status: 401 });

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) return new Response(JSON.stringify({ error: "ID eksik!" }), { status: 400 });

        const silinecekKayit = await db.select().from(rezervasyonlar).where(eq(rezervasyonlar.id, parseInt(id))).limit(1);
        if (silinecekKayit.length === 0) return new Response(JSON.stringify({ success: true }), { status: 200 });
        const k = silinecekKayit[0];

        if (kimlik.rol === 'uzman' && k.notlar !== kimlik.kullaniciAdi) {
            return new Response(JSON.stringify({ error: "Sadece kendi oluşturduğunuz dersleri iptal edebilirsiniz!" }), { status: 403 });
        }

        await db.delete(rezervasyonlar).where(eq(rezervasyonlar.id, parseInt(id)));
        
        if (k.telefon) {
            const iptalMetni = `Sayın ${k.kisiAdi}, ${k.tarih} tarihi saat ${k.saat} olan rezervasyonunuz iptal edilmiştir. - Manuvital`;
            await smsGonder(k.telefon, iptalMetni);
        }
        
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};