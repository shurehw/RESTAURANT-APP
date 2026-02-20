// Standalone script - uses net+tls+crypto directly, no npm deps needed
// Supports SCRAM-SHA-256 auth (Azure Postgres requirement)
import tls from 'tls';
import crypto from 'crypto';
import net from 'net';
import { TIPSEE_CONFIG } from './_config.mjs';

const HOST = TIPSEE_CONFIG.host;
const PORT = TIPSEE_CONFIG.port;
const USER = TIPSEE_CONFIG.user;
const PASS = TIPSEE_CONFIG.password;
const DB   = TIPSEE_CONFIG.database;

const QUERY = `
  SELECT
    id, review_id, source, location_uuid,
    rating, review_date, tags,
    thirdparty_id, thirdparty_url,
    LEFT(content, 120) as content_preview,
    jsonb_typeof(replies) as replies_type,
    CASE WHEN replies IS NOT NULL AND replies != 'null'::jsonb
      THEN jsonb_array_length(CASE WHEN jsonb_typeof(replies) = 'array' THEN replies ELSE '[]'::jsonb END)
      ELSE 0 END as reply_count,
    LEFT(replies::text, 200) as replies_preview,
    LEFT(location::text, 200) as location_preview
  FROM public.reviews
  ORDER BY review_date DESC
  LIMIT 3;
`;

function i32(buf, offset) { return buf.readInt32BE(offset); }
function writeI32(val) { const b = Buffer.alloc(4); b.writeInt32BE(val); return b; }

function buildStartup() {
  const params = Buffer.from(`user\0${USER}\0database\0${DB}\0\0`);
  const len = 4 + 4 + params.length;
  return Buffer.concat([writeI32(len), writeI32(196608), params]);
}

function buildQuery(q) {
  const payload = Buffer.from(q + '\0');
  const len = 4 + payload.length;
  return Buffer.concat([Buffer.from('Q'), writeI32(len), payload]);
}

function buildSSLRequest() {
  return Buffer.concat([writeI32(8), writeI32(80877103)]);
}

// SCRAM-SHA-256 implementation
function buildSASLInit(mechanism, clientFirstMsg) {
  const mechBuf = Buffer.from(mechanism + '\0');
  const msgBuf = Buffer.from(clientFirstMsg);
  const len = 4 + mechBuf.length + 4 + msgBuf.length;
  return Buffer.concat([Buffer.from('p'), writeI32(len), mechBuf, writeI32(msgBuf.length), msgBuf]);
}

function buildSASLResponse(msg) {
  const msgBuf = Buffer.from(msg);
  const len = 4 + msgBuf.length;
  return Buffer.concat([Buffer.from('p'), writeI32(len), msgBuf]);
}

function hi(password, salt, iterations) {
  return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function h(data) {
  return crypto.createHash('sha256').update(data).digest();
}

function xorBuffers(a, b) {
  const result = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) result[i] = a[i] ^ b[i];
  return result;
}

let phase = 'ssl_request';
let tlsSock = null;
let dataBuf = Buffer.alloc(0);
let rows = [];

// SCRAM state
let clientNonce = '';
let clientFirstBare = '';
let serverFirstMsg = '';

const sock = net.createConnection({ host: HOST, port: PORT }, () => {
  sock.write(buildSSLRequest());
});

sock.on('data', (chunk) => {
  if (phase === 'ssl_request') {
    if (chunk[0] === 0x53) {
      phase = 'startup';
      tlsSock = tls.connect({ socket: sock, servername: HOST, rejectUnauthorized: false }, () => {
        tlsSock.write(buildStartup());
      });
      tlsSock.on('data', handleData);
      tlsSock.on('error', (e) => { console.error('TLS error:', e.message); process.exit(1); });
    } else {
      console.error('Server rejected SSL');
      process.exit(1);
    }
  }
});

function handleData(chunk) {
  dataBuf = Buffer.concat([dataBuf, chunk]);
  while (dataBuf.length >= 5) {
    const type = String.fromCharCode(dataBuf[0]);
    const len = i32(dataBuf, 1);
    if (dataBuf.length < 1 + len) break;
    const body = dataBuf.subarray(5, 1 + len);
    dataBuf = dataBuf.subarray(1 + len);
    handleMessage(type, body);
  }
}

function handleMessage(type, body) {
  if (type === 'R') {
    const code = i32(body, 0);
    if (code === 0) { /* auth ok */ }
    else if (code === 10) {
      // SASL auth - parse mechanisms
      const mechData = body.subarray(4).toString();
      // Send SCRAM-SHA-256 client-first
      clientNonce = crypto.randomBytes(18).toString('base64');
      clientFirstBare = `n=${USER},r=${clientNonce}`;
      const clientFirstMsg = `n,,${clientFirstBare}`;
      tlsSock.write(buildSASLInit('SCRAM-SHA-256', clientFirstMsg));
    }
    else if (code === 11) {
      // SASL continue - server-first message
      serverFirstMsg = body.subarray(4).toString();
      const parts = {};
      for (const p of serverFirstMsg.split(',')) {
        const k = p[0];
        const v = p.substring(2);
        parts[k] = v;
      }
      const serverNonce = parts['r'];
      const salt = Buffer.from(parts['s'], 'base64');
      const iterations = parseInt(parts['i']);

      const saltedPassword = hi(Buffer.from(PASS), salt, iterations);
      const clientKey = hmac(saltedPassword, 'Client Key');
      const storedKey = h(clientKey);
      const serverKey = hmac(saltedPassword, 'Server Key');

      const clientFinalNoProof = `c=biws,r=${serverNonce}`;
      const authMessage = `${clientFirstBare},${serverFirstMsg},${clientFinalNoProof}`;
      const clientSignature = hmac(storedKey, authMessage);
      const proof = xorBuffers(clientKey, clientSignature);

      const clientFinal = `${clientFinalNoProof},p=${proof.toString('base64')}`;
      tlsSock.write(buildSASLResponse(clientFinal));
    }
    else if (code === 12) {
      // SASL final - auth complete
    }
    else {
      console.error('Unsupported auth:', code);
      process.exit(1);
    }
  } else if (type === 'Z') {
    if (phase === 'startup') {
      phase = 'query';
      tlsSock.write(buildQuery(QUERY));
    } else if (phase === 'query') {
      // 14 cols per row
      const COLS = 14;
      const labels = ['id','review_id','source','location_uuid','rating','review_date','tags','thirdparty_id','thirdparty_url','content_preview','replies_type','reply_count','replies_preview','location_preview'];
      for (let i = 0; i < rows.length; i += COLS) {
        console.log('--- ROW ---');
        for (let j = 0; j < COLS; j++) {
          console.log(`  ${labels[j].padEnd(20)} = ${rows[i+j]}`);
        }
      }

      tlsSock.end();
      process.exit(0);
    }
  } else if (type === 'D') {
    const numCols = body.readInt16BE(0);
    let offset = 2;
    for (let i = 0; i < numCols; i++) {
      const colLen = i32(body, offset);
      offset += 4;
      if (colLen >= 0) {
        rows.push(body.subarray(offset, offset + colLen).toString());
        offset += colLen;
      }
    }
  } else if (type === 'E') {
    // Error
    const msg = body.toString().replace(/\0/g, ' | ');
    console.error('PG Error:', msg);
  }
}

sock.on('error', (e) => { console.error('Socket error:', e.message); process.exit(1); });
