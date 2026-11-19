import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const nav = navigator as Navigator & { standalone?: boolean };
if (nav.standalone) {
  document.documentElement.classList.add('ios-standalone');
}

const ua = nav.userAgent || '';
const isIPhone = /iPhone|iPod/i.test(ua);
const isIPad =
  /iPad/i.test(ua) ||
  (/Macintosh/i.test(ua) && (nav.maxTouchPoints || 0) > 1);

if (isIPhone) {
  document.documentElement.classList.add('device-iphone');
} else if (isIPad) {
  document.documentElement.classList.add('device-ipad');
}

const versionMatch = /Version\/(\d+)/i.exec(ua) || /OS (\d+)_/i.exec(ua);
const majorVer = versionMatch ? Number(versionMatch[1]) : 0;
const supportsAnchorPositioning =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('anchor-name', '--a');

if (majorVer >= 19 || supportsAnchorPositioning) {
  document.documentElement.classList.add('ios-liquid-glass');
}

createRoot(document.getElementById('root')!).render(<App />);
