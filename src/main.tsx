import { render } from 'preact';
import '@fontsource/public-sans/latin-400.css';
import '@fontsource/public-sans/latin-400-italic.css';
import '@fontsource/public-sans/latin-600.css';
import '@fontsource/public-sans/latin-ext-400.css';
import '@fontsource/public-sans/latin-ext-600.css';
import './styles/app.css';
import { App } from './ui/App';

const root = document.getElementById('app') as HTMLElement;
root.replaceChildren(); // drop the "could not start" note from index.html
render(<App />, root);
