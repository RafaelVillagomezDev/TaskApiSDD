import type { RequestHandler } from 'express';

// Ni el navegador ni ningún intermediario pueden guardar la respuesta: lleva el token CSRF de la sesión
// (RNF-03 de la 003). Se monta antes que la sesión para que también los errores lleven la cabecera (D-3)
export const noStoreMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
