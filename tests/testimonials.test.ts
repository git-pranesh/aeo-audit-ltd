import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import './setup';
import { registerRoutes } from '../server/routes';

let server: Server;
let base = '';

beforeAll(() => {
  process.env.ADMIN_EMAILS = 'admin@example.com';
  const app = express();
  app.use(express.json({ limit: '400kb' }));
  registerRoutes(app);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const ADMIN = 'a1:admin@example.com:true';
const call = (method: string, path: string, token?: string, body?: unknown) =>
  fetch(base + path, {
    method,
    redirect: 'manual',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

const review = {
  rating: 5,
  text: 'It showed which competitors the AI engines named instead of us, and the fix list was clear.',
  name: 'Stella Park',
  role: 'Founder',
  company: 'Acme',
  linkedin: 'https://www.linkedin.com/in/stella',
  consent: true,
};
const tinyJpeg = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');

async function newRequest(name = 'Stella Park') {
  const res = await call('POST', '/api/admin/testimonials', ADMIN, { name, note: 'LinkedIn' });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; link: string };
}

describe('testimonials', () => {
  it('only admins can create review links or see submissions', async () => {
    expect((await call('POST', '/api/admin/testimonials', 'u1:user@example.com:true', { name: 'x' })).status).toBe(403);
    expect((await call('GET', '/api/admin/testimonials', 'u1:user@example.com:true')).status).toBe(403);
  });

  it('a review link shows who it is for, then accepts a submission that lands hidden', async () => {
    const { id, link } = await newRequest();
    expect(link).toMatch(new RegExp(`/review/${id}$`));
    expect(await (await call('GET', `/api/public/review/${id}`)).json()).toEqual({ valid: true, firstName: 'Stella', submitted: false });

    const sent = await call('POST', `/api/public/review/${id}`, undefined, { ...review, photoData: tinyJpeg });
    expect(sent.status).toBe(200);
    expect((await (await call('GET', `/api/public/review/${id}`)).json()).submitted).toBe(true);

    // Hidden: not on the wall, photo not public.
    expect((await (await call('GET', '/api/public/testimonials')).json()).testimonials).toEqual([]);
    expect((await call('GET', `/api/public/testimonials/${id}/photo`)).status).toBe(404);

    const admin = (await (await call('GET', '/api/admin/testimonials', ADMIN)).json()).testimonials;
    expect(admin).toHaveLength(1);
    expect(admin[0]).toMatchObject({ id, status: 'hidden', name: 'Stella Park', role: 'Founder', company: 'Acme', rating: 5, photo: tinyJpeg });
  });

  it('show, pin, hide and delete control the wall', async () => {
    const a = await newRequest('First Person');
    const b = await newRequest('Second Person');
    await call('POST', `/api/public/review/${a.id}`, undefined, { ...review, name: 'First Person', photoData: tinyJpeg });
    await call('POST', `/api/public/review/${b.id}`, undefined, { ...review, name: 'Second Person' });

    expect((await call('POST', `/api/admin/testimonials/${a.id}`, ADMIN, { shown: true })).status).toBe(200);
    expect((await call('POST', `/api/admin/testimonials/${b.id}`, ADMIN, { shown: true, pinned: true })).status).toBe(200);
    let wall = (await (await call('GET', '/api/public/testimonials')).json()).testimonials;
    expect(wall.map((t: any) => t.name)).toEqual(['Second Person', 'First Person']);
    expect(wall[1].photo).toMatch(new RegExp(`/api/public/testimonials/${a.id}/photo$`));
    expect(wall[0].photo).toBeNull();
    // Admin-only fields never reach the website.
    expect(Object.keys(wall[0]).sort()).toEqual(['company', 'date', 'id', 'linkedin', 'name', 'photo', 'pinned', 'rating', 'role', 'text']);

    const photo = await call('GET', `/api/public/testimonials/${a.id}/photo`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toContain('image/jpeg');

    await call('POST', `/api/admin/testimonials/${b.id}`, ADMIN, { shown: false });
    wall = (await (await call('GET', '/api/public/testimonials')).json()).testimonials;
    expect(wall.map((t: any) => t.name)).toEqual(['First Person']);

    await call('DELETE', `/api/admin/testimonials/${a.id}`, ADMIN);
    expect((await (await call('GET', '/api/public/testimonials')).json()).testimonials).toEqual([]);
    expect((await (await call('GET', `/api/public/review/${a.id}`)).json()).valid).toBe(false);
  });

  it('a new submission on a shown review goes back to hidden', async () => {
    const { id } = await newRequest();
    await call('POST', `/api/public/review/${id}`, undefined, review);
    await call('POST', `/api/admin/testimonials/${id}`, ADMIN, { shown: true });
    await call('POST', `/api/public/review/${id}`, undefined, { ...review, text: 'Changed my mind about one detail, here is the updated version.' });
    expect((await (await call('GET', '/api/public/testimonials')).json()).testimonials).toEqual([]);
  });

  it('rejects bad input and unknown links', async () => {
    const { id } = await newRequest();
    expect((await call('POST', `/api/public/review/${id}`, undefined, { ...review, consent: false })).status).toBe(400);
    expect((await call('POST', `/api/public/review/${id}`, undefined, { ...review, text: 'Too short' })).status).toBe(400);
    expect((await call('POST', `/api/public/review/${id}`, undefined, { ...review, rating: 6 })).status).toBe(400);
    expect((await call('POST', `/api/public/review/${id}`, undefined, { ...review, linkedin: 'https://evil.example.com/x' })).status).toBe(400);
    expect((await call('POST', `/api/public/review/${id}`, undefined, { ...review, photoUrl: 'https://evil.example.com/a.png' })).status).toBe(400);
    expect((await call('POST', `/api/public/review/${id}`, undefined, { ...review, photoData: 'data:text/html;base64,PHNjcmlwdD4=' })).status).toBe(400);
    expect((await call('POST', '/api/public/review/doesNotExist12345', undefined, review)).status).toBe(404);
    expect((await (await call('GET', '/api/public/review/bad!id')).json()).valid).toBe(false);
    // Showing a link that has no submission yet is refused.
    expect((await call('POST', `/api/admin/testimonials/${id}`, ADMIN, { shown: true })).status).toBe(400);
  });

  it('a Google profile photo is served by redirect once shown', async () => {
    const { id } = await newRequest();
    await call('POST', `/api/public/review/${id}`, 'u9:stella@example.com:true', { ...review, photoUrl: 'https://lh3.googleusercontent.com/a/abc=s96-c' });
    await call('POST', `/api/admin/testimonials/${id}`, ADMIN, { shown: true });
    const res = await call('GET', `/api/public/testimonials/${id}/photo`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://lh3.googleusercontent.com/a/abc=s96-c');
    const admin = (await (await call('GET', '/api/admin/testimonials', ADMIN)).json()).testimonials;
    expect(admin[0].submittedByEmail).toBe('stella@example.com');
  });
});
