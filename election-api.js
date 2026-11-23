function electionAPIURL(pathname) {
  const base = window.electionAPIBase;
  if (!base) {
    const message = location.protocol === 'file:'
      ? 'กรุณาเปิดเว็บผ่าน http://127.0.0.1:8081 เพื่อเชื่อมต่อเซิร์ฟเวอร์เลือกตั้ง'
      : 'หน้าเว็บนี้ยังไม่ได้ตั้งค่าที่อยู่เซิร์ฟเวอร์เลือกตั้ง';
    throw Object.assign(new Error(message), { code: 'functions/configuration' });
  }
  const url = new URL(pathname, base);
  const loopback = (hostname) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const bothLocal = location.protocol === 'http:' && url.protocol === 'http:' &&
    loopback(location.hostname) && loopback(url.hostname);
  if (!bothLocal && url.protocol !== 'https:') {
    throw Object.assign(new Error('เซิร์ฟเวอร์เลือกตั้งต้องใช้ HTTPS'), { code: 'functions/configuration' });
  }
  return url.href;
}

async function electionRequest(pathname, { data, file, admin = false, signal } = {}) {
  const url = electionAPIURL(pathname);
  const headers = { 'ngrok-skip-browser-warning': 'true' };
  if (admin) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('กรุณาเข้าสู่ระบบผู้ดูแลอีกครั้ง');
    headers.Authorization = `Bearer ${token}`;
  }
  if (data) headers['Content-Type'] = 'application/json';
  if (file) headers['Content-Type'] = file.type;
  let response;
  try {
    response = await fetch(url, {
      method: data || file ? 'POST' : 'GET', headers,
      body: file ?? (data ? JSON.stringify(data) : undefined),
      cache: 'no-store', signal
    });
  } catch {
    throw Object.assign(new Error('เชื่อมต่อเซิร์ฟเวอร์เลือกตั้งไม่ได้'), { code: 'functions/unavailable' });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload.code ?? (response.status === 404 ? 'not-found' : 'internal');
    throw Object.assign(new Error(payload.message ?? 'ระบบเลือกตั้งตอบกลับไม่สำเร็จ'), { code: `functions/${code}` });
  }
  return payload;
}

async function sendBallot(data) {
  const retryable = new Set(['functions/unavailable', 'functions/aborted', 'functions/internal']);
  for (let attempt = 0; ; attempt++) {
    try {
      const receipt = await electionRequest('/api/castVote', { data, signal: AbortSignal.timeout(15000) });
      if (receipt.success === true) return;
      throw Object.assign(new Error('Ballot response missing'), { code: 'functions/unavailable' });
    } catch (error) {
      if (attempt === 2 || !retryable.has(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1) + Math.random() * 400));
    }
  }
}

async function watchAdminParticipation(signal, receive, disconnected) {
  while (!signal.aborted) {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token || signal.aborted) return;
      const response = await fetch(electionAPIURL('/api/admin/participation'), {
        headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }, signal, cache: 'no-store'
      });
      if (response.status === 401 || response.status === 403) {
        disconnected('กรุณาเข้าสู่ระบบผู้ดูแลใหม่');
        return;
      }
      if (!response.ok || !response.body) throw new Error('Participation stream unavailable');
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done || signal.aborted) break;
          buffer += value;
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const event = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (event.startsWith('data: ')) receive(JSON.parse(event.slice(6)));
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      if (signal.aborted) return;
    } catch {
      if (signal.aborted) return;
      disconnected('กำลังเชื่อมต่อข้อมูลการใช้สิทธิ์ใหม่');
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
