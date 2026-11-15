'use client';
import { useEffect, useState } from 'react';

/** "Install the app" for phones and tablets: one tap on Android/Chrome; short steps on iPhone/iPad. */
export default function InstallApp() {
  const [evt, setEvt] = useState<any>(null); const [ios, setIos] = useState(false); const [installed, setInstalled] = useState(false); const [help, setHelp] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (standalone) { setInstalled(true); return; }
    const ua = navigator.userAgent; setIos(/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1));
    const on = (e: Event) => { e.preventDefault(); setEvt(e); };
    window.addEventListener('beforeinstallprompt', on); window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (installed || (!evt && !ios)) return null;
  return <div className="install">
    {evt ? <button type="button" className="btn-block" onClick={async () => { evt.prompt(); await evt.userChoice.catch(() => null); setEvt(null); }}>⬇ Install the RE-PMS app</button>
      : <button type="button" className="btn-block" onClick={() => setHelp(!help)}>⬇ Add RE-PMS to your Home Screen</button>}
    {help && <div className="info" style={{ marginTop: 8 }}>In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>. RE-PMS then opens full screen like an app.</div>}
  </div>;
}
