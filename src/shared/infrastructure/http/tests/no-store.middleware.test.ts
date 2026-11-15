import type { NextFunction, Request, Response } from 'express';

import { noStoreMiddleware } from '../no-store.middleware.js';

describe('noStoreMiddleware', () => {
  it('prohíbe guardar la respuesta en cualquier caché y deja seguir la petición (RNF-03 de la 003)', () => {
    const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => (headers[name] = value) } as unknown as Response;
    const next = import.meta.jest.fn();

    noStoreMiddleware({} as Request, res, next as unknown as NextFunction);

    expect(headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(next).toHaveBeenCalledWith();
  });
});
