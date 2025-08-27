// backend/mailer.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || 'false') === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

export async function verifyMailer() {
  try { await transporter.verify(); console.log('Mailer OK ->', process.env.SMTP_HOST); }
  catch (e) { console.log('Mailer ERROR:', e?.message || e); }
}

export async function sendWelcomeEmail(to, name = '') {
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
  const fromName  = process.env.FROM_NAME  || 'Tienda F1';
  const html = `<div style="font-family:Arial,sans-serif"><h2>¡Bienvenido${name?`, ${name}`:''} a Tienda F1!</h2><p>Tu cuenta fue creada con <b>${to}</b>.</p></div>`;
  const text = `Bienvenido${name?`, ${name}`:''} a Tienda F1. Cuenta: ${to}`;
  return transporter.sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject: '¡Bienvenido a Tienda F1!', text, html });
}

export async function sendOrderEmail(to, payload) {
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
  const fromName  = process.env.FROM_NAME  || 'Tienda F1';
  const { orderId, total, items = [] } = payload || {};
  const rows = items.map(it => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${it.name}</td><td style="text-align:center;padding:6px 8px;border-bottom:1px solid #eee">${it.quantity}</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #eee">$ ${it.price.toFixed(2)}</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #eee"><b>$ ${(it.price*it.quantity).toFixed(2)}</b></td></tr>`).join('');
  const html = `<div style="font-family:Arial,sans-serif"><h2>Gracias por tu compra</h2><p>Orden <b>#${orderId}</b> confirmada.</p><table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#fafafa"><thead><tr style="background:#efefef"><th style="text-align:left;padding:8px">Producto</th><th style="text-align:center;padding:8px">Cant.</th><th style="text-align:right;padding:8px">Precio</th><th style="text-align:right;padding:8px">Subtotal</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:12px;font-size:16px">Total: <b>$ ${total.toFixed(2)}</b></p></div>`;
  const text = `Orden #${orderId} confirmada. Total $${total.toFixed(2)}.`;
  return transporter.sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject: `Tu compra — Orden #${orderId}`, text, html });
}

export async function sendOrderAdminEmail(toList, payload) {
  if (!toList) return;
  const to = String(toList).split(',').map(s => s.trim()).filter(Boolean);
  if (!to.length) return;

  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
  const fromName  = process.env.FROM_NAME  || 'Tienda F1';

  const { orderId, total, items = [], buyerEmail, buyerPhone } = payload || {};
  const rows = items.map(it =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${it.name}</td>
         <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #eee">${it.quantity}</td>
         <td style="text-align:right;padding:6px 8px;border-bottom:1px solid #eee">$ ${Number(it.price).toFixed(2)}</td>
         <td style="text-align:right;padding:6px 8px;border-bottom:1px solid #eee"><b>$ ${(Number(it.price)*Number(it.quantity)).toFixed(2)}</b></td></tr>`
  ).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>🛒 Nueva compra</h2>
      <p>Orden <b>#${orderId}</b></p>
      <p>Cliente: <b>${buyerEmail || 'N/D'}</b>${buyerPhone ? ` — Tel: <b>${buyerPhone}</b>` : ''}</p>
      <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#fafafa">
        <thead>
          <tr style="background:#efefef">
            <th style="text-align:left;padding:8px">Producto</th>
            <th style="text-align:center;padding:8px">Cant.</th>
            <th style="text-align:right;padding:8px">Precio</th>
            <th style="text-align:right;padding:8px">Subtotal</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:12px;font-size:16px">Total: <b>$ ${Number(total).toFixed(2)}</b></p>
    </div>`;

  const text = `Nueva compra — Orden #${orderId} — Cliente: ${buyerEmail || 'N/D'}${buyerPhone ? ' — Tel: ' + buyerPhone : ''} — Total $${Number(total).toFixed(2)}`;

  return transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: `Nueva compra — Orden #${orderId}`,
    text,
    html
  });
}


