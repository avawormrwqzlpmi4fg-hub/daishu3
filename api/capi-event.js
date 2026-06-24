// api/capi-event.js — Vercel Serverless Function
// 接收落地页发来的事件，转发给 Meta Conversions API
// 
// 部署：放入项目根目录 api/ 文件夹，Vercel 自动识别
// 环境变量：在 Vercel Dashboard 设置 META_PIXEL_ID 和 META_ACCESS_TOKEN

export default async function handler(req, res) {
  // 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — 允许落地页跨域请求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { event_name, user_data, custom_data, event_id } = req.body;

  if (!event_name || !event_id) {
    return res.status(400).json({ error: 'Missing event_name or event_id' });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.error('[CAPI] Missing META_PIXEL_ID or META_ACCESS_TOKEN env vars');
    return res.status(500).json({ error: 'Server config missing' });
  }

  // 发送到 Meta Graph API
  const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`;

  const payload = {
    data: [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: req.headers.referer || '',
      user_data: {
        client_ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
        client_user_agent: req.headers['user-agent'] || '',
        fbp: user_data?._fbp || '',
        fbc: user_data?._fbc || '',
      },
      custom_data: custom_data || {},
      event_id, // 与前端 Pixel 事件 ID 相同 → Meta 自动去重
    }],
  };

  // 测试模式：上线后删除 META_TEST_EVENT_CODE 环境变量
  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('[CAPI] Meta response:', JSON.stringify(result));

    return res.status(200).json({
      success: true,
      meta_received: result.events_received === 1,
      meta_response: result,
    });
  } catch (error) {
    console.error('[CAPI] Error sending to Meta:', error.message);
    return res.status(500).json({ error: 'Failed to send to Meta', detail: error.message });
  }
}
