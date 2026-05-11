import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, subject, body, pdfBase64, fileName, extraAttachments } = await req.json();

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY non configuré' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const attachments: Array<{ filename: string; content: string }> = [];
    if (pdfBase64 && fileName) attachments.push({ filename: fileName, content: pdfBase64 });
    if (Array.isArray(extraAttachments)) attachments.push(...extraAttachments);

    const payload: Record<string, unknown> = {
      from: FROM_EMAIL,
      to: [to],
      subject,
      text: body,
    };

    if (attachments.length > 0) {
      payload.attachments = attachments;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data.message || 'Erreur Resend' }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
