/**
 * Testimonials: "send someone a link, they leave a review, you choose what shows".
 *
 * The admin creates a review request for a person; its random id is the link
 * (/review/<id>). The person submits a rating, text, name, role, company and an
 * optional photo. Every submission arrives hidden; the admin switches each one on
 * or off and can pin favourites. The website reads only the shown ones.
 *
 * Photos are stored inline as small JPEG data URLs (resized in the browser), or
 * as the reviewer's Google profile photo URL, so no file storage is needed.
 */

import crypto from 'crypto';
import { adminDb } from '../firebase-admin';
import type { AdminTestimonial, PublicReviewRequest, PublicTestimonial } from '@shared/api';

const col = () => adminDb.collection('testimonials');

export type TestimonialStatus = 'requested' | 'hidden' | 'shown';

export interface TestimonialDoc {
  requestName: string;
  note?: string;
  createdAt: string;
  createdBy: string;
  status: TestimonialStatus;
  pinned: boolean;
  submittedAt?: string;
  rating?: number;
  text?: string;
  name?: string;
  role?: string;
  company?: string;
  linkedin?: string;
  /** data:image/jpeg;base64,... (uploaded) */
  photoData?: string;
  /** https://lh3.googleusercontent.com/... (from the reviewer's Google sign-in) */
  photoUrl?: string;
  submittedByUid?: string;
  submittedByEmail?: string;
}

export class TestimonialError extends Error {
  constructor(message: string, public status = 400, public code = 'BAD_REQUEST') {
    super(message);
  }
}

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function newReviewId(): string {
  const bytes = crypto.randomBytes(20);
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}

const validId = (id: string) => /^[A-Za-z0-9]{12,40}$/.test(id);

export async function createReviewRequest(opts: { name: string; note?: string; createdBy: string; appUrl: string }): Promise<{ id: string; link: string }> {
  const id = newReviewId();
  const doc: TestimonialDoc = {
    requestName: opts.name,
    ...(opts.note ? { note: opts.note } : {}),
    createdAt: new Date().toISOString(),
    createdBy: opts.createdBy,
    status: 'requested',
    pinned: false,
  };
  await col().doc(id).set(doc);
  return { id, link: `${opts.appUrl}/review/${id}` };
}

export async function lookupReviewRequest(id: string): Promise<PublicReviewRequest> {
  if (!validId(id)) return { valid: false };
  const snap = await col().doc(id).get();
  if (!snap.exists) return { valid: false };
  const d = snap.data() as TestimonialDoc;
  const firstName = d.requestName.split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, '');
  return { valid: true, ...(firstName ? { firstName } : {}), submitted: d.status !== 'requested' };
}

export interface ReviewInput {
  rating: number;
  text: string;
  name: string;
  role?: string;
  company?: string;
  linkedin?: string;
  photoData?: string;
  photoUrl?: string;
  uid?: string;
  email?: string;
}

const PHOTO_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_PHOTO_CHARS = 200_000;

export function isAllowedPhotoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)googleusercontent\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

export function isLinkedInUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)linkedin\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Saves (or replaces) a submission. It always lands hidden, even if a previous version was shown. */
export async function submitReview(id: string, input: ReviewInput): Promise<void> {
  if (!validId(id)) throw new TestimonialError('This review link is not valid.', 404, 'NOT_FOUND');
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new TestimonialError('This review link is not valid.', 404, 'NOT_FOUND');
  if (input.photoData && (!PHOTO_DATA.test(input.photoData) || input.photoData.length > MAX_PHOTO_CHARS)) {
    throw new TestimonialError('That photo could not be used. Try a smaller JPEG or PNG.');
  }
  if (input.photoUrl && !isAllowedPhotoUrl(input.photoUrl)) throw new TestimonialError('That photo link could not be used.');
  if (input.linkedin && !isLinkedInUrl(input.linkedin)) throw new TestimonialError('Enter a linkedin.com profile link, or leave it empty.');

  const prev = snap.data() as TestimonialDoc;
  const next: TestimonialDoc = {
    requestName: prev.requestName,
    ...(prev.note ? { note: prev.note } : {}),
    createdAt: prev.createdAt,
    createdBy: prev.createdBy,
    status: 'hidden',
    pinned: false,
    submittedAt: new Date().toISOString(),
    rating: input.rating,
    text: input.text,
    name: input.name,
    ...(input.role ? { role: input.role } : {}),
    ...(input.company ? { company: input.company } : {}),
    ...(input.linkedin ? { linkedin: input.linkedin } : {}),
    ...(input.photoData ? { photoData: input.photoData } : input.photoUrl ? { photoUrl: input.photoUrl } : {}),
    ...(input.uid ? { submittedByUid: input.uid } : {}),
    ...(input.email ? { submittedByEmail: input.email } : {}),
  };
  await ref.set(next);
}

const hasPhoto = (d: TestimonialDoc) => !!(d.photoData || d.photoUrl);

export async function listAdminTestimonials(appUrl: string): Promise<AdminTestimonial[]> {
  const snap = await col().get();
  return snap.docs
    .map((s) => {
      const d = s.data() as TestimonialDoc;
      const { photoData: _p, photoUrl: _u, ...rest } = d;
      return {
        id: s.id,
        ...rest,
        link: `${appUrl}/review/${s.id}`,
        // Admin-only response, so the photo itself is included (hidden ones have no public URL).
        photo: d.photoData || d.photoUrl || null,
      } as AdminTestimonial;
    })
    .sort((a, b) => (b.submittedAt || b.createdAt).localeCompare(a.submittedAt || a.createdAt));
}

export async function updateTestimonial(id: string, patch: { shown?: boolean; pinned?: boolean }): Promise<void> {
  if (!validId(id)) throw new TestimonialError('Not found.', 404, 'NOT_FOUND');
  const ref = col().doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new TestimonialError('Not found.', 404, 'NOT_FOUND');
  const d = snap.data() as TestimonialDoc;
  if (d.status === 'requested' && patch.shown !== undefined) throw new TestimonialError('Nothing has been submitted on this link yet.');
  await ref.update({
    ...(patch.shown !== undefined ? { status: patch.shown ? 'shown' : 'hidden' } : {}),
    ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
  });
}

export async function deleteTestimonial(id: string): Promise<void> {
  if (!validId(id)) throw new TestimonialError('Not found.', 404, 'NOT_FOUND');
  await col().doc(id).delete();
}

/** What the website shows: pinned first, then newest. */
export async function listPublicTestimonials(appUrl: string): Promise<PublicTestimonial[]> {
  const snap = await col().where('status', '==', 'shown').get();
  return snap.docs
    .map((s) => ({ id: s.id, d: s.data() as TestimonialDoc }))
    .sort((a, b) => Number(b.d.pinned) - Number(a.d.pinned) || (b.d.submittedAt || '').localeCompare(a.d.submittedAt || ''))
    .map(({ id, d }) => ({
      id,
      name: d.name || d.requestName,
      role: d.role || null,
      company: d.company || null,
      linkedin: d.linkedin || null,
      rating: d.rating || 5,
      text: d.text || '',
      photo: hasPhoto(d) ? `${appUrl}/api/public/testimonials/${id}/photo` : null,
      pinned: d.pinned,
      date: d.submittedAt || d.createdAt,
    }));
}

/** The photo bytes (uploaded) or a redirect target (Google), for shown testimonials only. */
export async function getTestimonialPhoto(id: string): Promise<{ type: string; data: Buffer } | { redirect: string } | null> {
  if (!validId(id)) return null;
  const snap = await col().doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() as TestimonialDoc;
  if (d.status !== 'shown') return null;
  if (d.photoData) {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(d.photoData);
    if (!m) return null;
    return { type: m[1], data: Buffer.from(m[2], 'base64') };
  }
  if (d.photoUrl && isAllowedPhotoUrl(d.photoUrl)) return { redirect: d.photoUrl };
  return null;
}
