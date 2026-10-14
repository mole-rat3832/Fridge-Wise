// Web Push subscription helpers.
import { env } from './env';
import { supabase } from './supabase';

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

export function pushSupport(): PushSupport {
  if (isIOS() && !isStandalone()) return 'needs-install'; // iOS 16.4+: only for apps added to the Home Screen
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'supported';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** The Web Push public key: from the build (VITE_VAPID_PUBLIC_KEY) or from the server's public config. */
async function vapidPublicKey(): Promise<string> {
  if (env.vapidPublicKey) return env.vapidPublicKey;
  const { data } = await supabase.from('app_public_config').select('value').eq('key', 'vapid_public_key').maybeSingle();
  if (!data?.value) throw new Error('Reminders are not switched on for this site yet. Please try again later.');
  return data.value;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

async function isBrave(): Promise<boolean> {
  const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
  return Boolean(await brave?.isBrave?.().catch(() => false));
}

/** Turn the browser's push errors into something the user can act on. */
async function explainSubscribeError(err: unknown): Promise<Error> {
  const name = err instanceof DOMException ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  if (name === 'NotAllowedError') {
    return new Error('Notifications are blocked. Allow them in your browser settings to get reminders.');
  }
  // "Registration failed - push service error": the browser could not reach its push service.
  if (name === 'AbortError' || /push service/i.test(message)) {
    if (await isBrave()) {
      return new Error(
        'Brave blocks push notifications by default. Open brave://settings/privacy, turn on "Use Google services for push messaging", restart Brave and try again.',
      );
    }
    return new Error(
      "Your browser couldn't reach its notification service. Check that a VPN, ad blocker or network filter isn't blocking it, or try Chrome, Edge, Firefox or Safari. Private/incognito windows don't support notifications.",
    );
  }
  return err instanceof Error ? err : new Error(message);
}

/** Ask permission, subscribe, and store the subscription for this user. */
export async function enablePush(): Promise<void> {
  const support = pushSupport();
  if (support === 'needs-install') throw new Error('On iPhone and iPad, add FridgeWise to your Home Screen first (Share → Add to Home Screen), then turn on notifications from the installed app. Requires iOS 16.4 or later.');
  if (support === 'unsupported') throw new Error("This browser doesn't support push notifications.");

  const applicationServerKey = urlBase64ToUint8Array(await vapidPublicKey());
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings to get reminders.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with a different server key can't receive our pushes: replace it.
  if (sub && !sameKey(sub.options.applicationServerKey, applicationServerKey)) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    } catch (err) {
      throw await explainSubscribeError(err);
    }
  }
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 300) }, { onConflict: 'endpoint' });
  if (error) throw new Error(`Could not save the subscription: ${error.message}`);
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

/** Show a local test notification (checks permission and the service worker without the server). */
export async function testNotification(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('FridgeWise is ready', {
    body: "You'll get a reminder here before food expires.",
    icon: '/icons/pwa-192.png',
    badge: '/icons/badge-72.png',
    tag: 'fridgewise-test',
  });
}
