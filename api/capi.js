// API de Conversões - Meta CAPI
// Recebe eventos do site e envia pro Meta
// 21/10/2026: whitelist de eventos, hash SHA-256 de telefone/nome (user_data), Graph API v22.0

import crypto from 'crypto';

const EVENTOS_PERMITIDOS = ['Lead', 'Contact', 'FindLocation'];

function sha256(valor) {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

// Telefone no padrão E.164 sem "+": 55 + DDD + número
function normalizarTelefone(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 ? d : null;
}

function normalizarNome(nome) {
  const partes = String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return {};
  return {
    fn: partes[0],
    ...(partes.length > 1 && { ln: partes[partes.length - 1] }),
  };
}

export default async function handler(req, res) {
  // Configurar CORS para aceitar requisições do site
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder ao preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Só aceitar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const PIXEL_ID = '3144459599096452';
    const ACCESS_TOKEN = process.env.META_CAPI_TOKEN;

    if (!ACCESS_TOKEN) {
      console.error('META_CAPI_TOKEN não configurado');
      return res.status(500).json({ error: 'Token não configurado' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { eventName, eventId, sourceUrl, userAgent, fbp, fbc, phone, name } = body;

    // Só aceita eventos conhecidos (evita disparos indevidos de "Lead")
    if (!EVENTOS_PERMITIDOS.includes(eventName)) {
      return res.status(400).json({ error: 'Evento não permitido' });
    }

    // Pegar IP do visitante
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      '';

    // Dados do usuário com hash (apenas quando vierem do formulário)
    const tel = normalizarTelefone(phone);
    const { fn, ln } = normalizarNome(name);

    // Montar o evento no formato do Meta CAPI
    const eventData = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId || `${Date.now()}_${Math.random().toString(36).substring(7)}`,
      event_source_url: sourceUrl || '',
      action_source: 'website',
      user_data: {
        client_ip_address: clientIp,
        client_user_agent: userAgent || req.headers['user-agent'] || '',
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
        ...(tel && { ph: [sha256(tel)] }),
        ...(fn && { fn: [sha256(fn)] }),
        ...(ln && { ln: [sha256(ln)] }),
        country: [sha256('br')],
      },
    };

    const payload = {
      data: [eventData],
    };

    // Enviar pro Meta
    const url = `https://graph.facebook.com/v22.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;

    const metaResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error('Erro Meta:', result);
      return res.status(500).json({ error: 'Erro ao enviar pro Meta', details: result });
    }

    return res.status(200).json({ success: true, meta_response: result });
  } catch (error) {
    console.error('Erro na função:', error);
    return res.status(500).json({ error: 'Erro interno', message: error.message });
  }
}
