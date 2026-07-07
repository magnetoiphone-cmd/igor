// API de Conversões - Meta CAPI
// Recebe eventos do site e envia pro Meta

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

    const { eventName, eventId, sourceUrl, userAgent, fbp, fbc } = req.body;

    // Pegar IP do visitante
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      '';

    // Montar o evento no formato do Meta CAPI
    const eventData = {
      event_name: eventName || 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId || `${Date.now()}_${Math.random().toString(36).substring(7)}`,
      event_source_url: sourceUrl || '',
      action_source: 'website',
      user_data: {
        client_ip_address: clientIp,
        client_user_agent: userAgent || req.headers['user-agent'] || '',
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
      },
    };

    const payload = {
      data: [eventData],
    };

    // Enviar pro Meta
    const url = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;

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
