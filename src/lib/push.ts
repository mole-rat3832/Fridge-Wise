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

export type PushSupport = 'supported' | 'needs-install' | 'unsupported' | 'not-configured';

export function pushSupport(): PushSupport {
  if (!env.vapidPublicKey) return 'not-configured';
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

/** Ask permission, subscribe, and store the subscription for this user. */
export async function enablePush(): Promise<void> {
  const support = pushSupport();
  if (support === 'not-configured') throw new Error('Push is not configured for this site yet (VITE_VAPID_PUBLIC_KEY is missing).');
  if (support === 'needs-install') throw new Error('On iPhone and iPad, add FridgeWise to your Home Screen first (Share → Add to Home Screen), then turn on notifications from the installed app. Requires iOS 16.4 or later.');
  if (support === 'unsupported') throw new Error("This browser doesn't support push notifications.");

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings to get reminders.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey!) });
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
