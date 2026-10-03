import type { APIRoute } from 'astro';
import { db } from '../../db';
import { kapaliGunler } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { jwtVerify } from 'jose';

export const prerender = false;
const JWT_SECRET = new TextEncoder().encode(import.meta.env.JWT_SECRET || 'gizli_anahtar_degistir_lutfen');

// 1. İzinleri Getir (GET)
export const GET: APIRoute = async ({ cookies }) => {
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 401 });
    try { await jwtVerify(token, JWT_SECRET); } catch (e) { return new Response(JSON.stringify({ error: "Geçersiz oturum" }), { status: 403 }); }

    try {
        const izinler = await db.select().from(kapaliGunler);
        return new Response(JSON.stringify(izinler), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

// 2. İzin Ekle (POST)
export const POST: APIRoute = async ({ request, cookies }) => {
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 401 });
    try { await jwtVerify(token, JWT_SECRET); } catch (e) { return new Response(JSON.stringify({ error: "Geçersiz oturum" }), { status: 403 }); }

    try {
        const body = await request.json();
        await db.insert(kapaliGunler).values({
            tip: body.tip,
            deger: body.deger.toString(),
            kapsam: body.kapsam.toString(),
            sebep: body.sebep
        });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};

// 3. İzin Sil (DELETE)
export const DELETE: APIRoute = async ({ request, cookies }) => {
    const token = cookies.get('auth_token')?.value;
    if (!token) return new Response(JSON.stringify({ error: "Yetkisiz" }), { status: 401 });
    try { await jwtVerify(token, JWT_SECRET); } catch (e) { return new Response(JSON.stringify({ error: "Geçersiz oturum" }), { status: 403 }); }

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) return new Response(JSON.stringify({ error: "ID eksik" }), { status: 400 });
        
        await db.delete(kapaliGunler).where(eq(kapaliGunler.id, parseInt(id)));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};