import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ((navigator as Navigator & { standalone?: boolean }).standalone) {
  document.documentElement.classList.add('ios-standalone');
}

createRoot(document.getElementById('root')!).render(<App />);
