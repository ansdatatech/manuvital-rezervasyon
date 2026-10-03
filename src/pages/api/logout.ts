import type { APIRoute } from 'astro';

export const POST: APIRoute = async () => {
    // auth_token çerezini süresini geçmiş (1970) göstererek tarayıcıdan siliyoruz
    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
            'Set-Cookie': 'auth_token=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
            'Content-Type': 'application/json'
        }
    });
};