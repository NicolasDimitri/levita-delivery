// src/lib/env.js
// Utilitários de ambiente pra uso no frontend.
//
// Como usar:
//   import { isDev, isProd } from './lib/env'
//   if (isDev) console.log('rodando em desenvolvimento')

export const isDev = import.meta.env.MODE === 'development';
export const isProd = import.meta.env.MODE === 'production';

// true se estiver rodando com Docker localmente (via vite dev server)
// false se for o build de produção servido pelo Vercel
export const isLocal = isDev && typeof window !== 'undefined' && window.location.hostname === 'localhost';
