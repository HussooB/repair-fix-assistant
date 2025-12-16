// src/db/cacheHelpers.js
import { prisma } from './prisma.js';

/**
 * Generic getCache function for any key prefix
 */
export async function getCache(prefix, query) {
  const key = `${prefix}:${query}`;
  const record = await prisma.toolCache.findUnique({
    where: { key },
  });
  return record?.value || null;
}

/**
 * Generic setCache function for any key prefix
 */
export async function setCache(prefix, query, value) {
  const key = `${prefix}:${query}`;
  await prisma.toolCache.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  return value;
}

/**
 * Convenience wrappers
 */
export const getCachedGuide = (query) => getCache('ifixit', query);
export const setCachedGuide = (query, value) => setCache('ifixit', query, value);

export const getCachedWeb = (query) => getCache('web', query);
export const setCachedWeb = (query, value) => setCache('web', query, value);
