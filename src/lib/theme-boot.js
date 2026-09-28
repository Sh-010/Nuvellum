// Pre-paint reading-mode bootstrap, shared by the homepage renderer and the interior/article shell.
// THEME_HEAD runs in <head>, before anything paints: with a stored night preference it gives the
// root the night paper colour and a dark color-scheme, so navigation never flashes ivory.
// THEME_BODY runs as the first thing in <body>: it moves the preference onto body.night (where the
// stylesheets' night tokens live) and hands the canvas back to the body background, so later
// day/night toggles behave exactly as before. Key: localStorage 'nuvellum-theme' ('night' | 'day').
export const NIGHT_PAPER = '#161412';

export const THEME_HEAD = `try{var d=document.documentElement,n=localStorage.getItem('nuvellum-theme')==='night';d.style.colorScheme=n?'dark':'light';if(n){d.classList.add('theme-night');d.style.backgroundColor='${NIGHT_PAPER}'}}catch(e){}`;

export const THEME_BODY = `try{var d=document.documentElement;if(d.classList.contains('theme-night')){document.body.classList.add('night');d.classList.remove('theme-night');d.style.backgroundColor=''}}catch(e){}`;
