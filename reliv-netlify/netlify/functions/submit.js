// netlify/functions/submit.js
// Netlify Serverless Function (AWS Lambda compatible)
// Handles multipart/form-data, CV attachment, position rules, and Gmail sending.

const nodemailer = require('nodemailer');
const Busboy     = require('busboy');

/* ─── Constants ──────────────────────────────────────────────────────────── */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME   = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const JIYA_ONLY_POS  = new Set(['CTO']);
const EMAIL_RE       = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ─── HTML escape (XSS prevention in email) ─────────────────────────────── */
function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─── Safe link (block javascript:/data: injection) ─────────────────────── */
function safeLink(url) {
  if (!url || !String(url).trim()) return null;
  const u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return `<a href="${esc(u)}" style="color:#F26522;">${esc(u)}</a>`;
}

/* ─── Position helpers ───────────────────────────────────────────────────── */
function isJiya(name) {
  return (name || '').trim().split(/\s+/)[0].toLowerCase() === 'jiya';
}

/* ─── Parse multipart/form-data from Netlify raw event body ─────────────── */
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let   file   = null;
    let   fileBytes = 0;

    // Netlify gives us a base64-encoded body when binary data is present
    const bodyBuffer = Buffer.from(
      event.body,
      event.isBase64Encoded ? 'base64' : 'utf8'
    );

    const bb = Busboy({
      headers: {
        'content-type': event.headers['content-type'] || event.headers['Content-Type'],
      },
      limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 80 },
    });

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, stream, info) => {
      const { filename, mimeType } = info;

      // Validate MIME and extension
      const extOk = /\.(pdf|doc|docx)$/i.test(filename || '');
      if (!ALLOWED_MIME.has(mimeType) && !extOk) {
        stream.resume(); // drain and discard
        return;
      }

      const chunks = [];
      stream.on('data', chunk => {
        fileBytes += chunk.length;
        if (fileBytes <= MAX_FILE_BYTES) {
          chunks.push(chunk);
        } else {
          stream.resume(); // discard rest if over limit
        }
      });
      stream.on('end', () => {
        if (chunks.length > 0 && fileBytes <= MAX_FILE_BYTES) {
          file = {
            originalname: filename,
            buffer:       Buffer.concat(chunks),
            mimetype:     mimeType,
          };
        }
      });
    });

    bb.on('finish', () => resolve({ fields, file }));
    bb.on('error',  err => reject(err));

    // Feed the buffer into busboy
    bb.write(bodyBuffer);
    bb.end();
  });
}

/* ─── Email HTML builder ─────────────────────────────────────────────────── */
function buildEmail(d, hasCV, cvName) {
  const row = (label, value) => {
    const v = (value != null && String(value).trim() !== '')
      ? String(value).trim() : null;
    if (!v) return '';
    return `
      <tr style="border-bottom:1px solid #F5F5F5;">
        <td style="padding:10px 14px;color:#888;width:42%;vertical-align:top;font-size:13px;">${label}</td>
        <td style="padding:10px 14px;font-weight:600;color:#111;font-size:13px;">${v}</td>
      </tr>`;
  };

  const section = (icon, title) => `
    <tr>
      <td colspan="2" style="background:#FFF4EE;color:#F26522;font-weight:700;
        font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:10px 14px;">
        ${icon} ${esc(title)}
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#F6F6F6;">
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:660px;margin:0 auto;
  background:#fff;border-radius:12px;overflow:hidden;
  box-shadow:0 2px 20px rgba(0,0,0,0.08);">

  <div style="background:#F26522;padding:28px 32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:32px;font-weight:900;letter-spacing:-1px;">Reliv</h1>
    <p style="color:rgba(255,255,255,0.88);margin:6px 0 0;font-size:14px;">
      🧑‍💼 New Application —
      <strong style="color:#fff;">${esc(d.position) || '—'}</strong>
    </p>
  </div>

  <div style="padding:28px 32px;">
    <table style="width:100%;border-collapse:collapse;">

      ${section('👤', 'Applicant Info')}
      ${row('Full Name',         esc(d.name))}
      ${row('Email',             esc(d.email))}
      ${row('Phone',             esc(d.phone))}
      ${row('Gender',            esc(d.gender))}
      ${row('Age',               esc(d.age))}
      ${row('City / Location',   esc(d.city))}
      ${row('LinkedIn',          safeLink(d.linkedin))}
      ${row('Portfolio',         safeLink(d.portfolio))}

      ${section('🏢', 'Position Details')}
      ${row('Applied Position',  esc(d.position))}

      ${section('📋', 'Mission & Vision')}
      ${row('Why Reliv?',        esc(d.whyReliv))}
      ${row('Strategy / Vision', esc(d.strategy))}
      ${section('💬', 'Additional Info')}
      ${row('Message to CEO',    esc(d.messageToTeam))}
      ${row('Comments',          esc(d.comments))}
      ${row('Referred By',       esc(d.referral))}
      ${row('Time Commitment',   esc(d.timeCommit))}
      ${row('Open to Equity?',   esc(d.equity))}

      ${d.domainCategory ? section('🔧', 'Domains — ' + d.domainCategory) : ''}
      ${row('Marketing Brands',    esc(d.marketingBrands))}
      ${row('Campaigns',           esc(d.campaigns))}
      ${row('Instagram',           esc(d.instagram))}
      ${row('Other Socials',       esc(d.otherSocial))}
      ${row('Voiceover?',          esc(d.voiceover))}
      ${row('Can make Reels?',     esc(d.reels))}
      ${row('Can post Stories?',   esc(d.story))}
      ${row('Manage Social Media?',esc(d.socialManage))}
      ${row('ML / AI Project',     safeLink(d.mlProjectLink))}
      ${row('UI/UX Demo',          safeLink(d.uiuxLink))}
      ${row('Live Site',           safeLink(d.webdevLink))}
      ${row('Electronics Video',   safeLink(d.electronicsVideo))}
      ${row('Finance Tools',       esc(d.financeTools))}
      ${row('Domain Notes',        esc(d.domainNotes))}

    </table>

    <div style="margin-top:20px;padding:14px 16px;background:#F6F6F6;
      border-radius:10px;font-size:13px;color:#555;">
      ${hasCV
        ? `📎 <strong>CV attached:</strong> ${esc(cvName)}`
        : '📭 <em>No CV attached.</em>'}
    </div>
  </div>

  <div style="background:#EFEFEF;padding:14px 32px;text-align:center;border-top:1px solid #E8E8E8;">
    <p style="color:#AAA;font-size:12px;margin:0;">
      Submitted ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
      &nbsp;·&nbsp; Reliv Recruitment Form
    </p>
  </div>

</div>
</body>
</html>`;
}

/* ─── Netlify Function Handler ───────────────────────────────────────────── */
exports.handler = async function (event) {
  // ── Method guard ──────────────────────────────────────────────────────────
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed.' }) };
  }

  // ── Content-type guard ────────────────────────────────────────────────────
  const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!ct.includes('multipart/form-data')) {
    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, error: 'Expected multipart/form-data.' }),
    };
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let fields, file;
  try {
    ({ fields, file } = await parseMultipart(event));
  } catch (err) {
    console.error('Parse error:', err.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, error: 'Failed to parse form data. Please try again.' }),
    };
  }

  const d = fields;

  // ── Required field validation ─────────────────────────────────────────────
  if (!d.name || !d.name.trim()) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Full name is required.' }) };
  }
  if (!d.email || !EMAIL_RE.test(d.email.trim())) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'A valid email address is required.' }) };
  }

  // ── Position rules ────────────────────────────────────────────────────────
  const pos = (d.position || '').trim().toUpperCase();

  if (JIYA_ONLY_POS.has(pos) && !isJiya(d.name)) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        ok: false, reserved: true,
        error: 'The CTO position is exclusively reserved for applicants named Jiya.',
      }),
    };
  }

  // ── Env var check ─────────────────────────────────────────────────────────
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = (process.env.GMAIL_PASS || '').replace(/\s/g, '');
  if (!gmailUser || !gmailPass) {
    console.error('Missing GMAIL_USER or GMAIL_PASS environment variables.');
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'Server email configuration error.' }),
    };
  }

  // ── Build and send email ──────────────────────────────────────────────────
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  const attachments = file
    ? [{ filename: file.originalname, content: file.buffer, contentType: file.mimetype }]
    : [];

  try {
    await transporter.sendMail({
      from:        `"Reliv Recruitment" <${gmailUser}>`,
      to:          gmailUser,
      replyTo:     d.email.trim(),
      subject:     `🧑‍💼 ${d.position || 'Unknown'} — ${d.name.trim()} <${d.email.trim()}>`,
      html:        buildEmail(d, !!file, file?.originalname),
      attachments,
    });

    console.log(`✅ Email sent: ${d.name} <${d.email}> → ${d.position}`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };

  } catch (err) {
    console.error('Mail send error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'Failed to send email. Please try again.' }),
    };
  }
};
