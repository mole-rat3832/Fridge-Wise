// send-reminders: scheduled by pg_cron (see the reminders migration). Not callable by users.
//
// POST { task: "reminders" | "cleanup" | "setup" } with header x-cron-secret: <secret>
//
// reminders: one grouped Web Push notification per user for active items expiring within their
//            reminder_days_before (in their timezone), logged to reminder_log (unique per day).
// cleanup:   deletes scan images older than 30 days through the Storage API.
// setup:     makes sure the Web Push keys exist (they are created on first use otherwise).
//
// The cron secret and the VAPID keys live in Supabase Vault (see the reminders migration), so no
// one has to copy them around. CRON_SECRET / VAPID_* edge function secrets, if set, take priority.
//
// This is the ONLY place the secret (service role) key is used.
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { createClient as createSupabaseClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { readKey } from '../_shared/supabase.ts';

interface DueRow {
  user_id: string;
  local_date: string;
  items: Array<{ id: string; name: string; expiration_date: string; days_left: number }>;
  subscriptions: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> | null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A new P-256 key pair in the standard base64url format (same as `npx web-push generate-vapid-keys`). */
async function generateVapidPair(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: bytesToB64url(raw), privateKey: jwk.d! };
}

/** VAPID keys: edge function secrets if set, otherwise the pair kept in Vault (created on first use). */
async function vapidKeyStrings(admin: SupabaseClient): Promise<{ publicKey: string; privateKey: string }> {
  const envPublic = Deno.env.get('VAPID_PUBLIC_KEY')?.trim();
  const envPrivate = Deno.env.get('VAPID_PRIVATE_KEY')?.trim();
  if (envPublic && envPrivate) return { publicKey: envPublic, privateKey: envPrivate };

  const { data, error } = await admin.rpc('vapid_keys');
  if (error) throw new Error(error.message);
  const row = (data as Array<{ public_key: string | null; private_key: string | null }> | null)?.[0];
  if (row?.public_key && row.private_key) return { publicKey: row.public_key, privateKey: row.private_key };

  const fresh = await generateVapidPair();
  const { data: stored, error: storeError } = await admin.rpc('store_vapid_keys', { p_public: fresh.publicKey, p_private: fresh.privateKey });
  if (storeError) throw new Error(storeError.message);
  const kept = (stored as Array<{ public_key: string; private_key: string }>)[0];
  return { publicKey: kept.public_key, privateKey: kept.private_key };
}

async function loadVapidKeys(admin: SupabaseClient): Promise<CryptoKeyPair> {
  const { publicKey, privateKey } = await vapidKeyStrings(admin);
  const pub = b64urlToBytes(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new HttpError(503, 'VAPID_PUBLIC_KEY is not a valid P-256 key.', 'push_not_configured');
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  return await webpush.importVapidKeys({
    publicKey: { kty: 'EC', crv: 'P-256', x, y, ext: true },
    privateKey: { kty: 'EC', crv: 'P-256', x, y, d: privateKey, ext: true },
  });
}

function describe(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function buildMessage(items: DueRow['items']) {
  const shown = items.slice(0, 4).map((i) => `${i.name} (${describe(i.days_left)})`);
  const more = items.length > 4 ? `, +${items.length - 4} more` : '';
  const today = items.filter((i) => i.days_left <= 0).length;
  return {
    title: today > 0
      ? `${today} item${today === 1 ? '' : 's'} to use today`
      : `${items.length} item${items.length === 1 ? '' : 's'} to use soon`,
    body: shown.join(', ') + more,
    url: '/?status=soon',
    tag: 'fridgewise-reminder',
  };
}

async function authorized(admin: SupabaseClient, given: string): Promise<boolean> {
  if (!given) return false;
  const expected = Deno.env.get('CRON_SECRET')?.trim();
  if (expected) return timingSafeEqual(expected, given);
  const { data, error } = await admin.rpc('verify_cron_secret', { p_secret: given });
  return !error && data === true;
}

serve(async (req) => {
  const admin = createSupabaseClient(Deno.env.get('SUPABASE_URL')!, readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!(await authorized(admin, req.headers.get('x-cron-secret') ?? ''))) {
    throw new HttpError(401, 'Unauthorized.', 'unauthorized');
  }

  const body = (await readJson(req).catch(() => ({}))) as { task?: string };
  const task = body.task === 'cleanup' ? 'cleanup' : body.task === 'setup' ? 'setup' : 'reminders';

  // -------------------------------------------------------------------------
  if (task === 'setup') {
    const { publicKey } = await vapidKeyStrings(admin);
    return json(req, { task, vapid_public_key: publicKey });
  }

  // -------------------------------------------------------------------------
  if (task === 'cleanup') {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: old, error } = await admin
      .from('scans')
      .select('id, image_path')
      .not('image_path', 'is', null)
      .lt('created_at', cutoff)
      .limit(1000);
    if (error) throw new Error(error.message);
    const paths = (old ?? []).map((s) => s.image_path as string);
    let removed = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error: rmError } = await admin.storage.from('scans').remove(chunk);
      if (rmError) throw new Error(rmError.message);
      removed += chunk.length;
    }
    if (paths.length > 0) {
      const ids = (old ?? []).map((s) => s.id);
      await admin.from('scans').update({ image_path: null }).in('id', ids);
      await admin.from('food_items').update({ image_path: null }).in('image_path', paths);
    }
    return json(req, { task, removed_images: removed });
  }

  // -------------------------------------------------------------------------
  const { data, error } = await admin.rpc('due_reminders');
  if (error) throw new Error(error.message);
  const due = (data ?? []) as DueRow[];
  if (due.length === 0) return json(req, { task, users: 0, sent: 0 });

  const vapidKeys = await loadVapidKeys(admin);
  // Contact for push services (mailto: or https: URL). Optional; set VAPID_SUBJECT to your own.
  const contact = Deno.env.get('VAPID_SUBJECT')?.trim() || 'mailto:fridgewise@example.com';

  let sent = 0;
  let failed = 0;
  let removedSubscriptions = 0;
  const logRows: Array<{ user_id: string; food_item_id: string; sent_on: string; channel: string }> = [];

  for (const row of due) {
    const message = JSON.stringify(buildMessage(row.items));
    let delivered = false;
    for (const sub of row.subscriptions ?? []) {
      try {
        // A fresh application-server key pair per message (RFC 8291).
        const appServer = await webpush.ApplicationServer.new({ contactInformation: contact, vapidKeys });
        const subscriber = appServer.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
        await subscriber.pushTextMessage(message, { ttl: 12 * 3600, urgency: webpush.Urgency.Normal, topic: 'fridgewise' });
        delivered = true;
        sent++;
      } catch (err) {
        failed++;
        const status = err instanceof webpush.PushMessageError ? err.response.status : 0;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          removedSubscriptions++;
        } else {
          console.error('push failed', status, err instanceof Error ? err.message : String(err));
        }
      }
    }
    if (delivered) {
      for (const item of row.items) {
        logRows.push({ user_id: row.user_id, food_item_id: item.id, sent_on: row.local_date, channel: 'push' });
      }
    }
  }

  if (logRows.length > 0) {
    const { error: logError } = await admin
      .from('reminder_log')
      .upsert(logRows, { onConflict: 'user_id,food_item_id,sent_on,channel', ignoreDuplicates: true });
    if (logError) throw new Error(logError.message);
  }

  return json(req, { task, users: due.length, sent, failed, removed_subscriptions: removedSubscriptions, logged: logRows.length });
});
